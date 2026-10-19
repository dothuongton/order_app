import pg from 'pg';
import { transactionEffects } from '../utils/transaction-effects.js';
import { config } from '../config/index.js';

const { Pool } = pg;

export const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
    return pool.query<T>(text, params);
}

export async function withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const effects: Array<() => void | Promise<unknown>> = [];
        const result = await transactionEffects.run(effects, () => callback(client));
        await client.query('COMMIT');
        for (const effect of effects) {
            try { Promise.resolve(effect()).catch(err => console.error('Post-commit notification failed:', err.message)); }
            catch (err) { console.error('Post-commit notification failed'); }
        }
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
