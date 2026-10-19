import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function migrate() {
    console.log('🔄 Running database migrations...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');

    const client = await pool.connect();
    try {
        await client.query(sql);
        console.log('✅ Base schema & updates applied successfully.');

        // Also run migrations directory if present
        const migrationsDir = path.join(__dirname, 'migrations');
        if (fs.existsSync(migrationsDir)) {
            const files = fs.readdirSync(migrationsDir)
                .filter((f) => f.endsWith('.sql') && !f.includes('_down'))
                .sort();

            for (const file of files) {
                console.log(`➡️ Running migration: ${file}`);
                const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
                await client.query(migrationSql);
            }
            console.log('✅ All migration files applied successfully.');
        }

        // Ensure Super Admin user exists with valid password
        await client.query(`
            INSERT INTO users (id, email, password_hash, full_name, phone, is_platform_admin)
            VALUES (
                '99999999-9999-9999-9999-999999999999',
                'superadmin@qrorder.vn',
                '$2a$10$cweMWdM3s.7gdRP1Mi5ulexKStDHK0qpYvk7mVeVKtHZaf1vU3Hva',
                'Hệ Thống Super Admin',
                '0999999999',
                true
            )
            ON CONFLICT (email) DO UPDATE SET
                is_platform_admin = true,
                password_hash = EXCLUDED.password_hash,
                full_name = 'Hệ Thống Super Admin';
        `);
        console.log('✅ Super Admin account verified: superadmin@qrorder.vn / admin123');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}
