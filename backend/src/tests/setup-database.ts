import 'dotenv/config';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Never migrate, truncate or seed the developer/production database during tests.
export default async function setup() {
    const source = new URL(process.env.TEST_DATABASE_ADMIN_URL || process.env.DATABASE_URL || 'postgres://admin:@localhost:5432/qr_order_db');
    source.pathname = '/postgres';
    const admin = new pg.Client({ connectionString: source.toString() });
    await admin.connect();
    const name = `qr_order_test_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    source.pathname = `/${name}`;
    process.env.DATABASE_URL = source.toString();
    const cleanup = async () => {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await admin.end();
    };
    try {
        for (const script of ['src/db/migrate.ts', 'src/db/seed.ts']) {
            execFileSync(process.execPath, ['--import', 'tsx', script], {
                env: { ...process.env, NODE_ENV: 'test' }, stdio: 'pipe'
            });
        }
    } catch (err) {
        await cleanup();
        throw err;
    }
    return cleanup;
}
