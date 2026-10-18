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
        console.log('✅ Migrations completed successfully.');
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
