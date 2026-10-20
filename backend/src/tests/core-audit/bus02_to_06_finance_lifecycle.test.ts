import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../../app.js';
import { query } from '../../db/pool.js';
import { seed } from '../../db/seed.js';
import { GuestService } from '../../modules/guest/guest.service.js';
import { StaffService } from '../../modules/staff/staff.service.js';

describe('Financial Lifecycle & Session Promotion Suite (BUS-02, BUS-03, BUS-04, BUS-06)', () => {
    let server: http.Server;
    let baseUrl: string;
    let tenantId: string;
    let waiterId: string;
    let tableA01Id: string;
    let tableA02Id: string;
    let nemChuaId: string;

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

        const tableA01Res = await query(`SELECT id FROM tables WHERE tenant_id = $1 AND table_number = 'A01'`, [tenantId]);
        tableA01Id = tableA01Res.rows[0].id;

        const tableA02Res = await query(`SELECT id FROM tables WHERE tenant_id = $1 AND table_number = 'A02'`, [tenantId]);
        tableA02Id = tableA02Res.rows[0].id;

        const usersRes = await query(`SELECT id, email FROM users`);
        waiterId = usersRes.rows.find(u => u.email === 'phucvu@phoco.vn')!.id;

        const itemRes = await query(`SELECT id, price FROM menu_items WHERE tenant_id = $1 AND name LIKE '%Nem Chua Rán%' LIMIT 1`, [tenantId]);
        nemChuaId = itemRes.rows[0].id;
    });

    afterAll(async () => {
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    it('BUS-02: Multi-round session applies 20,000đ promotion to total bill (240k -> 220k, not 200k)', async () => {
        // Create 20,000đ fixed discount promotion for bills >= 100,000đ
        await query(`UPDATE promotions SET is_active = false WHERE tenant_id = $1`, [tenantId]);
        const promoRes = await query(`
            INSERT INTO promotions (tenant_id, title, code, discount_type, discount_value, min_order_amount, is_active, priority)
            VALUES ($1, 'Giảm 20k đơn từ 100k', 'GIAM20K', 'FIXED_AMOUNT', 20000, 100000, true, 100)
            RETURNING id
        `, [tenantId]);

        // Open session
        const openRes = await StaffService.openSession(tenantId, tableA01Id, waiterId);
        const sessionId = openRes.sessionId;

        // Round 1: 120,000đ (4 items @ 30k)
        await query(`UPDATE menu_items SET price = 30000 WHERE id = $1`, [nemChuaId]);
        await GuestService.createOrder(tenantId, sessionId, tableA01Id, {
            idempotencyKey: 'bus02-round-1',
            items: [{ menuItemId: nemChuaId, quantity: 4 }] // 120,000đ
        });

        // Round 2: 120,000đ (4 items @ 30k)
        await GuestService.createOrder(tenantId, sessionId, tableA01Id, {
            idempotencyKey: 'bus02-round-2',
            items: [{ menuItemId: nemChuaId, quantity: 4 }] // 120,000đ
        });

        // Staff serves all items
        await StaffService.acceptAllPending(tenantId, sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, sessionId, waiterId);

        // Fetch Bill Summary
        const summary = await GuestService.getBillSummary(tenantId, sessionId);

        expect(summary.rawBillTotal).toBe(240000);
        expect(summary.totalDiscount).toBe(20000);
        // Crucial BUS-02 requirement: Must be 220,000đ, NOT 200,000đ
        expect(summary.validBillTotal).toBe(220000);

        // Close session cleanly
        await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            sessionId,
            summary.settlementVersion,
            waiterId,
            'Settled BUS-02'
        );
    });

    it('BUS-03: Reading CLOSED bill returns immutable settled snapshot even after promotion is deactivated or deleted', async () => {
        // Open session on table A02
        const openRes = await StaffService.openSession(tenantId, tableA02Id, waiterId);
        const sessionId = openRes.sessionId;

        // Order 4 items @ 30k = 120k -> 20k discount = 100k
        await GuestService.createOrder(tenantId, sessionId, tableA02Id, {
            idempotencyKey: 'bus03-order-1',
            items: [{ menuItemId: nemChuaId, quantity: 4 }]
        });

        await StaffService.acceptAllPending(tenantId, sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, sessionId, waiterId);

        let summary = await GuestService.getBillSummary(tenantId, sessionId);
        expect(summary.validBillTotal).toBe(100000);

        // Staff closes and confirms payment at 100,000đ
        await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            sessionId,
            summary.settlementVersion,
            waiterId,
            'Đã thanh toán đủ',
            undefined,
            100000
        );

        // Now DEACTIVATE and EXHAUST all promotions!
        await query(`UPDATE promotions SET is_active = false, max_redemptions = 0 WHERE tenant_id = $1`, [tenantId]);

        // Re-read bill summary for this CLOSED session
        const closedSummary = await GuestService.getBillSummary(tenantId, sessionId);

        // Crucial BUS-03 requirement: Still reads 100,000đ and preserves 20,000đ discount
        expect(closedSummary.isClosed).toBe(true);
        expect(closedSummary.validBillTotal).toBe(100000);
        expect(closedSummary.totalDiscount).toBe(20000);
        expect(closedSummary.appliedPromotions).toHaveLength(1);
        expect(closedSummary.appliedPromotions[0].title).toBe('Giảm 20k đơn từ 100k');
    });

    it('BUS-04: Protects against unexpected price changes via expectedAmount parameter', async () => {
        // Open fresh table session
        await query(`UPDATE tables SET is_enabled = true WHERE id = $1`, [tableA01Id]);
        const openRes = await StaffService.openSession(tenantId, tableA01Id, waiterId);
        const sessionId = openRes.sessionId;

        await GuestService.createOrder(tenantId, sessionId, tableA01Id, {
            idempotencyKey: 'bus04-order-1',
            items: [{ menuItemId: nemChuaId, quantity: 4 }] // 120,000đ
        });

        await StaffService.acceptAllPending(tenantId, sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, sessionId, waiterId);

        const summary = await GuestService.getBillSummary(tenantId, sessionId);
        expect(summary.validBillTotal).toBe(120000); // No active promotions right now

        // Staff attempts to confirm payment expecting 100,000đ when actual is 120,000đ
        await expect(StaffService.confirmPaymentAndCloseSession(
            tenantId,
            sessionId,
            summary.settlementVersion,
            waiterId,
            'Test conflict',
            undefined,
            100000 // expected 100k
        )).rejects.toMatchObject({ code: 'PRICE_CHANGED' });

        // Close cleanly
        await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            sessionId,
            summary.settlementVersion,
            waiterId,
            'Settled BUS-04'
        );
    });

    it('BUS-06: Atomic promotion claim enforces max_redemptions cap under concurrent settlements', async () => {
        // Create promotion with max_redemptions = 1
        const capPromoRes = await query(`
            INSERT INTO promotions (tenant_id, title, code, discount_type, discount_value, min_order_amount, max_redemptions, current_redemptions, is_active, priority)
            VALUES ($1, 'Flash Sale Cap 1', 'CAP1', 'FIXED_AMOUNT', 10000, 30000, 1, 0, true, 200)
            RETURNING id
        `, [tenantId]);
        const promoId = capPromoRes.rows[0].id;

        // Setup session 1
        const s1 = await StaffService.openSession(tenantId, tableA01Id, waiterId);
        await GuestService.createOrder(tenantId, s1.sessionId, tableA01Id, {
            idempotencyKey: 'bus06-s1',
            items: [{ menuItemId: nemChuaId, quantity: 1 }] // 30,000đ
        });
        await StaffService.acceptAllPending(tenantId, s1.sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, s1.sessionId, waiterId);
        const summary1 = await GuestService.getBillSummary(tenantId, s1.sessionId);

        // Setup session 2
        const s2 = await StaffService.openSession(tenantId, tableA02Id, waiterId);
        await GuestService.createOrder(tenantId, s2.sessionId, tableA02Id, {
            idempotencyKey: 'bus06-s2',
            items: [{ menuItemId: nemChuaId, quantity: 1 }] // 30,000đ
        });
        await StaffService.acceptAllPending(tenantId, s2.sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, s2.sessionId, waiterId);
        const summary2 = await GuestService.getBillSummary(tenantId, s2.sessionId);

        // Session 1 claims the 1 redemption and settles
        await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            s1.sessionId,
            summary1.settlementVersion,
            waiterId,
            'Settled 1',
            undefined,
            20000 // 30k - 10k
        );

        // Check DB: current_redemptions is now 1 (cap reached)
        const checkPromo = await query(`SELECT current_redemptions, max_redemptions FROM promotions WHERE id = $1`, [promoId]);
        expect(checkPromo.rows[0].current_redemptions).toBe(1);

        // Session 2 attempting to claim the exhausted promotion expecting 20,000đ must fail with PROMOTION_EXHAUSTED or PRICE_CHANGED
        await expect(StaffService.confirmPaymentAndCloseSession(
            tenantId,
            s2.sessionId,
            summary2.settlementVersion,
            waiterId,
            'Settled 2',
            undefined,
            20000 // expected discount, but cap is exhausted!
        )).rejects.toMatchObject({
            code: expect.stringMatching(/PROMOTION_EXHAUSTED|PRICE_CHANGED/)
        });
    });
});
