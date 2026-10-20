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

    it('blocks general staff access but allows settling remaining open sessions when tenant is archived (Issue #6, #19)', async () => {
        // Restore to active first to create an open session with served item
        await query(`UPDATE tenants SET status = 'active' WHERE id = $1`, [tenantId]);

        const tableRes = await query(`INSERT INTO tables (tenant_id, table_number, public_qr_id) VALUES ($1, 'T-ARCHIVE', 'qr-archive') RETURNING id`, [tenantId]);
        const archTableId = tableRes.rows[0].id;

        const openRes = await fetch(`${baseUrl}/api/v1/staff/tables/${archTableId}/open`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        expect(openRes.status).toBe(201);
        const openData: any = await openRes.json();
        const archSessionId = openData.sessionId;

        const itemRes = await query(`SELECT id, price FROM menu_items WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        const itemId = itemRes.rows[0].id;
        const itemPrice = Number(itemRes.rows[0].price);

        const orderRes = await query(`
            INSERT INTO orders (tenant_id, session_id, order_number, idempotency_key, source)
            VALUES ($1, $2, 999, gen_random_uuid()::text, 'STAFF_POS')
            RETURNING id
        `, [tenantId, archSessionId]);
        const orderId = orderRes.rows[0].id;

        const orderItemRes = await query(`
            INSERT INTO order_items (tenant_id, order_id, menu_item_id, snapshot_name, snapshot_price, quantity)
            VALUES ($1, $2, $3, 'Món Test Archive', $4, 1)
            RETURNING id
        `, [tenantId, orderId, itemId, itemPrice]);

        await query(`
            INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity)
            VALUES ($1, $2, 'SERVED', 1)
        `, [tenantId, orderItemRes.rows[0].id]);

        // Now tenant is transitioned to ARCHIVED
        await query(`UPDATE tenants SET status = 'archived' WHERE id = $1`, [tenantId]);

        // Creating new menu categories or new tables or opening new sessions is BLOCKED
        const catRes = await fetch(`${baseUrl}/api/v1/staff/menu/categories`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: 'Blocked Category' })
        });
        expect(catRes.status).toBe(403);
        const catData: any = await catRes.json();
        expect(catData.error).toBe('SHOP_ARCHIVED');

        // Reading recovery views (dashboard snapshot, bill summary) is ALLOWED for settling lingering obligations
        const dashRes = await fetch(`${baseUrl}/api/v1/staff/dashboard/snapshot`, {
            headers: { 'Authorization': `Bearer ${managerToken}`, 'x-tenant-id': tenantId }
        });
        expect(dashRes.status).toBe(200);

        // Reading bill summary of the pending session is ALLOWED
        const billRes = await fetch(`${baseUrl}/api/v1/staff/sessions/${archSessionId}/bill-summary`, {
            headers: { 'Authorization': `Bearer ${managerToken}`, 'x-tenant-id': tenantId }
        });
        expect(billRes.status).toBe(200);
        const billData: any = await billRes.json();
        expect(billData.validBillTotal).toBe(itemPrice);

        // Confirming payment and closing the session is ALLOWED so money and ledger are not stuck
        const payRes = await fetch(`${baseUrl}/api/v1/staff/sessions/${archSessionId}/confirm-payment-and-close`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                settlementVersion: billData.settlementVersion,
                expectedAmount: billData.validBillTotal,
                requestId: 'arch-pay-1'
            })
        });
        expect(payRes.status).toBe(200);

        const sessionCheck = await query(`SELECT status FROM table_sessions WHERE id = $1`, [archSessionId]);
        expect(sessionCheck.rows[0].status).toBe('CLOSED');
    });

    it('allows staff to resolve lingering PENDING and ACCEPTED items and settle when shop is archived (Issue #6, #19)', async () => {
        // 1. In active status, open a table session with items in PENDING and ACCEPTED states
        await query(`UPDATE tenants SET status = 'active' WHERE id = $1`, [tenantId]);

        const tableRes = await query(`INSERT INTO tables (tenant_id, table_number, public_qr_id) VALUES ($1, 'T-UNRESOLVED', 'qr-unresolved') RETURNING id`, [tenantId]);
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

        const itemRes = await query(`SELECT id, price FROM menu_items WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        const menuItem = itemRes.rows[0];

        const orderRes = await query(`
            INSERT INTO orders (tenant_id, session_id, order_number, idempotency_key, source)
            VALUES ($1, $2, 1001, gen_random_uuid()::text, 'STAFF_POS')
            RETURNING id
        `, [tenantId, sessionId]);
        const orderId = orderRes.rows[0].id;

        const orderItemRes = await query(`
            INSERT INTO order_items (tenant_id, order_id, menu_item_id, snapshot_name, snapshot_price, quantity)
            VALUES ($1, $2, $3, 'Món Unresolved', $4, 2)
            RETURNING id
        `, [tenantId, orderId, menuItem.id, menuItem.price]);
        const orderItemId = orderItemRes.rows[0].id;

        // One part ACCEPTED, one part PENDING
        await query(`
            INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity)
            VALUES ($1, $2, 'ACCEPTED', 1), ($1, $2, 'PENDING', 1)
        `, [tenantId, orderItemId]);

        // 2. Shop is archived by Super Admin
        await query(`UPDATE tenants SET status = 'archived' WHERE id = $1`, [tenantId]);

        // 3. UI modal can load dashboard snapshot and session bill-summary
        const snapshotRes = await fetch(`${baseUrl}/api/v1/staff/dashboard/snapshot`, {
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(snapshotRes.status).toBe(200);

        const initialBillRes = await fetch(`${baseUrl}/api/v1/staff/sessions/${sessionId}/bill-summary`, {
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(initialBillRes.status).toBe(200);
        const initialBillData: any = await initialBillRes.json();
        expect(initialBillData.unresolvedCount).toBe(2);

        // 4. Staff cannot immediately close while items are unresolved (UNRESOLVED_ITEMS)
        const prematurePayRes = await fetch(`${baseUrl}/api/v1/staff/sessions/${sessionId}/confirm-payment-and-close`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                settlementVersion: 1,
                expectedAmount: Number(menuItem.price) * 2
            })
        });
        expect(prematurePayRes.status).toBe(400);
        const errData: any = await prematurePayRes.json();
        expect(errData.error).toBe('UNRESOLVED_ITEMS');

        // 5. Staff accepts all pending and serves all accepted via recovery routes
        const acceptRes = await fetch(`${baseUrl}/api/v1/staff/sessions/${sessionId}/accept-all`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(acceptRes.status).toBe(200);

        const serveRes = await fetch(`${baseUrl}/api/v1/staff/sessions/${sessionId}/serve-all`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(serveRes.status).toBe(200);

        // 6. Get updated quote
        const billRes = await fetch(`${baseUrl}/api/v1/staff/sessions/${sessionId}/bill-summary`, {
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(billRes.status).toBe(200);
        const billData: any = await billRes.json();
        expect(billData.unresolvedCount).toBe(0);
        expect(billData.rawBillTotal).toBe(Number(menuItem.price) * 2);
        expect(billData.validBillTotal).toBe(billData.rawBillTotal - billData.totalDiscount);

        // 7. Settlement succeeds cleanly
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

        // 8. Mark table ready succeeds
        const readyRes = await fetch(`${baseUrl}/api/v1/staff/tables/${testTableId}/mark-ready`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(readyRes.status).toBe(200);

        // 9. Session is CLOSED
        const finalSession = await query(`SELECT status FROM table_sessions WHERE id = $1`, [sessionId]);
        expect(finalSession.rows[0].status).toBe('CLOSED');
    });
});
