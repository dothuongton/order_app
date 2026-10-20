import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../../app.js';
import { query } from '../../db/pool.js';
import { seed } from '../../db/seed.js';

describe('SEC-06: Tenant Status Lifecycle & Operational Matrix (Issue #6)', () => {
    let server: http.Server;
    let baseUrl: string;
    let tenantId: string;
    let managerToken: string;

    beforeAll(async () => {
        await seed();

        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        const tenantRes = await query(`SELECT id FROM tenants WHERE slug = 'pho-co'`);
        tenantId = tenantRes.rows[0].id;

        // Login as manager
        const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@phoco.vn', password: '123456' })
        });
        const loginData: any = await loginRes.json();
        managerToken = loginData.token;
    });

    afterAll(async () => {
        // Restore active status
        await query(`UPDATE tenants SET status = 'active' WHERE id = $1`, [tenantId]);
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    it('allows full access when tenant status is active', async () => {
        await query(`UPDATE tenants SET status = 'active' WHERE id = $1`, [tenantId]);

        const res = await fetch(`${baseUrl}/api/v1/staff/dashboard/snapshot`, {
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(res.status).toBe(200);
    });

    it('blocks mutations but allows reads and settlements when tenant status is suspended', async () => {
        await query(`UPDATE tenants SET status = 'suspended' WHERE id = $1`, [tenantId]);

        // 1. GET requests (viewing snapshot/reports) are ALLOWED
        const getRes = await fetch(`${baseUrl}/api/v1/staff/dashboard/snapshot`, {
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(getRes.status).toBe(200);

        // 2. Mutations like creating categories are BLOCKED with SHOP_SUSPENDED
        const postRes = await fetch(`${baseUrl}/api/v1/staff/menu/categories`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: 'Danh Mục Tạm' })
        });
        expect(postRes.status).toBe(403);
        const data: any = await postRes.json();
        expect(data.error).toBe('SHOP_SUSPENDED');
    });

    it('blocks staff access when tenant status is archived', async () => {
        await query(`UPDATE tenants SET status = 'archived' WHERE id = $1`, [tenantId]);

        const res = await fetch(`${baseUrl}/api/v1/staff/dashboard/snapshot`, {
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(res.status).toBe(403);
        const data: any = await res.json();
        expect(data.error).toBe('SHOP_ARCHIVED');
    });
});
