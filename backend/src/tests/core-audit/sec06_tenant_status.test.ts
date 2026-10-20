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

    it('allows settling and closing existing sessions when suspended, while blocking new table opens and mutations', async () => {
        // 1. In active status, open a table session and insert an order
        await query(`UPDATE tenants SET status = 'active' WHERE id = $1`, [tenantId]);
        const tableRes = await query(`SELECT id FROM tables WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        const testTableId = tableRes.rows[0].id;

        const openRes = await fetch(`${baseUrl}/api/v1/staff/tables/${testTableId}/open`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        expect(openRes.status).toBe(201);
        const { sessionId } = await openRes.json() as any;

        // Insert an order item for this session
        const itemRes = await query(`SELECT id, price FROM menu_items WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        const menuItem = itemRes.rows[0];
        const orderRes = await query(`
            INSERT INTO orders (tenant_id, session_id, order_number, idempotency_key, source)
            VALUES ($1, $2, 999, gen_random_uuid()::text, 'STAFF_POS')
            RETURNING id
        `, [tenantId, sessionId]);
        const orderId = orderRes.rows[0].id;
        const orderItemRes = await query(`
            INSERT INTO order_items (tenant_id, order_id, menu_item_id, snapshot_name, snapshot_price, quantity)
            VALUES ($1, $2, $3, 'Món Test', $4, 1)
            RETURNING id
        `, [tenantId, orderId, menuItem.id, menuItem.price]);
        await query(`
            INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity)
            VALUES ($1, $2, 'ACCEPTED', 1)
        `, [tenantId, orderItemRes.rows[0].id]);

        // 2. Transition tenant to SUSPENDED
        await query(`UPDATE tenants SET status = 'suspended' WHERE id = $1`, [tenantId]);

        // 3. Opening a new table session is BLOCKED with SHOP_SUSPENDED
        const otherTableRes = await query(`SELECT id FROM tables WHERE tenant_id = $1 AND id != $2 LIMIT 1`, [tenantId, testTableId]);
        if (otherTableRes.rows.length > 0) {
            const blockOpenRes = await fetch(`${baseUrl}/api/v1/staff/tables/${otherTableRes.rows[0].id}/open`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${managerToken}`,
                    'x-tenant-id': tenantId,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
            expect(blockOpenRes.status).toBe(403);
            const errData: any = await blockOpenRes.json();
            expect(errData.error).toBe('SHOP_SUSPENDED');
        }

        // 4. Serving existing session order items is ALLOWED
        const serveRes = await fetch(`${baseUrl}/api/v1/staff/sessions/${sessionId}/serve-all`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(serveRes.status).toBe(200);

        // 5. Reading bill summary is ALLOWED
        const billRes = await fetch(`${baseUrl}/api/v1/staff/sessions/${sessionId}/bill-summary`, {
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(billRes.status).toBe(200);
        const billData: any = await billRes.json();

        // 6. Confirming payment and closing existing session is ALLOWED
        const payRes = await fetch(`${baseUrl}/api/v1/staff/sessions/${sessionId}/confirm-payment-and-close`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                settlementVersion: billData.settlementVersion,
                expectedAmount: billData.validBillTotal
            })
        });
        expect(payRes.status).toBe(200);

        // 7. Marking table ready is ALLOWED
        const readyRes = await fetch(`${baseUrl}/api/v1/staff/tables/${testTableId}/mark-ready`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(readyRes.status).toBe(200);
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
