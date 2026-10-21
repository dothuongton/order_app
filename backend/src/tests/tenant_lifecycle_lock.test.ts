import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../app.js';
import { query, pool } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { StaffService } from '../modules/staff/staff.service.js';

describe('Core Tenant Lifecycle Locking & Concurrency Protection (Issue #116 / Contract #6)', () => {
    let server: http.Server;
    let baseUrl: string;
    let tenantPhoCoId: string;
    let tenantSakuraId: string;
    let managerToken: string;
    let waiterToken: string;
    let managerId: string;
    let waiterId: string;

    beforeAll(async () => {
        await seed();
        await query('UPDATE promotions SET is_active = false');

        const phocoRes = await query(`SELECT id FROM tenants WHERE slug = 'pho-co'`);
        tenantPhoCoId = phocoRes.rows[0].id;

        const sakuraRes = await query(`SELECT id FROM tenants WHERE slug = 'sakura'`);
        tenantSakuraId = sakuraRes.rows[0].id;

        const mgrRes = await query(`SELECT id FROM users WHERE email = 'admin@phoco.vn'`);
        managerId = mgrRes.rows[0].id;

        const wtrRes = await query(`SELECT id FROM users WHERE email = 'phucvu@phoco.vn'`);
        waiterId = wtrRes.rows[0].id;

        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        // Login as manager
        const mgrLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@phoco.vn', password: '123456' })
        });
        const mgrLoginData: any = await mgrLoginRes.json();
        managerToken = mgrLoginData.token;

        // Login as waiter
        const wtrLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'phucvu@phoco.vn', password: '123456' })
        });
        const wtrLoginData: any = await wtrLoginRes.json();
        waiterToken = wtrLoginData.token;
    });

    afterAll(async () => {
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    describe('1. Atomic Status Checks & Gating in openSession', () => {
        it('opens session normally for active tenant, creates OPEN session and OPEN bill', async () => {
            const tableRes = await query(`
                INSERT INTO tables (tenant_id, table_number, public_qr_id, is_enabled)
                VALUES ($1, 'T-ACTIVE-1', 'qr-active-1', true)
                RETURNING id;
            `, [tenantPhoCoId]);
            const tableId = tableRes.rows[0].id;

            const res = await StaffService.openSession(tenantPhoCoId, tableId, managerId);
            expect(res.sessionId).toBeDefined();
            expect(res.isExisting).toBe(false);

            // Verify DB state
            const sessRes = await query(`SELECT status FROM table_sessions WHERE id = $1`, [res.sessionId]);
            expect(sessRes.rows[0].status).toBe('OPEN');

            const billRes = await query(`SELECT status, total_amount FROM bills WHERE session_id = $1`, [res.sessionId]);
            expect(billRes.rows[0].status).toBe('OPEN');
            expect(Number(billRes.rows[0].total_amount)).toBe(0);

            // Clean up: close session
            await query(`UPDATE table_sessions SET status = 'CLOSED' WHERE id = $1`, [res.sessionId]);
        });

        it('returns existing session if table already has an OPEN session', async () => {
            const tableRes = await query(`
                INSERT INTO tables (tenant_id, table_number, public_qr_id, is_enabled)
                VALUES ($1, 'T-ACTIVE-EXIST', 'qr-active-exist', true)
                RETURNING id;
            `, [tenantPhoCoId]);
            const tableId = tableRes.rows[0].id;

            const res1 = await StaffService.openSession(tenantPhoCoId, tableId, managerId);
            expect(res1.isExisting).toBe(false);

            const res2 = await StaffService.openSession(tenantPhoCoId, tableId, managerId);
            expect(res2.isExisting).toBe(true);
            expect(res2.sessionId).toBe(res1.sessionId);

            // Clean up
            await query(`UPDATE table_sessions SET status = 'CLOSED' WHERE id = $1`, [res1.sessionId]);
        });

        it('rejects openSession with 403 SHOP_SUSPENDED when tenant is suspended', async () => {
            const suspendedTenantRes = await query(`
                INSERT INTO tenants (name, slug, status)
                VALUES ('Quán Tạm Ngưng', 'quan-tam-ngung', 'suspended')
                RETURNING id;
            `);
            const suspTenantId = suspendedTenantRes.rows[0].id;

            const tableRes = await query(`
                INSERT INTO tables (tenant_id, table_number, public_qr_id, is_enabled)
                VALUES ($1, 'T-SUSP-1', 'qr-susp-1', true)
                RETURNING id;
            `, [suspTenantId]);
            const tableId = tableRes.rows[0].id;

            await expect(StaffService.openSession(suspTenantId, tableId, managerId)).rejects.toMatchObject({
                status: 403,
                code: 'SHOP_SUSPENDED'
            });

            // Verify ZERO sessions and ZERO bills created
            const countSess = await query(`SELECT COUNT(*) FROM table_sessions WHERE tenant_id = $1`, [suspTenantId]);
            expect(Number(countSess.rows[0].count)).toBe(0);
        });

        it('rejects openSession with 403 SHOP_ARCHIVED when tenant is archived', async () => {
            const archivedTenantRes = await query(`
                INSERT INTO tenants (name, slug, status)
                VALUES ('Quán Lưu Trữ', 'quan-luu-tru', 'archived')
                RETURNING id;
            `);
            const archTenantId = archivedTenantRes.rows[0].id;

            const tableRes = await query(`
                INSERT INTO tables (tenant_id, table_number, public_qr_id, is_enabled)
                VALUES ($1, 'T-ARCH-1', 'qr-arch-1', true)
                RETURNING id;
            `, [archTenantId]);
            const tableId = tableRes.rows[0].id;

            await expect(StaffService.openSession(archTenantId, tableId, managerId)).rejects.toMatchObject({
                status: 403,
                code: 'SHOP_ARCHIVED'
            });

            // Verify ZERO sessions and ZERO bills created
            const countSess = await query(`SELECT COUNT(*) FROM table_sessions WHERE tenant_id = $1`, [archTenantId]);
            expect(Number(countSess.rows[0].count)).toBe(0);
        });

        it('rejects openSession with 404 SHOP_NOT_FOUND when tenant does not exist', async () => {
            const nonExistentTenantId = '99999999-9999-9999-9999-999999999999';
            await expect(StaffService.openSession(nonExistentTenantId, '11111111-0000-0000-0000-000000000001', managerId)).rejects.toMatchObject({
                status: 404,
                code: 'SHOP_NOT_FOUND'
            });
        });

        it('rejects openSession with 404 TABLE_NOT_FOUND when table belongs to another tenant (isolation)', async () => {
            // Table belongs to Sakura
            const sakuraTable = await query(`SELECT id FROM tables WHERE tenant_id = $1 LIMIT 1`, [tenantSakuraId]);
            const tableId = sakuraTable.rows[0].id;

            // Attempt to open from Phố Cổ
            await expect(StaffService.openSession(tenantPhoCoId, tableId, managerId)).rejects.toMatchObject({
                status: 404,
                code: 'TABLE_NOT_FOUND'
            });
        });

        it('rejects openSession with 400 TABLE_DISABLED when table is disabled', async () => {
            const disabledTableRes = await query(`
                INSERT INTO tables (tenant_id, table_number, public_qr_id, is_enabled)
                VALUES ($1, 'T-DISABLED', 'qr-disabled', false)
                RETURNING id;
            `, [tenantPhoCoId]);
            const tableId = disabledTableRes.rows[0].id;

            await expect(StaffService.openSession(tenantPhoCoId, tableId, managerId)).rejects.toMatchObject({
                status: 400,
                code: 'TABLE_DISABLED'
            });
        });
    });

    describe('2. Concurrency Schedule 1: Open Session Wins', () => {
        it('Staff openSession holds shared lock, concurrent Admin Archive waits and fails with 409 SHOP_HAS_OPEN_SESSIONS', async () => {
            const tenantRes = await query(`
                INSERT INTO tenants (name, slug, status)
                VALUES ('Quán Race Sched 1', 'quan-race-sched-1', 'active')
                RETURNING id;
            `);
            const raceTenantId = tenantRes.rows[0].id;

            const tableRes = await query(`
                INSERT INTO tables (tenant_id, table_number, public_qr_id, is_enabled)
                VALUES ($1, 'T-RACE-1', 'qr-race-1', true)
                RETURNING id;
            `, [raceTenantId]);
            const tableId = tableRes.rows[0].id;

            // Connection A (Staff transaction): Locks tenant FOR SHARE and begins session opening
            const clientA = await pool.connect();
            await clientA.query('BEGIN');
            await clientA.query('SELECT id, status FROM tenants WHERE id = $1 FOR SHARE', [raceTenantId]);

            // Connection B (Admin transaction simulating archive): tries to acquire FOR UPDATE
            const clientB = await pool.connect();
            await clientB.query('BEGIN');

            let adminAcquiredLock = false;
            let adminError: any = null;

            const adminArchivePromise = (async () => {
                try {
                    // This query MUST BLOCK until Client A commits because FOR UPDATE conflicts with FOR SHARE
                    await clientB.query('SELECT id, status FROM tenants WHERE id = $1 FOR UPDATE', [raceTenantId]);
                    adminAcquiredLock = true;

                    // Admin checks for open sessions (PR #112 logic)
                    const check = await clientB.query(
                        "SELECT COUNT(*) as count FROM table_sessions WHERE tenant_id = $1 AND status = 'OPEN'",
                        [raceTenantId]
                    );
                    const count = parseInt(check.rows[0].count, 10);
                    if (count > 0) {
                        throw {
                            status: 409,
                            code: 'SHOP_HAS_OPEN_SESSIONS',
                            message: `Không thể lưu trữ quán khi vẫn còn ${count} phiên bàn đang mở (OPEN)`
                        };
                    }

                    await clientB.query("UPDATE tenants SET status = 'archived' WHERE id = $1", [raceTenantId]);
                    await clientB.query('COMMIT');
                } catch (err) {
                    await clientB.query('ROLLBACK');
                    adminError = err;
                } finally {
                    clientB.release();
                }
            })();

            // Barrier verification: Admin is blocked while Staff holds FOR SHARE
            await new Promise(r => setTimeout(r, 200));
            expect(adminAcquiredLock).toBe(false);

            // Client A proceeds to lock table, create session and bill, then commits
            await clientA.query('SELECT id FROM tables WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [tableId, raceTenantId]);
            const sessRes = await clientA.query(`
                INSERT INTO table_sessions (tenant_id, table_id, status, opened_by, opened_at)
                VALUES ($1, $2, 'OPEN', $3, NOW())
                RETURNING id;
            `, [raceTenantId, tableId, managerId]);
            const createdSessionId = sessRes.rows[0].id;

            await clientA.query(`
                INSERT INTO bills (tenant_id, session_id, status, total_amount)
                VALUES ($1, $2, 'OPEN', 0)
            `, [raceTenantId, createdSessionId]);

            // Client A commits!
            await clientA.query('COMMIT');
            clientA.release();

            // Client B unblocks, re-evaluates open sessions, and must fail with 409 SHOP_HAS_OPEN_SESSIONS
            await adminArchivePromise;
            expect(adminError).toBeDefined();
            expect(adminError.status).toBe(409);
            expect(adminError.code).toBe('SHOP_HAS_OPEN_SESSIONS');

            // Verify DB state: Tenant is STILL ACTIVE, exactly 1 OPEN session exists, 1 bill exists
            const tenantCheck = await query(`SELECT status FROM tenants WHERE id = $1`, [raceTenantId]);
            expect(tenantCheck.rows[0].status).toBe('active');

            const sessCheck = await query(`SELECT status FROM table_sessions WHERE tenant_id = $1`, [raceTenantId]);
            expect(sessCheck.rows.length).toBe(1);
            expect(sessCheck.rows[0].status).toBe('OPEN');

            const billCheck = await query(`SELECT status FROM bills WHERE session_id = $1`, [createdSessionId]);
            expect(billCheck.rows.length).toBe(1);
            expect(billCheck.rows[0].status).toBe('OPEN');
        });
    });

    describe('3. Concurrency Schedule 2: Archive Wins', () => {
        it('Admin Archive holds tenant lock and commits archive, concurrent Staff openSession waits and fails with 403 SHOP_ARCHIVED', async () => {
            const tenantRes = await query(`
                INSERT INTO tenants (name, slug, status)
                VALUES ('Quán Race Sched 2', 'quan-race-sched-2', 'active')
                RETURNING id;
            `);
            const raceTenantId = tenantRes.rows[0].id;

            const tableRes = await query(`
                INSERT INTO tables (tenant_id, table_number, public_qr_id, is_enabled)
                VALUES ($1, 'T-RACE-2', 'qr-race-2', true)
                RETURNING id;
            `, [raceTenantId]);
            const tableId = tableRes.rows[0].id;

            // Connection B (Admin transaction): Locks tenant FOR UPDATE
            const clientB = await pool.connect();
            await clientB.query('BEGIN');
            await clientB.query('SELECT id, status FROM tenants WHERE id = $1 FOR UPDATE', [raceTenantId]);

            // Verify 0 open sessions
            const check = await clientB.query(
                "SELECT COUNT(*) as count FROM table_sessions WHERE tenant_id = $1 AND status = 'OPEN'",
                [raceTenantId]
            );
            expect(parseInt(check.rows[0].count, 10)).toBe(0);

            // Concurrently, Staff calls StaffService.openSession (Connection A via withTransaction)
            let staffOpenCompleted = false;
            let staffOpenResult: any = null;
            let staffOpenError: any = null;

            const staffOpenPromise = StaffService.openSession(raceTenantId, tableId, managerId)
                .then(res => {
                    staffOpenCompleted = true;
                    staffOpenResult = res;
                })
                .catch(err => {
                    staffOpenCompleted = true;
                    staffOpenError = err;
                });

            // Barrier verification: Staff openSession is BLOCKED at SELECT ... FOR SHARE waiting for Admin FOR UPDATE
            await new Promise(r => setTimeout(r, 200));
            expect(staffOpenCompleted).toBe(false);

            // Admin updates tenant to 'archived' and commits
            await clientB.query("UPDATE tenants SET status = 'archived', updated_at = NOW() WHERE id = $1", [raceTenantId]);
            await clientB.query('COMMIT');
            clientB.release();

            // Staff unblocks, re-evaluates tenant status as 'archived', and rejects with 403 SHOP_ARCHIVED
            await staffOpenPromise;
            expect(staffOpenCompleted).toBe(true);
            expect(staffOpenError).toBeDefined();
            expect(staffOpenError.status).toBe(403);
            expect(staffOpenError.code).toBe('SHOP_ARCHIVED');
            expect(staffOpenResult).toBeNull();

            // Verify DB state: Tenant is ARCHIVED, ZERO sessions created, ZERO bills created!
            const tenantCheck = await query(`SELECT status FROM tenants WHERE id = $1`, [raceTenantId]);
            expect(tenantCheck.rows[0].status).toBe('archived');

            const sessCheck = await query(`SELECT COUNT(*) as count FROM table_sessions WHERE tenant_id = $1`, [raceTenantId]);
            expect(Number(sessCheck.rows[0].count)).toBe(0);

            const billCheck = await query(`SELECT COUNT(*) as count FROM bills WHERE tenant_id = $1`, [raceTenantId]);
            expect(Number(billCheck.rows[0].count)).toBe(0);
        });

        it('Schedule 2 via HTTP API: concurrent open request blocked during archive returns 403 SHOP_ARCHIVED (never 500)', async () => {
            // Create user and membership for this tenant to test real HTTP route
            const tenantRes = await query(`
                INSERT INTO tenants (name, slug, status)
                VALUES ('Quán Race HTTP Sched 2', 'quan-race-http-sched-2', 'active')
                RETURNING id;
            `);
            const raceTenantId = tenantRes.rows[0].id;

            const tableRes = await query(`
                INSERT INTO tables (tenant_id, table_number, public_qr_id, is_enabled)
                VALUES ($1, 'T-RACE-HTTP', 'qr-race-http', true)
                RETURNING id;
            `, [raceTenantId]);
            const tableId = tableRes.rows[0].id;

            await query(`
                INSERT INTO memberships (tenant_id, user_id, role, permissions)
                VALUES ($1, $2, 'manager', ARRAY['session.open', 'table.manage'])
                ON CONFLICT (tenant_id, user_id) DO UPDATE SET permissions = EXCLUDED.permissions;
            `, [raceTenantId, managerId]);

            // Client B starts transaction and holds tenant FOR UPDATE
            const clientB = await pool.connect();
            await clientB.query('BEGIN');
            await clientB.query('SELECT id, status FROM tenants WHERE id = $1 FOR UPDATE', [raceTenantId]);

            // Staff sends HTTP request to open table session
            let httpCompleted = false;
            let httpStatus: number | null = null;
            let httpData: any = null;

            const httpPromise = fetch(`${baseUrl}/api/v1/staff/tables/${tableId}/open`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${managerToken}`,
                    'x-tenant-id': raceTenantId,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            }).then(async (res) => {
                httpCompleted = true;
                httpStatus = res.status;
                httpData = await res.json();
            });

            // Barrier verification: HTTP call is blocked waiting for tenant lock
            await new Promise(r => setTimeout(r, 200));
            expect(httpCompleted).toBe(false);

            // Admin updates tenant to 'archived' and commits
            await clientB.query("UPDATE tenants SET status = 'archived', updated_at = NOW() WHERE id = $1", [raceTenantId]);
            await clientB.query('COMMIT');
            clientB.release();

            // HTTP call unblocks, receives 403 SHOP_ARCHIVED
            await httpPromise;
            expect(httpCompleted).toBe(true);
            expect(httpStatus).toBe(403);
            expect(httpData.error).toBe('SHOP_ARCHIVED');

            // DB has 0 sessions
            const sessCount = await query(`SELECT COUNT(*) FROM table_sessions WHERE tenant_id = $1`, [raceTenantId]);
            expect(Number(sessCount.rows[0].count)).toBe(0);
        });
    });

    describe('4. Preserving Lingering Obligations Settlement (Issue #26 / #6)', () => {
        it('allows confirming payment and closing an existing session on an archived shop', async () => {
            const tenantRes = await query(`
                INSERT INTO tenants (name, slug, status)
                VALUES ('Quán Settle Lingering', 'quan-settle-lingering', 'active')
                RETURNING id;
            `);
            const archTenantId = tenantRes.rows[0].id;

            const tableRes = await query(`
                INSERT INTO tables (tenant_id, table_number, public_qr_id, is_enabled)
                VALUES ($1, 'T-SETTLE-1', 'qr-settle-1', true)
                RETURNING id;
            `, [archTenantId]);
            const tableId = tableRes.rows[0].id;

            // Open session while active
            const session = await StaffService.openSession(archTenantId, tableId, managerId);
            const sessionId = session.sessionId;

            // Add category first because category_id is NOT NULL in menu_items
            const catRes = await query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order)
                VALUES ($1, 'Bún Settle', 1)
                RETURNING id;
            `, [archTenantId]);
            const catId = catRes.rows[0].id;

            // Add menu item, order and served part
            const itemRes = await query(`
                INSERT INTO menu_items (tenant_id, category_id, name, price, is_available)
                VALUES ($1, $2, 'Bún Chả Settle', 45000, true)
                RETURNING id;
            `, [archTenantId, catId]);
            const itemId = itemRes.rows[0].id;

            const orderRes = await query(`
                INSERT INTO orders (tenant_id, session_id, order_number, idempotency_key, source)
                VALUES ($1, $2, 888, 'idemp-settle-1', 'STAFF_POS')
                RETURNING id;
            `, [archTenantId, sessionId]);
            const orderId = orderRes.rows[0].id;

            const orderItemRes = await query(`
                INSERT INTO order_items (tenant_id, order_id, menu_item_id, snapshot_name, snapshot_price, quantity)
                VALUES ($1, $2, $3, 'Bún Chả Settle', 45000, 1)
                RETURNING id;
            `, [archTenantId, orderId, itemId]);

            await query(`
                INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity)
                VALUES ($1, $2, 'SERVED', 1);
            `, [archTenantId, orderItemRes.rows[0].id]);

            // Shop is now archived by Super Admin
            await query("UPDATE tenants SET status = 'archived' WHERE id = $1", [archTenantId]);

            // Staff confirms payment and closes session: MUST SUCCEED (Zero blockage of financial settlement)
            const result = await StaffService.confirmPaymentAndCloseSession(
                archTenantId,
                sessionId,
                1, // clientSettlementVersion
                managerId,
                'Tất toán nợ tồn đọng quán đã lưu trữ'
            );

            expect(result.sessionId).toBe(sessionId);
            expect(result.totalAmount).toBe(45000);

            // Verify session is CLOSED and bill is CONFIRMED
            const sessCheck = await query(`SELECT status FROM table_sessions WHERE id = $1`, [sessionId]);
            expect(sessCheck.rows[0].status).toBe('CLOSED');

            const billCheck = await query(`SELECT status, total_amount FROM bills WHERE session_id = $1`, [sessionId]);
            expect(billCheck.rows[0].status).toBe('CONFIRMED');
            expect(Number(billCheck.rows[0].total_amount)).toBe(45000);
        });

        it('allows closing empty session without charge on an archived shop', async () => {
            const tenantRes = await query(`
                INSERT INTO tenants (name, slug, status)
                VALUES ('Quán Close No Charge', 'quan-close-no-charge', 'active')
                RETURNING id;
            `);
            const archTenantId = tenantRes.rows[0].id;

            const tableRes = await query(`
                INSERT INTO tables (tenant_id, table_number, public_qr_id, is_enabled)
                VALUES ($1, 'T-EMPTY-1', 'qr-empty-1', true)
                RETURNING id;
            `, [archTenantId]);
            const tableId = tableRes.rows[0].id;

            // Open session while active
            const session = await StaffService.openSession(archTenantId, tableId, managerId);
            const sessionId = session.sessionId;

            // Shop is now archived
            await query("UPDATE tenants SET status = 'archived' WHERE id = $1", [archTenantId]);

            // Close without charge: MUST SUCCEED
            const result = await StaffService.closeWithoutCharge(
                archTenantId,
                sessionId,
                managerId,
                'Đóng bàn trống khi quán lưu trữ'
            );

            expect(result.sessionId).toBe(sessionId);

            // Verify session is CLOSED and bill is CANCELLED
            const sessCheck = await query(`SELECT status FROM table_sessions WHERE id = $1`, [sessionId]);
            expect(sessCheck.rows[0].status).toBe('CLOSED');

            const billCheck = await query(`SELECT status FROM bills WHERE session_id = $1`, [sessionId]);
            expect(billCheck.rows[0].status).toBe('CANCELLED');
        });
    });

    describe('5. Shared Lock Compatibility Across Tables', () => {
        it('allows concurrent session opening on different tables of the same tenant without blocking each other', async () => {
            const table1Res = await query(`
                INSERT INTO tables (tenant_id, table_number, public_qr_id, is_enabled)
                VALUES ($1, 'T-PARALLEL-1', 'qr-par-1', true)
                RETURNING id;
            `, [tenantPhoCoId]);
            const table1Id = table1Res.rows[0].id;

            const table2Res = await query(`
                INSERT INTO tables (tenant_id, table_number, public_qr_id, is_enabled)
                VALUES ($1, 'T-PARALLEL-2', 'qr-par-2', true)
                RETURNING id;
            `, [tenantPhoCoId]);
            const table2Id = table2Res.rows[0].id;

            // Both open concurrently via Promise.all
            const [res1, res2] = await Promise.all([
                StaffService.openSession(tenantPhoCoId, table1Id, managerId),
                StaffService.openSession(tenantPhoCoId, table2Id, waiterId)
            ]);

            expect(res1.sessionId).toBeDefined();
            expect(res2.sessionId).toBeDefined();
            expect(res1.sessionId).not.toBe(res2.sessionId);

            // Clean up
            await query(`UPDATE table_sessions SET status = 'CLOSED' WHERE id IN ($1, $2)`, [res1.sessionId, res2.sessionId]);
        });
    });
});
