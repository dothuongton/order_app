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

    it('does not recreate a default platform admin when the account is absent during migration', async () => {
        const original = await query(`SELECT * FROM users WHERE is_platform_admin = true`);
        expect(original.rows).toHaveLength(1);
        const user = original.rows[0];
        await query('DELETE FROM users WHERE id = $1', [user.id]);
        try {
            await query(`DELETE FROM schema_migrations WHERE filename = '004_superadmin_user.sql'`);
            await migrate();
            await ensureSchemaOnBoot();
            const result = await query('SELECT id FROM users WHERE is_platform_admin = true');
            expect(result.rows).toHaveLength(0);
        } finally {
            await query(`INSERT INTO users (id, email, password_hash, full_name, phone, is_platform_admin)
                VALUES ($1, $2, $3, $4, $5, true)`,
                [user.id, user.email, user.password_hash, user.full_name, user.phone]);
        }
    });

    it('calling default seed() outside test environment does not wipe markers or operational data (Issue #25)', async () => {
        // Create custom marker record in tenants
        const markerName = 'Safe Seed Marker Tenant';
        await query(`
            INSERT INTO tenants (id, name, slug, status)
            VALUES ('88888888-8888-8888-8888-888888888888', $1, 'safe-seed-marker', 'active')
            ON CONFLICT (id) DO UPDATE SET name = $1
        `, [markerName]);

        const prevEnv = process.env.NODE_ENV;
        try {
            // Simulate development environment (outside test)
            process.env.NODE_ENV = 'development';

            // Call default seed() with no arguments
            await seed();

            // Verify marker record was NOT wiped by seed()
            const check = await query(`SELECT name FROM tenants WHERE id = '88888888-8888-8888-8888-888888888888'`);
            expect(check.rowCount).toBe(1);
            expect(check.rows[0].name).toBe(markerName);
        } finally {
            process.env.NODE_ENV = prevEnv;
            await query(`DELETE FROM tenants WHERE id = '88888888-8888-8888-8888-888888888888'`);
        }
    });
});
