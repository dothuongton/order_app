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

    it('BUS-02b: Multi-round session with PERCENT promotion applies to total bill (2x120k @ 10% -> 216k)', async () => {
        await query(`UPDATE promotions SET is_active = false WHERE tenant_id = $1`, [tenantId]);
        await query(`
            INSERT INTO promotions (tenant_id, title, code, discount_type, discount_value, min_order_amount, is_active, priority)
            VALUES ($1, 'Giảm 10% toàn phiên', 'GIAM10PCT', 'PERCENT', 10, 0, true, 100)
        `, [tenantId]);

        const openRes = await StaffService.openSession(tenantId, tableA01Id, waiterId);
        const sessionId = openRes.sessionId;

        // Round 1: 120,000đ (2 items @ 60k)
        await query(`UPDATE menu_items SET price = 60000 WHERE id = $1`, [nemChuaId]);
        await GuestService.createOrder(tenantId, sessionId, tableA01Id, {
            idempotencyKey: 'bus02b-round-1',
            items: [{ menuItemId: nemChuaId, quantity: 2 }]
        });

        // Round 2: 120,000đ (2 items @ 60k)
        await GuestService.createOrder(tenantId, sessionId, tableA01Id, {
            idempotencyKey: 'bus02b-round-2',
            items: [{ menuItemId: nemChuaId, quantity: 2 }]
        });

        await StaffService.acceptAllPending(tenantId, sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, sessionId, waiterId);

        const summary = await GuestService.getBillSummary(tenantId, sessionId);
        expect(summary.rawBillTotal).toBe(240000);
        expect(summary.totalDiscount).toBe(24000); // 10% of 240k
        expect(summary.validBillTotal).toBe(216000); // 240k - 24k = 216k

        await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            sessionId,
            summary.settlementVersion,
            waiterId,
            'Settled BUS-02b',
            undefined,
            216000
        );
    });

    it('BUS-02c: Multi-round session does not consume max_redemptions cap during order placement (2x60k @ 10%, cap 1 -> 108k)', async () => {
        await query(`UPDATE promotions SET is_active = false WHERE tenant_id = $1`, [tenantId]);
        await query(`
            INSERT INTO promotions (tenant_id, title, code, discount_type, discount_value, min_order_amount, max_redemptions, current_redemptions, is_active, priority)
            VALUES ($1, 'Capped 10%', 'CAP10PCT', 'PERCENT', 10, 0, 1, 0, true, 100)
        `, [tenantId]);

        const openRes = await StaffService.openSession(tenantId, tableA02Id, waiterId);
        const sessionId = openRes.sessionId;

        // Round 1: 60k
        await GuestService.createOrder(tenantId, sessionId, tableA02Id, {
            idempotencyKey: 'bus02c-round-1',
            items: [{ menuItemId: nemChuaId, quantity: 1 }]
        });

        // Round 2: 60k
        await GuestService.createOrder(tenantId, sessionId, tableA02Id, {
            idempotencyKey: 'bus02c-round-2',
            items: [{ menuItemId: nemChuaId, quantity: 1 }]
        });

        await StaffService.acceptAllPending(tenantId, sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, sessionId, waiterId);

        const summary = await GuestService.getBillSummary(tenantId, sessionId);
        expect(summary.rawBillTotal).toBe(120000);
        expect(summary.totalDiscount).toBe(12000);
        expect(summary.validBillTotal).toBe(108000);

        await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            sessionId,
            summary.settlementVersion,
            waiterId,
            'Settled BUS-02c',
            undefined,
            108000
        );
    });

    it('BUS-06: Atomic promotion claim enforces max_redemptions cap under concurrent settlements with Promise.all race', async () => {
        await query(`UPDATE promotions SET is_active = false WHERE tenant_id = $1`, [tenantId]);
        // Create promotion with max_redemptions = 1
        const capPromoRes = await query(`
            INSERT INTO promotions (tenant_id, title, code, discount_type, discount_value, min_order_amount, max_redemptions, current_redemptions, is_active, priority)
            VALUES ($1, 'Flash Sale Cap 1 Race', 'CAP1RACE', 'FIXED_AMOUNT', 10000, 30000, 1, 0, true, 200)
            RETURNING id
        `, [tenantId]);
        const promoId = capPromoRes.rows[0].id;

        // Setup session 1
        const s1 = await StaffService.openSession(tenantId, tableA01Id, waiterId);
        await GuestService.createOrder(tenantId, s1.sessionId, tableA01Id, {
            idempotencyKey: 'bus06-s1',
            items: [{ menuItemId: nemChuaId, quantity: 1 }] // 60,000đ
        });
        await StaffService.acceptAllPending(tenantId, s1.sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, s1.sessionId, waiterId);
        const summary1 = await GuestService.getBillSummary(tenantId, s1.sessionId);

        // Setup session 2
        const s2 = await StaffService.openSession(tenantId, tableA02Id, waiterId);
        await GuestService.createOrder(tenantId, s2.sessionId, tableA02Id, {
            idempotencyKey: 'bus06-s2',
            items: [{ menuItemId: nemChuaId, quantity: 1 }] // 60,000đ
        });
        await StaffService.acceptAllPending(tenantId, s2.sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, s2.sessionId, waiterId);
        const summary2 = await GuestService.getBillSummary(tenantId, s2.sessionId);

        // Concurrent settlement race: exactly 1 must succeed, exactly 1 must fail
        const settleResults = await Promise.allSettled([
            StaffService.confirmPaymentAndCloseSession(
                tenantId,
                s1.sessionId,
                summary1.settlementVersion,
                waiterId,
                'Race 1',
                undefined,
                50000 // 60k - 10k
            ),
            StaffService.confirmPaymentAndCloseSession(
                tenantId,
                s2.sessionId,
                summary2.settlementVersion,
                waiterId,
                'Race 2',
                undefined,
                50000 // 60k - 10k
            )
        ]);

        const fulfilled = settleResults.filter(r => r.status === 'fulfilled');
        const rejected = settleResults.filter(r => r.status === 'rejected');

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        // Check DB: current_redemptions is exactly 1 (cap never exceeded)
        const checkPromo = await query(`SELECT current_redemptions, max_redemptions FROM promotions WHERE id = $1`, [promoId]);
        expect(checkPromo.rows[0].current_redemptions).toBe(1);
    });

    it('BUS-06b: Cap exhaustion recovery allows reloading new quote and settling cleanly without infinite 409 stuck session (Issue #28)', async () => {
        await query(`UPDATE promotions SET is_active = false WHERE tenant_id = $1`, [tenantId]);

        // Create promo with max_redemptions = 1
        const promoRes = await query(`
            INSERT INTO promotions (tenant_id, code, title, discount_type, discount_value, min_order_amount, max_redemptions, is_active)
            VALUES ($1, 'CAP-RECOVER', 'Cap Recover Promo', 'FIXED_AMOUNT', 10000, 0, 1, true)
            RETURNING id
        `, [tenantId]);

        const tableT1Res = await query(`INSERT INTO tables (tenant_id, table_number, public_qr_id) VALUES ($1, 'T-CAP1', 'qr-cap1') RETURNING id`, [tenantId]);
        const tableT2Res = await query(`INSERT INTO tables (tenant_id, table_number, public_qr_id) VALUES ($1, 'T-CAP2', 'qr-cap2') RETURNING id`, [tenantId]);
        const t1Id = tableT1Res.rows[0].id;
        const t2Id = tableT2Res.rows[0].id;

        const s1 = await StaffService.openSession(tenantId, t1Id, waiterId);
        const s2 = await StaffService.openSession(tenantId, t2Id, waiterId);

        await GuestService.createOrder(tenantId, s1.sessionId, t1Id, {
            idempotencyKey: 'cap-rec-ord-1',
            items: [{ menuItemId: nemChuaId, quantity: 1 }]
        });
        await GuestService.createOrder(tenantId, s2.sessionId, t2Id, {
            idempotencyKey: 'cap-rec-ord-2',
            items: [{ menuItemId: nemChuaId, quantity: 1 }]
        });

        await StaffService.acceptAllPending(tenantId, s1.sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, s1.sessionId, waiterId);
        await StaffService.acceptAllPending(tenantId, s2.sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, s2.sessionId, waiterId);

        const preview1 = await GuestService.getBillSummary(tenantId, s1.sessionId);
        const preview2 = await GuestService.getBillSummary(tenantId, s2.sessionId);

        // Session 1 settles and claims the 1 redemption
        await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            s1.sessionId,
            preview1.settlementVersion,
            waiterId,
            undefined,
            undefined,
            preview1.validBillTotal
        );

        // Session 2 attempts to settle with stale preview (expected 50,000đ) -> fails with 409 PROMOTION_EXHAUSTED
        await expect(
            StaffService.confirmPaymentAndCloseSession(
                tenantId,
                s2.sessionId,
                preview2.settlementVersion,
                waiterId,
                undefined,
                undefined,
                preview2.validBillTotal
            )
        ).rejects.toMatchObject({
            status: 409,
            code: 'PROMOTION_EXHAUSTED'
        });

        // Session 2 reloads bill summary: exhausted promo must NOT be quoted (validBillTotal = 60,000đ)
        const reloaded2 = await GuestService.getBillSummary(tenantId, s2.sessionId);
        expect(reloaded2.rawBillTotal).toBe(60000);
        expect(reloaded2.totalDiscount).toBe(0);
        expect(reloaded2.validBillTotal).toBe(60000);

        // Session 2 settles cleanly at 60,000đ
        const settled2 = await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            s2.sessionId,
            reloaded2.settlementVersion,
            waiterId,
            undefined,
            undefined,
            reloaded2.validBillTotal
        );

        expect(settled2.totalAmount).toBe(60000);

        const session2Status = await query(`SELECT status FROM table_sessions WHERE id = $1`, [s2.sessionId]);
        expect(session2Status.rows[0].status).toBe('CLOSED');
    });

    it('BUS-06c: Multiple attached promotions where first is exhausted selects subsequent available promotion without 409 stuck session (Issue #28)', async () => {
        await query(`UPDATE promotions SET is_active = false WHERE tenant_id = $1`, [tenantId]);

        // 1. Create active fixed 10k promo A with max_redemptions = 1
        const promoARes = await query(`
            INSERT INTO promotions (tenant_id, code, title, discount_type, discount_value, min_order_amount, max_redemptions, is_active, priority)
            VALUES ($1, 'MULTI-CAP-A', 'Capped Promo A', 'FIXED_AMOUNT', 10000, 0, 1, true, 1)
            RETURNING id
        `, [tenantId]);
        const promoAId = promoARes.rows[0].id;

        const tableT1Res = await query(`INSERT INTO tables (tenant_id, table_number, public_qr_id) VALUES ($1, 'T-MCAP-1', 'qr-mcap-1') RETURNING id`, [tenantId]);
        const tableT2Res = await query(`INSERT INTO tables (tenant_id, table_number, public_qr_id) VALUES ($1, 'T-MCAP-2', 'qr-mcap-2') RETURNING id`, [tenantId]);
        const t1Id = tableT1Res.rows[0].id;
        const t2Id = tableT2Res.rows[0].id;

        // Target table session (sTarget) and consuming session (sConsume)
        const sTarget = await StaffService.openSession(tenantId, t1Id, waiterId);
        const sConsume = await StaffService.openSession(tenantId, t2Id, waiterId);

        // sTarget places round 1 (60k) with Promo A
        await GuestService.createOrder(tenantId, sTarget.sessionId, t1Id, {
            idempotencyKey: 'mcap-target-round-1',
            items: [{ menuItemId: nemChuaId, quantity: 1 }]
        });

        // sConsume places round and settles using Promo A, exhausting its 1 redemption
        await GuestService.createOrder(tenantId, sConsume.sessionId, t2Id, {
            idempotencyKey: 'mcap-consume-order',
            items: [{ menuItemId: nemChuaId, quantity: 1 }]
        });
        await StaffService.acceptAllPending(tenantId, sConsume.sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, sConsume.sessionId, waiterId);
        const consumeQuote = await GuestService.getBillSummary(tenantId, sConsume.sessionId);
        await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            sConsume.sessionId,
            consumeQuote.settlementVersion,
            waiterId,
            undefined,
            undefined,
            consumeQuote.validBillTotal
        );

        // Deactivate Promo A, create Promo B (20k discount)
        await query(`UPDATE promotions SET is_active = false WHERE id = $1`, [promoAId]);
        const promoBRes = await query(`
            INSERT INTO promotions (tenant_id, code, title, discount_type, discount_value, min_order_amount, is_active, priority)
            VALUES ($1, 'MULTI-AVAIL-B', 'Available Promo B', 'FIXED_AMOUNT', 20000, 0, true, 2)
            RETURNING id
        `, [tenantId]);
        const promoBId = promoBRes.rows[0].id;

        // sTarget places round 2 (60k) with Promo B
        await GuestService.createOrder(tenantId, sTarget.sessionId, t1Id, {
            idempotencyKey: 'mcap-target-round-2',
            items: [{ menuItemId: nemChuaId, quantity: 1 }]
        });
        await StaffService.acceptAllPending(tenantId, sTarget.sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, sTarget.sessionId, waiterId);

        // Re-enable Promo A (it is active in DB, but its 1 cap is consumed)
        await query(`UPDATE promotions SET is_active = true WHERE id = $1`, [promoAId]);

        // Quote evaluation:
        // Promo A is exhausted, Promo B is available -> Quote must select Promo B!
        // 120,000đ raw - 20,000đ discount = 100,000đ
        const quote = await GuestService.getBillSummary(tenantId, sTarget.sessionId);
        expect(quote.rawBillTotal).toBe(120000);
        expect(quote.totalDiscount).toBe(20000);
        expect(quote.validBillTotal).toBe(100000);
        expect(quote.appliedPromotions).toHaveLength(1);
        expect(quote.appliedPromotions[0].id).toBe(promoBId);

        // Settlement evaluation:
        // Settlement must also select Promo B without throwing 409 PROMOTION_EXHAUSTED for Promo A
        const settled = await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            sTarget.sessionId,
            quote.settlementVersion,
            waiterId,
            undefined,
            undefined,
            quote.validBillTotal
        );

        expect(settled.totalAmount).toBe(100000);

        // Verify bill lines
        const billRes = await query(`SELECT id FROM bills WHERE session_id = $1`, [sTarget.sessionId]);
        const billLinesRes = await query(`SELECT subtotal FROM bill_lines WHERE bill_id = $1`, [billRes.rows[0].id]);
        const totalLineAmount = billLinesRes.rows.reduce((sum, r) => sum + parseInt(r.subtotal, 10), 0);
        expect(totalLineAmount).toBe(100000);

        // Verify redemptions: Promo A has 1 redemption (cap never exceeded), Promo B has 1 redemption
        const redemptionsA = await query(`SELECT COUNT(*) FROM promotion_redemptions WHERE promotion_id = $1`, [promoAId]);
        const redemptionsB = await query(`SELECT COUNT(*) FROM promotion_redemptions WHERE promotion_id = $1`, [promoBId]);
        expect(parseInt(redemptionsA.rows[0].count, 10)).toBe(1);
        expect(parseInt(redemptionsB.rows[0].count, 10)).toBe(1);

        const targetStatus = await query(`SELECT status FROM table_sessions WHERE id = $1`, [sTarget.sessionId]);
        expect(targetStatus.rows[0].status).toBe('CLOSED');
    });

    it('BUS-02d: Session discount re-evaluates against remaining served total after partial cancellation (Issue #28)', async () => {
        await query(`UPDATE promotions SET is_active = false WHERE tenant_id = $1`, [tenantId]);

        // Promo: Fixed 20,000đ on min_order_amount >= 100,000đ
        await query(`
            INSERT INTO promotions (tenant_id, code, title, discount_type, discount_value, min_order_amount, is_active)
            VALUES ($1, 'PARTIAL-CANCEL', 'Partial Cancel Promo', 'FIXED_AMOUNT', 20000, 100000, true)
        `, [tenantId]);

        const tablePCRes = await query(`INSERT INTO tables (tenant_id, table_number, public_qr_id) VALUES ($1, 'T-PC', 'qr-pc') RETURNING id`, [tenantId]);
        const tPCId = tablePCRes.rows[0].id;

        const session = await StaffService.openSession(tenantId, tPCId, waiterId);

        // Round 1: 2 items of 60k = 120k
        const round1 = await GuestService.createOrder(tenantId, session.sessionId, tPCId, {
            idempotencyKey: 'partial-ord-1',
            items: [{ menuItemId: nemChuaId, quantity: 2 }]
        });

        // Round 2: 1 item of 60k = 60k
        await GuestService.createOrder(tenantId, session.sessionId, tPCId, {
            idempotencyKey: 'partial-ord-2',
            items: [{ menuItemId: nemChuaId, quantity: 1 }]
        });

        await StaffService.acceptAllPending(tenantId, session.sessionId, waiterId);

        // Cancel 1 item (60k) from round 1
        const item1Res = await query(`SELECT id FROM order_items WHERE order_id = $1 LIMIT 1`, [round1.orderId]);
        await StaffService.cancelOrderItem(tenantId, item1Res.rows[0].id, 1, 'Customer changed mind', waiterId, false);

        await StaffService.serveAllAccepted(tenantId, session.sessionId, waiterId);

        // Remaining served total: 60k (round 1) + 60k (round 2) = 120,000đ >= 100,000đ min_order_amount
        // Expected discount: 20,000đ (validBillTotal = 100,000đ)
        const summary = await GuestService.getBillSummary(tenantId, session.sessionId);
        expect(summary.rawBillTotal).toBe(120000);
        expect(summary.totalDiscount).toBe(20000);
        expect(summary.validBillTotal).toBe(100000);

        const settled = await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            session.sessionId,
            summary.settlementVersion,
            waiterId,
            undefined,
            undefined,
            summary.validBillTotal
        );

        expect(settled.totalAmount).toBe(100000);
    });

    it('BUS-02e: Cancelled round promo does not poison quote vs settlement for subsequent rounds (Issue #28)', async () => {
        // Repro: Round 1 (60k) uses promoA (10k); turn off A; Round 2 (60k) uses promoB (20k); cancel Round 1; serve Round 2.
        await query(`UPDATE promotions SET is_active = false WHERE tenant_id = $1`, [tenantId]);

        // Promo A: 10,000đ off
        const promoARes = await query(`
            INSERT INTO promotions (tenant_id, code, title, discount_type, discount_value, min_order_amount, is_active, priority)
            VALUES ($1, 'PROMO-A', 'Promo A 10k', 'FIXED_AMOUNT', 10000, 0, true, 1)
            RETURNING id
        `, [tenantId]);
        const promoAId = promoARes.rows[0].id;

        const tableRes = await query(`INSERT INTO tables (tenant_id, table_number, public_qr_id) VALUES ($1, 'T-REG28', 'qr-reg28') RETURNING id`, [tenantId]);
        const tId = tableRes.rows[0].id;

        const session = await StaffService.openSession(tenantId, tId, waiterId);

        // Round 1: 60k order using Promo A
        const round1 = await GuestService.createOrder(tenantId, session.sessionId, tId, {
            idempotencyKey: 'reg28-round-1',
            items: [{ menuItemId: nemChuaId, quantity: 1 }]
        });

        // Turn off Promo A, activate Promo B (20k off)
        await query(`UPDATE promotions SET is_active = false WHERE id = $1`, [promoAId]);
        const promoBRes = await query(`
            INSERT INTO promotions (tenant_id, code, title, discount_type, discount_value, min_order_amount, is_active, priority)
            VALUES ($1, 'PROMO-B', 'Promo B 20k', 'FIXED_AMOUNT', 20000, 0, true, 2)
            RETURNING id
        `, [tenantId]);
        const promoBId = promoBRes.rows[0].id;

        // Round 2: 60k order using Promo B
        await GuestService.createOrder(tenantId, session.sessionId, tId, {
            idempotencyKey: 'reg28-round-2',
            items: [{ menuItemId: nemChuaId, quantity: 1 }]
        });

        // Accept all pending items
        await StaffService.acceptAllPending(tenantId, session.sessionId, waiterId);

        // Cancel Round 1 item completely (1 of 1)
        const round1ItemRes = await query(`SELECT id FROM order_items WHERE order_id = $1`, [round1.orderId]);
        await StaffService.cancelOrderItem(tenantId, round1ItemRes.rows[0].id, 1, 'Customer cancelled round 1', waiterId, false);

        // Serve Round 2
        await StaffService.serveAllAccepted(tenantId, session.sessionId, waiterId);

        // Quote verification:
        // Round 1 is cancelled (0đ), Round 2 is served (60k).
        // Candidate basket is Round 2 with Promo B (20k discount).
        // Valid bill total must be 40,000đ (NOT 60,000đ from dead Promo A!).
        const quote = await GuestService.getBillSummary(tenantId, session.sessionId);
        expect(quote.rawBillTotal).toBe(60000);
        expect(quote.totalDiscount).toBe(20000);
        expect(quote.validBillTotal).toBe(40000);
        expect(quote.appliedPromotions).toHaveLength(1);
        expect(quote.appliedPromotions[0].id).toBe(promoBId);

        // Settlement verification:
        // Must succeed without 409 PRICE_CHANGED or stuck session
        const settled = await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            session.sessionId,
            quote.settlementVersion,
            waiterId,
            undefined,
            undefined,
            quote.validBillTotal
        );

        expect(settled.totalAmount).toBe(40000);

        // Verify bill_lines line up with bill total
        const billRes = await query(`SELECT id FROM bills WHERE session_id = $1`, [session.sessionId]);
        const billLinesRes = await query(`SELECT subtotal FROM bill_lines WHERE bill_id = $1`, [billRes.rows[0].id]);
        const totalLineAmount = billLinesRes.rows.reduce((sum, r) => sum + parseInt(r.subtotal, 10), 0);
        expect(totalLineAmount).toBe(40000);
        expect(settled.lines.reduce((sum: number, r: any) => sum + r.subtotal, 0)).toBe(40000);

        const sessionStatus = await query(`SELECT status FROM table_sessions WHERE id = $1`, [session.sessionId]);
        expect(sessionStatus.rows[0].status).toBe('CLOSED');
    });
});
