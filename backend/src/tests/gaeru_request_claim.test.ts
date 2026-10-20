import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../app.js';
import { query, pool } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { config } from '../config/index.js';
import crypto from 'node:crypto';

describe('Gaeru Flow Experiment: Table Request & Single Device Claim (P1)', () => {
    let server: any;
    let baseUrl: string;
    let staffToken: string;
    let tenantId: string;
    let tableA01Id: string;
    let tableA01QrId: string;
    let tableA02Id: string;
    let tableA02QrId: string;
    let menuItemId: string;

    const originalOrderingMode = config.orderingMode;

    beforeAll(async () => {
        // Enforce approved_single_device mode for this test suite
        (config as any).orderingMode = 'approved_single_device';

        await seed(true);

        // Start server on an ephemeral port
        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        // Login as manager (Pho Co)
        const staffRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@phoco.vn', password: '123456' })
        });
        expect(staffRes.status).toBe(200);
        const staffData: any = await staffRes.json();
        staffToken = staffData.token;
        tenantId = staffData.currentTenant?.id || staffData.user?.tenantId;

        // Fetch tables
        const tablesRes = await query(`
            SELECT id, public_qr_id, table_number
            FROM tables
            WHERE tenant_id = $1
            ORDER BY table_number ASC
        `, [tenantId]);
        tableA01Id = tablesRes.rows[0].id;
        tableA01QrId = tablesRes.rows[0].public_qr_id;
        tableA02Id = tablesRes.rows[1].id;
        tableA02QrId = tablesRes.rows[1].public_qr_id;

        // Fetch a menu item
        const itemRes = await query(`
            SELECT id FROM menu_items WHERE tenant_id = $1 AND is_available = true LIMIT 1
        `, [tenantId]);
        menuItemId = itemRes.rows[0].id;
    });

    afterAll(async () => {
        (config as any).orderingMode = originalOrderingMode;
        if (server) {
            await new Promise<void>((resolve) => server.close(resolve));
        }
    });

    const createDeviceCookie = () => crypto.randomBytes(32).toString('hex');

    describe('1. EX01: Concurrency on Table Open Request (2 Devices Overlap)', () => {
        it('allows exactly 1 request to win PENDING_APPROVAL and blocks the loser with 409', async () => {
            // Ensure table A01 has no active sessions
            await query(`UPDATE table_sessions SET status = 'CLOSED' WHERE table_id = $1`, [tableA01Id]);

            const dev1 = createDeviceCookie();
            const dev2 = createDeviceCookie();
            const req1Id = crypto.randomUUID();
            const req2Id = crypto.randomUUID();

            // Send two requests concurrently
            const [res1, res2] = await Promise.all([
                fetch(`${baseUrl}/api/v1/public/tables/${tableA01QrId}/request-open`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': `order_device=${dev1}`
                    },
                    body: JSON.stringify({ requestId: req1Id, guestName: 'Khách Device 1' })
                }),
                fetch(`${baseUrl}/api/v1/public/tables/${tableA01QrId}/request-open`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': `order_device=${dev2}`
                    },
                    body: JSON.stringify({ requestId: req2Id, guestName: 'Khách Device 2' })
                })
            ]);

            const statuses = [res1.status, res2.status].sort();
            expect(statuses).toEqual([201, 409]);

            const winnerRes = res1.status === 201 ? res1 : res2;
            const loserRes = res1.status === 409 ? res1 : res2;

            const winnerData: any = await winnerRes.json();
            const loserData: any = await loserRes.json();

            expect(winnerData.status).toBe('PENDING_APPROVAL');
            expect(loserData.code).toBe('TABLE_REQUEST_PENDING');

            // DB assertion: Exactly 1 row in PENDING_APPROVAL
            const activeRes = await query(`
                SELECT id, status, requester_device_hash, requester_guest_name
                FROM table_sessions
                WHERE table_id = $1 AND status IN ('PENDING_APPROVAL', 'OPEN')
            `, [tableA01Id]);
            expect(activeRes.rows.length).toBe(1);
            expect(activeRes.rows[0].status).toBe('PENDING_APPROVAL');
        });
    });

    describe('2. EX02: 15-Minute Expiration & Idempotent Retries', () => {
        it('returns existing pending session on idempotent retry with same requestId and device', async () => {
            // Find current pending session on A01
            const curRes = await query(`
                SELECT request_id, requester_device_hash, requester_guest_name
                FROM table_sessions
                WHERE table_id = $1 AND status = 'PENDING_APPROVAL'
            `, [tableA01Id]);
            expect(curRes.rows.length).toBe(1);
            const cur = curRes.rows[0];

            // Query device cookie that hashes to cur.requester_device_hash
            // For this test, create a fresh pending session with known cookie
            await query(`UPDATE table_sessions SET status = 'CLOSED' WHERE table_id = $1`, [tableA01Id]);

            const devToken = createDeviceCookie();
            const reqId = crypto.randomUUID();

            const createRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01QrId}/request-open`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `order_device=${devToken}`
                },
                body: JSON.stringify({ requestId: reqId, guestName: 'Khách Thử Nghiệm' })
            });
            expect(createRes.status).toBe(201);

            // Re-send with same requestId and cookie
            const retryRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01QrId}/request-open`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `order_device=${devToken}`
                },
                body: JSON.stringify({ requestId: reqId, guestName: 'Khách Thử Nghiệm' })
            });
            expect(retryRes.status).toBe(200);
            const retryData: any = await retryRes.json();
            expect(retryData.status).toBe('PENDING_APPROVAL');
            expect(retryData.requestId).toBe(reqId);
        });

        it('fails approval with 409 REQUEST_EXPIRED when pending session is older than 15 minutes', async () => {
            // Fast-forward expires_at to 1 second ago
            await query(`
                UPDATE table_sessions
                SET expires_at = NOW() - INTERVAL '1 second'
                WHERE table_id = $1 AND status = 'PENDING_APPROVAL'
            `, [tableA01Id]);

            const approveRes = await fetch(`${baseUrl}/api/v1/staff/tables/${tableA01Id}/approve-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({})
            });
            expect(approveRes.status).toBe(409);
            const approveData: any = await approveRes.json();
            expect(approveData.code).toBe('REQUEST_EXPIRED');

            // Session must now be closed with close_reason = 'EXPIRED'
            const checkRes = await query(`
                SELECT status, close_reason
                FROM table_sessions
                WHERE table_id = $1
                ORDER BY created_at DESC LIMIT 1
            `, [tableA01Id]);
            expect(checkRes.rows[0].status).toBe('CLOSED');
            expect(checkRes.rows[0].close_reason).toBe('EXPIRED');

            // Table is now free for new request
            const newDev = createDeviceCookie();
            const newRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01QrId}/request-open`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `order_device=${newDev}`
                },
                body: JSON.stringify({ requestId: crypto.randomUUID(), guestName: 'Khách Mới' })
            });
            expect(newRes.status).toBe(201);
        });
    });

    describe('3. EX03: Privacy & Read-Only Viewer Isolation', () => {
        it('hides requester name, session ID and tokens from other devices in public menu response', async () => {
            const devViewer = createDeviceCookie();

            const menuRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01QrId}/menu`, {
                headers: { 'Cookie': `order_device=${devViewer}` }
            });
            expect(menuRes.status).toBe(200);
            const data: any = await menuRes.json();

            expect(data.table.table_status).toBe('PENDING');
            expect(data.table.device_state).toBe('VIEWER');
            expect(data.table.can_order).toBe(false);
            expect(data.table.can_request).toBe(false);

            // Privacy verification: requester name and tokens MUST NOT be leaked
            expect(data.table.request).toBeNull();
            expect(data.session).toBeNull();
            expect(JSON.stringify(data)).not.toContain('Khách Mới');
        });
    });

    describe('4. EX04: Exclusive Claim & Second Device Blocking', () => {
        let claimedCookie: string;
        let claimedToken: string;
        let otherCookie: string;

        it('grants exclusive claim to Device 1 upon staff approval and allows Device 1 to order', async () => {
            // Clean table A01
            await query(`UPDATE table_sessions SET status = 'CLOSED' WHERE table_id = $1`, [tableA01Id]);

            claimedCookie = createDeviceCookie();
            otherCookie = createDeviceCookie();

            // Device 1 requests table open
            const reqRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01QrId}/request-open`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `order_device=${claimedCookie}`
                },
                body: JSON.stringify({ requestId: crypto.randomUUID(), guestName: 'Khách Độc Quyền' })
            });
            expect(reqRes.status).toBe(201);

            // Staff approves request
            const approveRes = await fetch(`${baseUrl}/api/v1/staff/tables/${tableA01Id}/approve-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({})
            });
            expect(approveRes.status).toBe(200);
            const approveData: any = await approveRes.json();
            claimedToken = approveData.token;
            expect(claimedToken).toBeDefined();

            // Device 1 joins session
            const joinRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01QrId}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `order_device=${claimedCookie}`
                },
                body: JSON.stringify({})
            });
            expect(joinRes.status).toBe(200);

            // Device 1 places order -> MUST SUCCEED (201)
            const orderRes = await fetch(`${baseUrl}/api/v1/guest/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-guest-token': claimedToken,
                    'Cookie': `order_device=${claimedCookie}`
                },
                body: JSON.stringify({
                    idempotencyKey: crypto.randomUUID(),
                    items: [{ menuItemId, quantity: 1 }]
                })
            });
            expect(orderRes.status).toBe(201);
            const orderData: any = await orderRes.json();
            expect(orderData.orderNumber).toBe(1);
        });

        it('blocks Device 2 from placing orders with 403 DEVICE_NOT_CLAIMED', async () => {
            // Device 2 attempts to use Device 1 token with Device 2 cookie
            const orderRes = await fetch(`${baseUrl}/api/v1/guest/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-guest-token': claimedToken,
                    'Cookie': `order_device=${otherCookie}`
                },
                body: JSON.stringify({
                    idempotencyKey: crypto.randomUUID(),
                    items: [{ menuItemId, quantity: 1 }]
                })
            });
            expect(orderRes.status).toBe(403);
            const errData: any = await orderRes.json();
            expect(errData.code).toBe('DEVICE_NOT_CLAIMED');
        });

        it('retains claim on Device 1 upon page reload (same device cookie)', async () => {
            // Device 1 re-checks public menu
            const menuRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01QrId}/menu`, {
                headers: { 'Cookie': `order_device=${claimedCookie}` }
            });
            expect(menuRes.status).toBe(200);
            const menuData: any = await menuRes.json();
            expect(menuData.table.device_state).toBe('CLAIMED');
            expect(menuData.table.can_order).toBe(true);

            // Device 1 places another order (Lần 2)
            const order2Res = await fetch(`${baseUrl}/api/v1/guest/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-guest-token': claimedToken,
                    'Cookie': `order_device=${claimedCookie}`
                },
                body: JSON.stringify({
                    idempotencyKey: crypto.randomUUID(),
                    items: [{ menuItemId, quantity: 2 }]
                })
            });
            expect(order2Res.status).toBe(201);
            const order2Data: any = await order2Res.json();
            expect(order2Data.orderNumber).toBe(2);
        });
    });

    describe('5. EX04b: Staff Release Claim & Revocation', () => {
        it('releases claim, increments claim_version, and revokes Device 1 access', async () => {
            const releaseRes = await fetch(`${baseUrl}/api/v1/staff/tables/${tableA01Id}/release-claim`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                }
            });
            expect(releaseRes.status).toBe(200);
            const releaseData: any = await releaseRes.json();
            expect(releaseData.status).toBe('CLAIM_RELEASED');
            expect(releaseData.claimVersion).toBeGreaterThan(1);

            // Check database: claimed_device_hash is NULL
            const sessionRes = await query(`
                SELECT claimed_device_hash, claim_version
                FROM table_sessions
                WHERE table_id = $1 AND status = 'OPEN'
            `, [tableA01Id]);
            expect(sessionRes.rows[0].claimed_device_hash).toBeNull();

            // Device 1 token is revoked in guest_sessions
            const tokenRes = await query(`
                SELECT revoked_at FROM guest_sessions WHERE table_id = $1
            `, [tableA01Id]);
            expect(tokenRes.rows.every(r => r.revoked_at !== null)).toBe(true);
        });
    });

    describe('6. EX08: Concurrency Race (Customer Withdraw vs Staff Approve)', () => {
        it('resolves with exactly one winner when withdraw and approve race on a pending request', async () => {
            // Clean table A02
            await query(`UPDATE table_sessions SET status = 'CLOSED' WHERE table_id = $1`, [tableA02Id]);

            const devToken = createDeviceCookie();
            const reqId = crypto.randomUUID();

            const createRes = await fetch(`${baseUrl}/api/v1/public/tables/${tableA02QrId}/request-open`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `order_device=${devToken}`
                },
                body: JSON.stringify({ requestId: reqId, guestName: 'Khách Đua Lệnh' })
            });
            expect(createRes.status).toBe(201);

            // Client 1 (Customer withdraw) races with Client 2 (Staff approve)
            const [withdrawRes, approveRes] = await Promise.all([
                fetch(`${baseUrl}/api/v1/public/tables/${tableA02QrId}/withdraw-request`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': `order_device=${devToken}`
                    },
                    body: JSON.stringify({ requestId: reqId })
                }),
                fetch(`${baseUrl}/api/v1/staff/tables/${tableA02Id}/approve-request`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${staffToken}`
                    },
                    body: JSON.stringify({})
                })
            ]);

            const statuses = [withdrawRes.status, approveRes.status].sort();
            expect(statuses).toEqual([200, 409]);

            // Database consistency check: Status is either OPEN or CLOSED, never corrupted
            const finalRes = await query(`
                SELECT status, close_reason FROM table_sessions WHERE request_id = $1
            `, [reqId]);
            expect(['OPEN', 'CLOSED']).toContain(finalRes.rows[0].status);
        });
    });

    describe('7. EX09: Rate Limiting on Table Open Requests', () => {
        it('blocks more than 6 requests in 10 minutes from the same device with HTTP 429', async () => {
            const spammerDev = createDeviceCookie();

            // Send 6 requests on different simulated/cleaned tables
            for (let i = 0; i < 6; i++) {
                // Insert a dummy session row to simulate 6 prior requests from this device hash
                const devHash = crypto.createHash('sha256').update(spammerDev).digest('hex');
                await query(`
                    INSERT INTO table_sessions (tenant_id, table_id, status, requested_at, requester_device_hash, request_id)
                    VALUES ($1, $2, 'CLOSED', NOW(), $3, $4)
                `, [tenantId, tableA01Id, devHash, crypto.randomUUID()]);
            }

            // 7th request must be rejected with 429 RATE_LIMIT_EXCEEDED
            const res = await fetch(`${baseUrl}/api/v1/public/tables/${tableA01QrId}/request-open`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `order_device=${spammerDev}`
                },
                body: JSON.stringify({ requestId: crypto.randomUUID(), guestName: 'Khách Spam' })
            });
            expect(res.status).toBe(429);
            const data: any = await res.json();
            expect(data.code).toBe('RATE_LIMIT_EXCEEDED');
        });
    });
});
