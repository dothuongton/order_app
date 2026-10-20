import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../../app.js';
import { query } from '../../db/pool.js';
import { seed } from '../../db/seed.js';
import { StaffService } from '../../modules/staff/staff.service.js';
import { GuestService } from '../../modules/guest/guest.service.js';

describe('BUS-07: Option Payload Canonicalization & Multiple Rounds Hotfix (Issue #60)', () => {
    let server: http.Server;
    let baseUrl: string;
    let tenantId: string;
    let managerId: string;
    let tableA01Id: string;
    let tableA01Qr: string;
    let milkTeaId: string;
    let sugar50Id: string;
    let sugar100Id: string;
    let toppingPearlId: string;
    let guestToken: string;
    let sessionId: string;

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

        const tableRes = await query(`SELECT id, public_qr_id FROM tables WHERE tenant_id = $1 AND table_number = 'A01'`, [tenantId]);
        tableA01Id = tableRes.rows[0].id;
        tableA01Qr = tableRes.rows[0].public_qr_id;

        const usersRes = await query(`SELECT id, email FROM users WHERE email = 'admin@phoco.vn'`);
        managerId = usersRes.rows[0].id;

        // Find milk tea item
        const itemRes = await query(`SELECT id FROM menu_items WHERE tenant_id = $1 AND name LIKE '%Trà Sữa Trân Châu Đường Đen%' LIMIT 1`, [tenantId]);
        milkTeaId = itemRes.rows[0].id;

        // Create option groups for milk tea:
        // Group 1: Sugar (SINGLE, min 1, max 1)
        const g1 = await query(`
            INSERT INTO item_option_groups (tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, is_active)
            VALUES ($1, $2, 'Mức Đường', 'SINGLE', 1, 1, 'FREE', true)
            RETURNING id
        `, [tenantId, milkTeaId]);
        const sugarGroupId = g1.rows[0].id;

        const o1 = await query(`
            INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_available)
            VALUES ($1, $2, $3, '50% Đường', 0, true)
            RETURNING id
        `, [tenantId, sugarGroupId, milkTeaId]);
        sugar50Id = o1.rows[0].id;

        const o2 = await query(`
            INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_available)
            VALUES ($1, $2, $3, '100% Đường', 0, true)
            RETURNING id
        `, [tenantId, sugarGroupId, milkTeaId]);
        sugar100Id = o2.rows[0].id;

        // Group 2: Topping (MULTIPLE, min 0, max 3, ADDITIVE)
        const g2 = await query(`
            INSERT INTO item_option_groups (tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, is_active)
            VALUES ($1, $2, 'Topping', 'MULTIPLE', 0, 3, 'ADDITIVE', true)
            RETURNING id
        `, [tenantId, milkTeaId]);
        const toppingGroupId = g2.rows[0].id;

        const o3 = await query(`
            INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_available)
            VALUES ($1, $2, $3, 'Thêm Trân Châu Đen', 5000, true)
            RETURNING id
        `, [tenantId, toppingGroupId, milkTeaId]);
        toppingPearlId = o3.rows[0].id;

        // Open session on Table A01
        const openSession = await StaffService.openSession(tenantId, tableA01Id, managerId);
        sessionId = openSession.sessionId;

        // Guest joins session
        const joinRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01Qr}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceFingerprint: 'guest-bus07-device' })
        });
        const guestJoin = await joinRes.json();
        guestToken = guestJoin.token;
    });

    afterAll(async () => {
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    it('Diagnostic 1: Rejects payload with duplicate aliases (variantId + variantIds + optionIds with same selection)', async () => {
        // Simulating the old buggy frontend that sent all three aliases for the same selection
        const res = await fetch(`${baseUrl}/api/v1/guest/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-guest-token': guestToken
            },
            body: JSON.stringify({
                idempotencyKey: 'test-alias-dup-' + Date.now(),
                items: [{
                    menuItemId: milkTeaId,
                    quantity: 1,
                    variantId: sugar50Id,
                    variantIds: [sugar50Id, toppingPearlId],
                    optionIds: [sugar50Id, toppingPearlId]
                }]
            })
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe('DUPLICATE_OPTION');
    });

    it('Diagnostic 2: Accepts canonical payload with optionIds only', async () => {
        const idempotencyKey = 'test-canonical-round1-' + Date.now();
        const res = await fetch(`${baseUrl}/api/v1/guest/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-guest-token': guestToken
            },
            body: JSON.stringify({
                idempotencyKey,
                items: [{
                    menuItemId: milkTeaId,
                    quantity: 2,
                    note: 'Ít đá',
                    optionIds: [sugar50Id, toppingPearlId]
                }]
            })
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.orderId).toBeDefined();
        expect(data.orderNumber).toBe(1);
    });

    it('Diagnostic 3: Rejects genuine duplicate options within optionIds array ([id, id])', async () => {
        const res = await fetch(`${baseUrl}/api/v1/guest/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-guest-token': guestToken
            },
            body: JSON.stringify({
                idempotencyKey: 'test-genuine-dup-' + Date.now(),
                items: [{
                    menuItemId: milkTeaId,
                    quantity: 1,
                    optionIds: [toppingPearlId, toppingPearlId]
                }]
            })
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe('DUPLICATE_OPTION');
    });

    it('Diagnostic 4: Allows ordering the SAME item again in a 2nd round with new intent/key', async () => {
        const idempotencyKey = 'test-canonical-round2-' + Date.now();
        const res = await fetch(`${baseUrl}/api/v1/guest/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-guest-token': guestToken
            },
            body: JSON.stringify({
                idempotencyKey,
                items: [{
                    menuItemId: milkTeaId,
                    quantity: 1,
                    note: 'Mang về',
                    optionIds: [sugar100Id]
                }]
            })
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.orderId).toBeDefined();
        expect(data.orderNumber).toBe(2);

        // Check guest orders list: must contain both round 1 and round 2 orders
        const ordersRes = await fetch(`${baseUrl}/api/v1/guest/orders`, {
            headers: { 'x-guest-token': guestToken }
        });
        expect(ordersRes.status).toBe(200);
        const ordersData = await ordersRes.json();
        expect(ordersData.orders.length).toBe(2);
    });

    it('Diagnostic 5: Idempotent retry with same key does not create duplicate order', async () => {
        const retryKey = 'test-idempotency-retry-' + Date.now();
        const payload = {
            idempotencyKey: retryKey,
            items: [{
                menuItemId: milkTeaId,
                quantity: 1,
                optionIds: [sugar50Id]
            }]
        };

        const res1 = await fetch(`${baseUrl}/api/v1/guest/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-guest-token': guestToken },
            body: JSON.stringify(payload)
        });
        expect(res1.status).toBe(201);
        const data1 = await res1.json();

        // Retry exact same request with same idempotency key
        const res2 = await fetch(`${baseUrl}/api/v1/guest/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-guest-token': guestToken },
            body: JSON.stringify(payload)
        });
        expect(res2.status).toBe(201);
        const data2 = await res2.json();
        expect(data2.orderId).toBe(data1.orderId);

        // Verify total order count in DB for session: exactly 3 orders (round 1 + round 2 + round 3)
        const countRes = await query(`SELECT COUNT(*) FROM orders WHERE session_id = $1`, [sessionId]);
        expect(parseInt(countRes.rows[0].count, 10)).toBe(3);
    });

    it('Case 6: Accepts legacy single variant via variantId only', async () => {
        // Create legacy variant on snack item
        const snackRes = await query(`SELECT id FROM menu_items WHERE tenant_id = $1 AND name LIKE '%Bánh Tráng%' LIMIT 1`, [tenantId]);
        const snackId = snackRes.rows[0].id;

        const vRes = await query(`
            INSERT INTO menu_item_variants (tenant_id, menu_item_id, name, price_adjustment, is_available)
            VALUES ($1, $2, 'Cỡ Lớn', 5000, true)
            RETURNING id
        `, [tenantId, snackId]);
        const variantId = vRes.rows[0].id;

        const res = await fetch(`${baseUrl}/api/v1/guest/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-guest-token': guestToken },
            body: JSON.stringify({
                idempotencyKey: 'test-legacy-single-' + Date.now(),
                items: [{
                    menuItemId: snackId,
                    quantity: 1,
                    variantId
                }]
            })
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.orderId).toBeDefined();
    });

    it('Case 7: Accepts legacy variant in array format via variantIds without alias duplication', async () => {
        const snackRes = await query(`SELECT id FROM menu_items WHERE tenant_id = $1 AND name LIKE '%Khoai Tây%' LIMIT 1`, [tenantId]);
        const snackId = snackRes.rows[0].id;

        const v1 = await query(`
            INSERT INTO menu_item_variants (tenant_id, menu_item_id, group_name, name, price_adjustment, is_available)
            VALUES ($1, $2, 'Kích cỡ', 'Lớn', 10000, true)
            RETURNING id
        `, [tenantId, snackId]);

        const res = await fetch(`${baseUrl}/api/v1/guest/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-guest-token': guestToken },
            body: JSON.stringify({
                idempotencyKey: 'test-legacy-multi-' + Date.now(),
                items: [{
                    menuItemId: snackId,
                    quantity: 2,
                    variantIds: [v1.rows[0].id]
                }]
            })
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.orderId).toBeDefined();
    });
});
