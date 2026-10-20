import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../../app.js';
import { query } from '../../db/pool.js';
import { seed } from '../../db/seed.js';
import { StaffService } from '../../modules/staff/staff.service.js';
import { GuestService } from '../../modules/guest/guest.service.js';

describe('UX-01: Guest Session Lifecycle & Isolation Suite (Issue #57, G-03, G-04)', () => {
    let server: http.Server;
    let baseUrl: string;
    let tenantId: string;
    let waiterId: string;
    let managerId: string;
    let tableA01Id: string;
    let tableA01Qr: string;
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

        const tableA01Res = await query(`SELECT id, public_qr_id FROM tables WHERE tenant_id = $1 AND table_number = 'A01'`, [tenantId]);
        tableA01Id = tableA01Res.rows[0].id;
        tableA01Qr = tableA01Res.rows[0].public_qr_id;

        const usersRes = await query(`SELECT id, email FROM users`);
        waiterId = usersRes.rows.find(u => u.email === 'phucvu@phoco.vn')!.id;
        managerId = usersRes.rows.find(u => u.email === 'admin@phoco.vn')!.id;

        const itemRes = await query(`SELECT id, price FROM menu_items WHERE tenant_id = $1 AND name LIKE '%Nem Chua Rán%' LIMIT 1`, [tenantId]);
        nemChuaId = itemRes.rows[0].id;
    });

    afterAll(async () => {
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    it('1. Unopened table: public menu returns session: null, joinSession fails, no bill data leaked', async () => {
        // Ensure table A01 has NO open session
        await query(`UPDATE table_sessions SET status = 'CLOSED' WHERE table_id = $1 AND status = 'OPEN'`, [tableA01Id]);

        // Public menu endpoint
        const menuRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01Qr}/menu`);
        expect(menuRes.status).toBe(200);
        const menuData = await menuRes.json();
        expect(menuData.table.tableNumber).toBe('A01');
        expect(menuData.session).toBeNull();
        expect(menuData.categories.length).toBeGreaterThan(0);

        // Attempting to join an unopened table session fails with SESSION_NOT_OPEN
        const joinRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01Qr}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceFingerprint: 'guest-browser-unopened' })
        });
        expect(joinRes.status).toBe(400);
        const joinData = await joinRes.json();
        expect(joinData.error).toBe('SESSION_NOT_OPEN');

        // Without token, guest endpoints are strictly rejected
        const billRes = await fetch(`${baseUrl}/api/v1/guest/bill-summary`);
        expect(billRes.status).toBe(401);
        const billData = await billRes.json();
        expect(billData.error).toBe('ACCESS_REVOKED');
    });

    it('2. Active session: guest joins, orders, and tracks real-time bill and orders', async () => {
        // Staff opens table A01
        const sessionRes = await StaffService.openSession(tenantId, tableA01Id, waiterId);
        expect(sessionRes.sessionId).toBeDefined();

        // Guest joins session
        const joinRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01Qr}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceFingerprint: 'guest-1-phone' })
        });
        expect(joinRes.status).toBe(200);
        const joinData = await joinRes.json();
        const guestToken = joinData.token;
        expect(joinData.sessionId).toBe(sessionRes.sessionId);

        // Guest orders 2x Nem Chua (60,000đ)
        const orderRes = await fetch(`${baseUrl}/api/v1/guest/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-guest-token': guestToken
            },
            body: JSON.stringify({
                idempotencyKey: 'ux01-order-nemchua-1',
                items: [{ menuItemId: nemChuaId, quantity: 2 }]
            })
        });
        expect(orderRes.status).toBe(201);

        // Waiter accepts and serves the order
        await StaffService.acceptAllPending(tenantId, sessionRes.sessionId, waiterId);
        await StaffService.serveAllAccepted(tenantId, sessionRes.sessionId, waiterId);

        // Guest views bill summary
        const billRes = await fetch(`${baseUrl}/api/v1/guest/bill-summary`, {
            headers: { 'x-guest-token': guestToken }
        });
        expect(billRes.status).toBe(200);
        const billData = await billRes.json();
        expect(billData.validBillTotal).toBe(63000); // 60,000đ + 5% VAT = 63,000đ
        expect(billData.sessionStatus).toBe('OPEN');
        expect(billData.isClosed).toBeUndefined();

        // Guest views orders
        const ordersRes = await fetch(`${baseUrl}/api/v1/guest/orders`, {
            headers: { 'x-guest-token': guestToken }
        });
        expect(ordersRes.status).toBe(200);
        const ordersData = await ordersRes.json();
        expect(ordersData.orders.length).toBe(1);
        expect(ordersData.orders[0].items[0].name).toContain('Nem Chua');
    });

    it('3. Closed session: previous guest retains read-only receipt access, mutations blocked (Issue #57)', async () => {
        // Get active session on table A01
        const activeRes = await query(`SELECT id FROM table_sessions WHERE table_id = $1 AND status = 'OPEN'`, [tableA01Id]);
        const sessionId = activeRes.rows[0].id;

        // Guest 1 joins to get token
        const joinRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01Qr}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceFingerprint: 'guest-1-phone' })
        });
        const guest1Token = (await joinRes.json()).token;

        // Get current settlement version
        const sessionRow = await query(`SELECT settlement_version FROM table_sessions WHERE id = $1`, [sessionId]);
        const version = sessionRow.rows[0].settlement_version;

        // Manager settles and confirms payment, closing the session
        const settleRes = await StaffService.confirmPaymentAndCloseSession(
            tenantId,
            sessionId,
            version,
            managerId,
            'Paid in cash',
            'ux01-req-settle',
            63000
        );
        expect(settleRes.sessionId).toBe(sessionId);
        expect(settleRes.totalAmount).toBe(63000);

        // 3a. GuestService returns the immutable closed bill snapshot for this session
        const receiptData = await GuestService.getBillSummary(tenantId, sessionId);
        expect(receiptData.sessionId).toBe(sessionId);
        expect(receiptData.sessionStatus).toBe('CLOSED');
        expect(receiptData.isClosed).toBe(true);
        expect(receiptData.validBillTotal).toBe(63000);
        expect(receiptData.rounds.length).toBeGreaterThan(0);

        // 3b. Guest access token is revoked on settlement to prevent further live interactions (PR #54 security invariant)
        const postCloseBillRes = await fetch(`${baseUrl}/api/v1/guest/bill-summary`, {
            headers: { 'x-guest-token': guest1Token }
        });
        expect(postCloseBillRes.status).toBe(401);
        const postCloseBillData = await postCloseBillRes.json();
        expect(postCloseBillData.error).toBe('ACCESS_REVOKED');

        // 3c. Guest 1 attempts mutation (calling new order) on closed session -> blocked
        const failOrderRes = await fetch(`${baseUrl}/api/v1/guest/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-guest-token': guest1Token
            },
            body: JSON.stringify({
                idempotencyKey: 'ux01-closed-order-fail',
                items: [{ menuItemId: nemChuaId, quantity: 1 }]
            })
        });
        expect([401, 403]).toContain(failOrderRes.status);

        // 3d. Guest 1 attempts service request on closed session -> blocked
        const failServiceRes = await fetch(`${baseUrl}/api/v1/guest/service-requests`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-guest-token': guest1Token
            },
            body: JSON.stringify({ type: 'ASSISTANCE', note: 'Can I order more?' })
        });
        expect([401, 403]).toContain(failServiceRes.status);

        // 3e. Official immutable receipt access: guest 1 fetches server-verified receipt
        const receiptRes = await fetch(`${baseUrl}/api/v1/guest/receipt`, {
            headers: { 'x-guest-token': guest1Token }
        });
        expect(receiptRes.status).toBe(200);
        const receipt = await receiptRes.json();
        expect(receipt.isClosed).toBe(true);
        expect(receipt.settled).toBe(true);
        expect(receipt.closeReason).toBe('CONFIRMED_SETTLED');
        expect(receipt.totalAmount).toBe(63000);
        expect(receipt.billLines.length).toBeGreaterThan(0);
        expect(receipt.billLines[0].itemName).toContain('Nem Chua');

        // Unauthenticated access to receipt is rejected
        const noAuthReceipt = await fetch(`${baseUrl}/api/v1/guest/receipt`);
        expect(noAuthReceipt.status).toBe(401);
    });

    it('4. New scan isolation: new guest scanning closed table sees unopened state, zero data leakage', async () => {
        // Table A01 is now closed with no open session
        // A new guest scans Table A01 (no token)
        const publicMenuRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01Qr}/menu`);
        expect(publicMenuRes.status).toBe(200);
        const publicMenuData = await publicMenuRes.json();
        expect(publicMenuData.table.tableNumber).toBe('A01');
        // Critical: session is null, previous customer's orders/bill are NOT in the public menu
        expect(publicMenuData.session).toBeNull();

        // New guest cannot join unopened session
        const newJoinRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01Qr}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceFingerprint: 'guest-2-new-scan' })
        });
        expect(newJoinRes.status).toBe(400);
        expect((await newJoinRes.json()).error).toBe('SESSION_NOT_OPEN');

        // New guest without token cannot access any previous bill
        const noTokenBillRes = await fetch(`${baseUrl}/api/v1/guest/bill-summary`);
        expect(noTokenBillRes.status).toBe(401);
    });

    it('5. Table re-opened: new party gets completely clean session, old bill remains in ledger', async () => {
        // Staff opens Table A01 for a second customer (Session 2)
        const session2 = await StaffService.openSession(tenantId, tableA01Id, waiterId);
        expect(session2.sessionId).toBeDefined();

        // New guest joins Session 2
        const join2Res = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01Qr}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceFingerprint: 'guest-2-party' })
        });
        expect(join2Res.status).toBe(200);
        const guest2Data = await join2Res.json();
        expect(guest2Data.sessionId).toBe(session2.sessionId);

        // Guest 2 checks bill summary: must be 0đ (zero previous session leakage)
        const bill2Res = await fetch(`${baseUrl}/api/v1/guest/bill-summary`, {
            headers: { 'x-guest-token': guest2Data.token }
        });
        expect(bill2Res.status).toBe(200);
        const bill2Data = await bill2Res.json();
        expect(bill2Data.sessionId).toBe(session2.sessionId);
        expect(bill2Data.validBillTotal).toBe(0);
        expect(bill2Data.rounds.length).toBe(0);

        // Check database: Session 1's confirmed bill and orders still exist 100% intact (financial history preserved)
        const oldBillsRes = await query(`SELECT COUNT(*) as count FROM bills WHERE tenant_id = $1 AND status = 'CONFIRMED'`, [tenantId]);
        expect(parseInt(oldBillsRes.rows[0].count, 10)).toBeGreaterThan(0);

        // Clean up session 2
        await StaffService.closeWithoutCharge(tenantId, session2.sessionId, managerId, 'Test cleanup');
    });

    it('6. Close without charge: receipt clearly identifies CLOSED_WITHOUT_CHARGE, not settled', async () => {
        // Staff opens Table A02
        const tableA02Res = await query(`SELECT id, public_qr_id FROM tables WHERE tenant_id = $1 AND table_number = 'A02'`, [tenantId]);
        const a02Id = tableA02Res.rows[0].id;
        const a02Qr = tableA02Res.rows[0].public_qr_id;

        const sessionRes = await StaffService.openSession(tenantId, a02Id, waiterId);
        
        // Guest joins
        const joinRes = await fetch(`${baseUrl}/api/v1/public/tables/${a02Qr}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceFingerprint: 'guest-a02-phone' })
        });
        const guestToken = (await joinRes.json()).token;

        // Staff closes without charge
        await StaffService.closeWithoutCharge(tenantId, sessionRes.sessionId, managerId, 'Customer changed mind');

        // Guest fetches receipt
        const receiptRes = await fetch(`${baseUrl}/api/v1/guest/receipt`, {
            headers: { 'x-guest-token': guestToken }
        });
        expect(receiptRes.status).toBe(200);
        const receipt = await receiptRes.json();
        expect(receipt.isClosed).toBe(true);
        expect(receipt.settled).toBe(false);
        expect(receipt.closeReason).toBe('Customer changed mind');
        expect(receipt.totalAmount).toBe(0);
        expect(receipt.billLines).toEqual([]);
    });
});
