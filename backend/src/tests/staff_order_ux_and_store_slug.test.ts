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

    it('allows closing session without charge with reason (e.g. Khách đặt ảo) and exposes it in reports', async () => {
        // Find a table
        const tableRes = await query(`SELECT id, table_number FROM tables WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        const table = tableRes.rows[0];

        // Open session on this table
        const openRes = await fetch(`${baseUrl}/api/v1/staff/tables/${table.id}/open`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${staffToken}` }
        });
        expect(openRes.status).toBe(201);
        const openData: any = await openRes.json();
        const sessionId = openData.sessionId;

        // Close session without charge with reason 'Khách đặt ảo'
        const closeRes = await fetch(`${baseUrl}/api/v1/staff/sessions/${sessionId}/close-without-charge`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${staffToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: 'Khách đặt ảo' })
        });
        expect(closeRes.status).toBe(200);
        const closeData: any = await closeRes.json();
        expect(closeData.sessionId).toBe(sessionId);

        // Verify session status in DB
        const dbCheck = await query(`SELECT status, close_reason, claimed_device_hash FROM table_sessions WHERE id = $1`, [sessionId]);
        expect(dbCheck.rows[0].status).toBe('CLOSED');
        expect(dbCheck.rows[0].close_reason).toBe('Khách đặt ảo');
        expect(dbCheck.rows[0].claimed_device_hash).toBeNull();

        // Verify bill in DB
        const billCheck = await query(`SELECT status, total_amount FROM bills WHERE session_id = $1`, [sessionId]);
        expect(billCheck.rows[0].status).toBe('CANCELLED');
        expect(Number(billCheck.rows[0].total_amount)).toBe(0);

        // Verify reports summary includes the 0đ cancelled session
        const reportsRes = await fetch(`${baseUrl}/api/v1/staff/reports/summary`, {
            headers: { Authorization: `Bearer ${staffToken}` }
        });
        expect(reportsRes.status).toBe(200);
        const reportsData: any = await reportsRes.json();
        const releasedSession = reportsData.recentSettledSessions.find((s: any) => s.session_id === sessionId);
        expect(releasedSession).toBeDefined();
        expect(Number(releasedSession.confirmed_amount)).toBe(0);
        expect(releasedSession.close_reason).toBe('Khách đặt ảo');
        expect(releasedSession.bill_status).toBe('CANCELLED');
    });

    it('authenticates a reports summary request only once', async () => {
        let queryCount = 0;
        const poolAny = pool as any;
        const originalQuery = poolAny.query;
        poolAny.query = function (...args: any[]) {
            queryCount += 1;
            return originalQuery.apply(pool, args);
        };

        try {
            const reportsRes = await fetch(`${baseUrl}/api/v1/staff/reports/summary`, {
                headers: { Authorization: `Bearer ${staffToken}` }
            });
            expect(reportsRes.status).toBe(200);
            const reportsData: any = await reportsRes.json();
            expect(reportsData.metrics).toBeDefined();
            // One token-revocation lookup, one membership lookup and four report reads.
            expect(queryCount).toBe(6);
        } finally {
            poolAny.query = originalQuery;
        }
    });

    it('exposes round createdAt timestamp in getBillSummary', async () => {
        const tableRes = await query(`SELECT id, table_number FROM tables WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        const table = tableRes.rows[0];

        const openRes = await fetch(`${baseUrl}/api/v1/staff/tables/${table.id}/open`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${staffToken}` }
        });
        const openData: any = await openRes.json();
        const sessionId = openData.sessionId;

        const itemRes = await query(`SELECT id, name, price FROM menu_items WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        const item = itemRes.rows[0];

        const orderRes = await query(`
            INSERT INTO orders (tenant_id, session_id, order_number, source, idempotency_key)
            VALUES ($1, $2, 1, 'GUEST', 'test-idem-round-time-1')
            RETURNING id, order_number, created_at
        `, [tenantId, sessionId]);
        const orderId = orderRes.rows[0].id;

        const oiRes = await query(`
            INSERT INTO order_items (tenant_id, order_id, menu_item_id, quantity, snapshot_name, snapshot_price)
            VALUES ($1, $2, $3, 1, $4, $5)
            RETURNING id
        `, [tenantId, orderId, item.id, item.name, item.price]);
        const orderItemId = oiRes.rows[0].id;

        await query(`
            INSERT INTO order_item_parts (tenant_id, order_item_id, quantity, status)
            VALUES ($1, $2, 1, 'PENDING')
        `, [tenantId, orderItemId]);

        const billRes = await fetch(`${baseUrl}/api/v1/staff/sessions/${sessionId}/bill-summary`, {
            headers: { Authorization: `Bearer ${staffToken}` }
        });
        expect(billRes.status).toBe(200);
        const billData: any = await billRes.json();
        expect(billData.rounds.length).toBeGreaterThan(0);
        expect(billData.rounds[0].createdAt).toBeDefined();

        await query(`DELETE FROM table_sessions WHERE id = $1`, [sessionId]);
    });
});
