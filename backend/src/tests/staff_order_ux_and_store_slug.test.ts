import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { app } from '../app.js';
import { query, pool } from '../db/pool.js';
import { seed } from '../db/seed.js';

describe('Staff Order UX & Store Slug Endpoint Tests', () => {
    let server: any;
    let baseUrl: string;
    let staffToken: string;
    let tenantId: string;

    beforeAll(async () => {
        await seed(true);

        server = http.createServer(app);
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        // Login as manager
        const staffRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@phoco.vn', password: '123456' })
        });
        expect(staffRes.status).toBe(200);
        const staffData: any = await staffRes.json();
        staffToken = staffData.token;

        const tenantRes = await query(`SELECT id FROM tenants LIMIT 1`);
        tenantId = tenantRes.rows[0].id;
    });

    afterAll(async () => {
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    it('returns store details and default QR id for /api/v1/public/stores/pho-co', async () => {
        const res = await fetch(`${baseUrl}/api/v1/public/stores/pho-co`);
        expect(res.status).toBe(200);
        const data: any = await res.json();
        expect(data.tenant).toBeDefined();
        expect(data.defaultQrId).toBeDefined();
    });

    it('returns store details when slug is updated to ola-ngon-ngot', async () => {
        await query(`UPDATE tenants SET slug = 'ola-ngon-ngot' WHERE id = $1`, [tenantId]);

        const resOla = await fetch(`${baseUrl}/api/v1/public/stores/ola-ngon-ngot`);
        expect(resOla.status).toBe(200);
        const dataOla: any = await resOla.json();
        expect(dataOla.tenant.slug).toBe('ola-ngon-ngot');

        // Backwards compatibility lookup for pho-co still resolves ola-ngon-ngot
        const resLegacy = await fetch(`${baseUrl}/api/v1/public/stores/pho-co`);
        expect(resLegacy.status).toBe(200);
        const dataLegacy: any = await resLegacy.json();
        expect(dataLegacy.tenant.slug).toBe('ola-ngon-ngot');

        // Restore for clean state
        await query(`UPDATE tenants SET slug = 'pho-co' WHERE id = $1`, [tenantId]);
    });

    it('returns 404 for non-existent store slug', async () => {
        const res = await fetch(`${baseUrl}/api/v1/public/stores/non-existent-store-slug-999`);
        expect(res.status).toBe(404);
        const data: any = await res.json();
        expect(data.error).toBe('STORE_NOT_FOUND');
    });

    it('exposes createdAt timestamp on table active order items in staff dashboard', async () => {
        const res = await fetch(`${baseUrl}/api/v1/staff/dashboard/snapshot`, {
            headers: { Authorization: `Bearer ${staffToken}` }
        });
        expect(res.status).toBe(200);
        const data: any = await res.json();
        expect(Array.isArray(data.tables)).toBe(true);
        // Find a table with items if any
        for (const tbl of data.tables) {
            if (tbl.items && tbl.items.length > 0) {
                for (const item of tbl.items) {
                    expect(item.orderNumber).toBeDefined();
                    expect(item.createdAt).toBeDefined();
                }
            }
        }
    });
});
