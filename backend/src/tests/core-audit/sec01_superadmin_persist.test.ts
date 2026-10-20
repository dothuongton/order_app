import { describe, it, expect, beforeAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { query } from '../../db/pool.js';
import { seed } from '../../db/seed.js';
import { ensureSchemaOnBoot } from '../../db/auto-migrate.js';
import { migrate } from '../../db/migrate.js';

describe('SEC-01: Super Admin password & role persistence (Issue #3)', () => {
    beforeAll(async () => {
        await seed();
    });

    it('retains custom password hash and role across ensureSchemaOnBoot, migrate, and seed without resetting or auto-elevating', async () => {
        // 1. Establish custom password hash and non-elevated flag
        const customPassword = 'VeryStrong!CustomPassword987#';
        const customHash = await bcrypt.hash(customPassword, 10);
        const customName = 'Admin Do Not Reset';

        await query(`
            UPDATE users 
            SET password_hash = $1, full_name = $2, is_platform_admin = false 
            WHERE email = 'superadmin@qrorder.vn'
        `, [customHash, customName]);

        // 2. Execute ensureSchemaOnBoot() (simulating server restart)
        await ensureSchemaOnBoot();

        let res = await query(`
            SELECT password_hash, full_name, is_platform_admin 
            FROM users 
            WHERE email = 'superadmin@qrorder.vn'
        `);
        expect(res.rows[0].password_hash).toBe(customHash);
        expect(res.rows[0].full_name).toBe(customName);
        expect(res.rows[0].is_platform_admin).toBe(false);

        // 3. Execute migrate() (simulating database migration rerun)
        await migrate();

        res = await query(`
            SELECT password_hash, full_name, is_platform_admin 
            FROM users 
            WHERE email = 'superadmin@qrorder.vn'
        `);
        expect(res.rows[0].password_hash).toBe(customHash);
        expect(res.rows[0].full_name).toBe(customName);
        expect(res.rows[0].is_platform_admin).toBe(false);

        // 4. Execute seed() with operational data check (simulating runtime restart with AUTO_SEED check)
        await seed(false);

        res = await query(`
            SELECT password_hash, full_name, is_platform_admin 
            FROM users 
            WHERE email = 'superadmin@qrorder.vn'
        `);
        expect(res.rows[0].password_hash).toBe(customHash);
        expect(res.rows[0].full_name).toBe(customName);
        expect(res.rows[0].is_platform_admin).toBe(false);

        // 5. Restore superadmin credentials so other test suites can authenticate cleanly
        const defaultHash = await bcrypt.hash('admin123', 10);
        await query(`
            UPDATE users 
            SET password_hash = $1, full_name = 'Hệ Thống Super Admin', is_platform_admin = true 
            WHERE email = 'superadmin@qrorder.vn'
        `, [defaultHash]);
    });

    it('does not create default superadmin user when running migrations on a database without admin', async () => {
        // Temporarily delete superadmin account
        await query(`DELETE FROM users WHERE email = 'superadmin@qrorder.vn'`);

        // Remove 004 migration record from tracking table to simulate re-running migration
        await query(`DELETE FROM schema_migrations WHERE filename = '004_superadmin_user.sql'`);

        // Execute migration
        await migrate();

        // Verify superadmin was NOT automatically inserted with default credentials
        const checkRes = await query(`SELECT 1 FROM users WHERE email = 'superadmin@qrorder.vn'`);
        expect(checkRes.rowCount).toBe(0);

        // Restore superadmin for subsequent test suites
        const defaultHash = await bcrypt.hash('admin123', 10);
        await query(`
            INSERT INTO users (id, email, password_hash, full_name, phone, is_platform_admin)
            VALUES ('99999999-9999-9999-9999-999999999999', 'superadmin@qrorder.vn', $1, 'Hệ Thống Super Admin', '0999999999', true)
            ON CONFLICT (email) DO NOTHING
        `, [defaultHash]);
    });
});
