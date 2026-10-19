import { describe, it, expect, beforeAll } from 'vitest';
import { query } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { StaffService } from '../modules/staff/staff.service.js';
import { GuestService } from '../modules/guest/guest.service.js';

describe('QR Ordering System v1.2 - Acceptance Tests', () => {
    let tenantId: string;
    let tableA01Id: string;
    let tableA02Id: string;
    let waiterId: string;
    let cashierId: string;
    let managerId: string;
    let comGaItem: any;
    let traDaoItem: any;

    beforeAll(async () => {
        await seed();
        // List-price acceptance cases; promotions have dedicated regression coverage.
        await query('UPDATE promotions SET is_active = false');

        // Get tenant & users
        const tenantRes = await query(`SELECT id FROM tenants WHERE slug = 'pho-co'`);
        tenantId = tenantRes.rows[0].id;

        const tableA01Res = await query(`SELECT id FROM tables WHERE tenant_id = $1 AND table_number = 'A01'`, [tenantId]);
        tableA01Id = tableA01Res.rows[0].id;

        const tableA02Res = await query(`SELECT id FROM tables WHERE tenant_id = $1 AND table_number = 'A02'`, [tenantId]);
        tableA02Id = tableA02Res.rows[0].id;

        const usersRes = await query(`SELECT id, email FROM users`);
        managerId = usersRes.rows.find(u => u.email === 'admin@phoco.vn')!.id;
        waiterId = usersRes.rows.find(u => u.email === 'phucvu@phoco.vn')!.id;
        cashierId = usersRes.rows.find(u => u.email === 'thungan@phoco.vn')!.id;

        const menuRes = await query(`SELECT id, name, price FROM menu_items WHERE tenant_id = $1`, [tenantId]);
        comGaItem = menuRes.rows.find(i => i.name.includes('Bánh Tráng') || i.name.includes('Cơm Gà')) || menuRes.rows[0];
        traDaoItem = menuRes.rows.find(i => i.name.includes('Trà Đào')) || menuRes.rows[1];
    });

    it('AT01 & AT02: Public table menu can be viewed; joining closed table returns SESSION_NOT_OPEN', async () => {
        const publicData = await GuestService.getPublicTableMenu('qr-phoco-a01');
        expect(publicData).not.toBeNull();
        expect(publicData!.table.tableNumber).toBe('A01');
        expect(publicData!.menuItems.length).toBeGreaterThan(0);
        expect(publicData!.session).toBeNull(); // No session yet

        // Attempting to join before staff opened session
        await expect(GuestService.joinSession('qr-phoco-a01')).rejects.toMatchObject({
            code: 'SESSION_NOT_OPEN'
        });
    });

    it('AT03: Staff opens table session (F01)', async () => {
        const result = await StaffService.openSession(tenantId, tableA01Id, waiterId);
        expect(result.sessionId).toBeDefined();
        expect(result.tableNumber).toBe('A01');

        // Opening again returns existing session
        const secondOpen = await StaffService.openSession(tenantId, tableA01Id, waiterId);
        expect(secondOpen.sessionId).toBe(result.sessionId);
        expect(secondOpen.isExisting).toBe(true);
    });

    it('AT04 & AT09: Guest joins session and submits orders with idempotency', async () => {
        const guestJoin = await GuestService.joinSession('qr-phoco-a01');
        expect(guestJoin.sessionId).toBeDefined();

        // Round 1: 2 Cơm gà
        const order1 = await GuestService.createOrder(tenantId, guestJoin.sessionId, tableA01Id, {
            idempotencyKey: 'key-order-round-1',
            items: [{ menuItemId: comGaItem.id, quantity: 2 }]
        });
        expect(order1.orderNumber).toBe(1);
        expect(order1.items[0].status).toBe('PENDING');

        // Replaying same key returns same result (AT09)
        const order1Replay = await GuestService.createOrder(tenantId, guestJoin.sessionId, tableA01Id, {
            idempotencyKey: 'key-order-round-1',
            items: [{ menuItemId: comGaItem.id, quantity: 2 }]
        });
        expect(order1Replay.orderId).toBe(order1.orderId);

        // Replaying same key with different payload throws 409
        await expect(GuestService.createOrder(tenantId, guestJoin.sessionId, tableA01Id, {
            idempotencyKey: 'key-order-round-1',
            items: [{ menuItemId: comGaItem.id, quantity: 5 }]
        })).rejects.toMatchObject({
            code: 'IDEMPOTENCY_KEY_REUSED'
        });

        // Round 2: 3 Trà đào
        const order2 = await GuestService.createOrder(tenantId, guestJoin.sessionId, tableA01Id, {
            idempotencyKey: 'key-order-round-2',
            items: [{ menuItemId: traDaoItem.id, quantity: 3 }]
        });
        expect(order2.orderNumber).toBe(2);
    });

    it('AT05, AT06, AT07: Accept, partial serve and partial cancel', async () => {
        const guestJoin = await GuestService.joinSession('qr-phoco-a01');
        const orders = await GuestService.getSessionOrders(tenantId, guestJoin.sessionId);
        expect(orders.length).toBe(2);

        const comGaOrderItemId = orders[0].items[0].id;
        const traDaoOrderItemId = orders[1].items[0].id;

        // Accept Cơm gà (all 2)
        await StaffService.acceptOrderItem(tenantId, comGaOrderItemId, 2, waiterId);
        // Serve Cơm gà (all 2)
        await StaffService.serveOrderItem(tenantId, comGaOrderItemId, 2, waiterId);

        // Accept Trà đào (all 3)
        await StaffService.acceptOrderItem(tenantId, traDaoOrderItemId, 3, waiterId);

        // Partial serve: 2 served, 1 cancelled due to out of ingredients
        await StaffService.serveOrderItem(tenantId, traDaoOrderItemId, 2, waiterId);
        await StaffService.cancelOrderItem(tenantId, traDaoOrderItemId, 1, 'Hết nguyên liệu trà đào', waiterId);

        // Check bill summary according to Section 8.3:
        // 2 Food items served
        // 2 Drink items served
        // 1 Drink item cancelled (0đ)
        const expectedTotal = comGaItem.price * 2 + traDaoItem.price * 2;
        const summary = await GuestService.getBillSummary(tenantId, guestJoin.sessionId);
        expect(summary.servedTotal).toBe(expectedTotal);
        expect(summary.unresolvedCount).toBe(0);
        expect(summary.canConfirmPayment).toBe(true);
    });

    it('AT10: Repeated service requests return existing open request without spamming', async () => {
        const guestJoin = await GuestService.joinSession('qr-phoco-a01');

        const req1 = await GuestService.createServiceRequest(tenantId, guestJoin.sessionId, tableA01Id, 'CHECKOUT');
        expect(req1.isExisting).toBe(false);

        const req2 = await GuestService.createServiceRequest(tenantId, guestJoin.sessionId, tableA01Id, 'CHECKOUT');
        expect(req2.isExisting).toBe(true);
        expect(req2.request.id).toBe(req1.request.id);
        expect(req2.callCount).toBe(2);
    });

    it('AT12: Confirming payment when items are still pending/unresolved is blocked', async () => {
        // Create order on Table A02
        await StaffService.openSession(tenantId, tableA02Id, waiterId);
        const joinA02 = await GuestService.joinSession('qr-phoco-a02');
        await GuestService.createOrder(tenantId, joinA02.sessionId, tableA02Id, {
            idempotencyKey: 'key-order-a02-1',
            items: [{ menuItemId: comGaItem.id, quantity: 1 }]
        });

        const summaryA02 = await GuestService.getBillSummary(tenantId, joinA02.sessionId);
        expect(summaryA02.unresolvedCount).toBeGreaterThan(0);

        // Confirming should throw UNRESOLVED_ITEMS
        await expect(StaffService.confirmPaymentAndCloseSession(
            tenantId,
            joinA02.sessionId,
            summaryA02.settlementVersion,
            cashierId
        )).rejects.toMatchObject({
            code: 'UNRESOLVED_ITEMS'
        });
    });

    it('AT10, AT14, AT18, AT21: Atomic payment confirmation & session close (F10)', async () => {
        const guestJoin = await GuestService.joinSession('qr-phoco-a01');
        const summary = await GuestService.getBillSummary(tenantId, guestJoin.sessionId);

        // Confirm payment
        const settlement = await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            guestJoin.sessionId,
            summary.settlementVersion,
            cashierId,
            'Đã nhận tiền mặt'
        );

        expect(settlement.totalAmount).toBe(comGaItem.price * 2 + traDaoItem.price * 2);

        // Guest token should now be revoked (AT18)
        const sessionCheck = await query(`
            SELECT revoked_at FROM guest_sessions WHERE session_id = $1
        `, [guestJoin.sessionId]);
        expect(sessionCheck.rows[0].revoked_at).not.toBeNull();

        // Table readiness is now READY (no cleaning required)
        const tableCheck = await query(`SELECT readiness FROM tables WHERE id = $1`, [tableA01Id]);
        expect(tableCheck.rows[0].readiness).toBe('READY');
    });

    it('AT20: F12 close without charge for 0đ session', async () => {
        // Open table A01 again for new guest
        const newSession = await StaffService.openSession(tenantId, tableA01Id, waiterId);
        const closeResult = await StaffService.closeWithoutCharge(
            tenantId,
            newSession.sessionId,
            waiterId,
            'Khách ngồi nhầm bàn đổi ý về'
        );

        expect(closeResult.sessionId).toBe(newSession.sessionId);

        const billCheck = await query(`SELECT status, total_amount FROM bills WHERE session_id = $1`, [newSession.sessionId]);
        expect(billCheck.rows[0].status).toBe('CANCELLED');
        expect(Number(billCheck.rows[0].total_amount)).toBe(0);

        // Ensure 0đ empty session is NOT counted in confirmed invoices / reports
        const reportsRes = await query(`
            SELECT 
                COUNT(DISTINCT ts.id) as confirmed_sessions_count
            FROM table_sessions ts
            JOIN bills b ON b.session_id = ts.id
            LEFT JOIN manual_settlement_confirmations msc ON msc.session_id = ts.id
            WHERE ts.tenant_id = $1 
              AND b.status = 'CONFIRMED'
              AND COALESCE(msc.amount, b.total_amount, 0) > 0
        `, [tenantId]);
        expect(parseInt(reportsRes.rows[0].confirmed_sessions_count, 10)).toBe(1);
    });
});
