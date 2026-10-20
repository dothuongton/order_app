import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../../app.js';
import { pool, query } from '../../db/pool.js';
import { ensureSchemaOnBoot } from '../../db/auto-migrate.js';
import { migrate } from '../../db/migrate.js';

describe('OPS-01: Startup Error Propagation, Migration Tracking, and Health Probes (Issue #14)', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
        server = http.createServer(app);
        await new Promise<void>((resolve) => {
            server.listen(0, () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('provides distinct /health/liveness and /health/readiness probes', async () => {
        // 1. Liveness check
        const livenessRes = await fetch(`${baseUrl}/health/liveness`);
        expect(livenessRes.status).toBe(200);
        const livenessBody = await livenessRes.json() as any;
        expect(livenessBody.status).toBe('ok');
        expect(livenessBody.check).toBe('liveness');

        // 2. Readiness check
        const readinessRes = await fetch(`${baseUrl}/health/readiness`);
        expect(readinessRes.status).toBe(200);
        const readinessBody = await readinessRes.json() as any;
        expect(readinessBody.status).toBe('ok');
        expect(readinessBody.check).toBe('readiness');
        expect(readinessBody.database).toBe('connected');

        // 3. /health probe for general backward compatibility
        const healthRes = await fetch(`${baseUrl}/health`);
        expect(healthRes.status).toBe(200);
        const healthBody = await healthRes.json() as any;
        expect(healthBody.status).toBe('ok');
    });

    it('returns 503 from /health/readiness without leaking secrets when DB is unavailable', async () => {
        const querySpy = vi.spyOn(pool, 'query').mockRejectedValue(new Error('password=supersecret connection to server at localhost failed'));

        const res = await fetch(`${baseUrl}/health/readiness`);
        expect(res.status).toBe(503);
        const body = await res.json() as any;
        expect(body.status).toBe('error');
        expect(body.check).toBe('readiness');
        expect(body.database).toBe('disconnected');
        expect(body.message).toBe('Database service unavailable');
        
        // Assert no connection strings, passwords, or stack traces are leaked
        const bodyStr = JSON.stringify(body);
        expect(bodyStr).not.toContain('password');
        expect(bodyStr).not.toContain('supersecret');
        expect(bodyStr).not.toContain('postgres://');
        expect(bodyStr).not.toContain('stack');

        querySpy.mockRestore();
    });

    it('ensures schema_migrations table tracks migrations idempotently across repeated runs', async () => {
        // Run migration
        await migrate();

        // Check tracking table
        const res = await query(`SELECT filename FROM schema_migrations ORDER BY filename ASC`);
        const filenames = res.rows.map(r => r.filename);
        expect(filenames).toContain('000_base_schema.sql');
        expect(filenames).toContain('003_revoked_staff_tokens.sql');

        // Running migrate again should skip applied migrations safely
        await expect(migrate()).resolves.not.toThrow();
    });

    it('creates revoked_staff_tokens table consistently', async () => {
        await ensureSchemaOnBoot();

        const checkRes = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'revoked_staff_tokens'
        `);
        expect(checkRes.rows.length).toBe(1);
    });

    it('propagates database errors out of ensureSchemaOnBoot so server fail-fast is guaranteed', async () => {
        const connectSpy = vi.spyOn(pool, 'connect').mockRejectedValueOnce(new Error('FATAL: connection limit exceeded'));

        await expect(ensureSchemaOnBoot()).rejects.toThrow('FATAL: connection limit exceeded');

        connectSpy.mockRestore();
    });

    it('returns 503 schema_incomplete from /health/readiness when required migration revision is missing (Issue #32)', async () => {
        // Temporarily delete required 008 migration from schema_migrations
        await query(`DELETE FROM schema_migrations WHERE filename = '008_promotion_redemption_snapshots.sql'`);

        const res = await fetch(`${baseUrl}/health/readiness`);
        expect(res.status).toBe(503);
        const body: any = await res.json();
        expect(body.status).toBe('error');
        expect(body.database).toBe('schema_incomplete');

        // Restore migration record
        await query(`INSERT INTO schema_migrations (filename) VALUES ('008_promotion_redemption_snapshots.sql') ON CONFLICT DO NOTHING`);

        const resRestored = await fetch(`${baseUrl}/health/readiness`);
        expect(resRestored.status).toBe(200);
    });

    it('classifies malformed JSON as 400 BAD_REQUEST without leaking parser internals or request body (Issue #36)', async () => {
        const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"username": "admin", "password":'
        });

        expect(res.status).toBe(400);
        const body: any = await res.json();
        expect(body.error).toBe('BAD_REQUEST');
        expect(body.message).not.toMatch(/JSON|SyntaxError|position|Unexpected/i);
    });
});
