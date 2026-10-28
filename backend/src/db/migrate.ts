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
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // Check and apply base schema if not tracked
        const baseRes = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', ['000_base_schema.sql']);
        if (baseRes.rowCount === 0) {
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', ['000_base_schema.sql']);
            console.log('✅ Base schema applied successfully.');
        } else {
            console.log('⏩ Base schema already recorded.');
        }

        // Also run migrations directory if present
        const migrationsDir = path.join(__dirname, 'migrations');
        if (fs.existsSync(migrationsDir)) {
            const files = fs.readdirSync(migrationsDir)
                .filter((f) => f.endsWith('.sql') && !f.includes('_down'))
                .sort();

            for (const file of files) {
                const checkRes = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
                if (checkRes.rowCount === 0) {
                    console.log(`➡️ Running migration: ${file}`);
                    const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
                    const isNoTransaction = migrationSql.includes('-- no-transaction');

                    if (isNoTransaction) {
                        await client.query(migrationSql);
                        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
                    } else {
                        await client.query('BEGIN');
                        try {
                            await client.query(migrationSql);
                            await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
                            await client.query('COMMIT');
                        } catch (mErr) {
                            await client.query('ROLLBACK');
                            throw mErr;
                        }
                    }
                } else {
                    console.log(`⏩ Skipping already applied migration: ${file}`);
                }
            }
            console.log('✅ All migration files applied successfully.');
        }
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
