import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'http';
import { app } from '../app.js';
import { query } from '../db/pool.js';
import { ReportingService } from '../modules/reports/reporting.service.js';
import { StaffService } from '../modules/staff/staff.service.js';

describe('Daily Shop Stats Read Model (Issue #45)', () => {
    let server: Server;
    let baseUrl: string;

    const seedTenantId = '11111111-1111-1111-1111-111111111111';
    let managerToken: string;

    beforeAll(async () => {
        // Run migration to ensure table exists in test DB
        await query(`
            CREATE TABLE IF NOT EXISTS daily_shop_stats (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                stat_date DATE NOT NULL,
                confirmed_sessions_count INT NOT NULL DEFAULT 0,
                gross_amount BIGINT NOT NULL DEFAULT 0,
                net_amount BIGINT NOT NULL DEFAULT 0,
                discount_amount BIGINT NOT NULL DEFAULT 0,
                order_items_count INT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_daily_shop_stats UNIQUE (tenant_id, stat_date)
            );
            CREATE INDEX IF NOT EXISTS idx_daily_shop_stats_tenant_date ON daily_shop_stats(tenant_id, stat_date DESC);
        `);

        server = createServer(app);
        await new Promise<void>((resolve) => {
            server.listen(0, () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        // Login as manager of Phố Cổ
        const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@phoco.vn', password: '123456' })
        });
        const loginData: any = await loginRes.json();
        managerToken = loginData.token;
    });

    afterAll(async () => {
        await query('DELETE FROM daily_shop_stats WHERE tenant_id = $1', [seedTenantId]);
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('1. computes daily stats idempotently without duplication', async () => {
        const testDate = '2026-10-22';

        // 1st run
        const stat1 = await ReportingService.computeDailyShopStats(seedTenantId, testDate);
        expect(stat1).toBeDefined();
        expect(stat1.tenantId).toBe(seedTenantId);
        expect(stat1.statDate).toBe(testDate);
        expect(typeof stat1.confirmedSessionsCount).toBe('number');
        expect(typeof stat1.netAmount).toBe('number');
        expect(typeof stat1.grossAmount).toBe('number');
        expect(typeof stat1.discountAmount).toBe('number');

        // 2nd run on same date (idempotent update)
        const stat2 = await ReportingService.computeDailyShopStats(seedTenantId, testDate);
        expect(stat2.id).toBe(stat1.id);
        expect(stat2.confirmedSessionsCount).toBe(stat1.confirmedSessionsCount);
        expect(stat2.netAmount).toBe(stat1.netAmount);

        // Verify only 1 row exists in DB for this tenant and date
        const countRes = await query(
            'SELECT COUNT(*)::int as count FROM daily_shop_stats WHERE tenant_id = $1 AND stat_date = $2',
            [seedTenantId, testDate]
        );
        expect(countRes.rows[0].count).toBe(1);
    });

    it('2. supports zero-day stats when there is no activity', async () => {
        const zeroDate = '2020-01-01';
        const stat = await ReportingService.computeDailyShopStats(seedTenantId, zeroDate);

        expect(stat.confirmedSessionsCount).toBe(0);
        expect(stat.grossAmount).toBe(0);
        expect(stat.netAmount).toBe(0);
        expect(stat.discountAmount).toBe(0);
        expect(stat.orderItemsCount).toBe(0);
    });

    it('3. retrieves bounded daily stats with date filters', async () => {
        const stats = await ReportingService.getDailyShopStats(
            seedTenantId,
            '2026-01-01',
            '2026-12-31'
        );

        expect(Array.isArray(stats)).toBe(true);
        expect(stats.length).toBeGreaterThanOrEqual(1);
        expect(stats[0].tenantId).toBe(seedTenantId);
    });

    it('4. exposes staff API endpoint with proper authentication & tenant scope', async () => {
        // Authenticated request
        const res = await fetch(`${baseUrl}/api/v1/staff/reports/daily-stats?from=2026-01-01&to=2026-12-31`, {
            headers: { 'Authorization': `Bearer ${managerToken}` }
        });

        expect(res.status).toBe(200);
        const data: any = await res.json();
        expect(data.stats).toBeDefined();
        expect(Array.isArray(data.stats)).toBe(true);

        // Unauthenticated request
        const unauthRes = await fetch(`${baseUrl}/api/v1/staff/reports/daily-stats`);
        expect(unauthRes.status).toBe(401);
    });

    it('5. isolates stats by tenant ID', async () => {
        const fakeTenantId = '22222222-2222-2222-2222-222222222222';
        const stats = await ReportingService.getDailyShopStats(fakeTenantId);
        expect(stats.length).toBe(0);
    });

    it('6. auto-updates daily_shop_stats upon confirmPaymentAndCloseSession (PERF-01)', async () => {
        const tableRes = await query(`SELECT id FROM tables WHERE tenant_id = $1 LIMIT 1`, [seedTenantId]);
        const seedTableId = tableRes.rows[0].id;

        // Open a session
        const openRes = await fetch(`${baseUrl}/api/v1/staff/tables/${seedTableId}/open`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${managerToken}` }
        });
        expect(openRes.status).toBe(201);
        const { sessionId } = await openRes.json() as any;

        // Place an order
        const itemRes = await query(`SELECT id, name, price FROM menu_items WHERE tenant_id = $1 LIMIT 1`, [seedTenantId]);
        const item = itemRes.rows[0];

        const orderRes = await query(`
            INSERT INTO orders (tenant_id, session_id, order_number, source, idempotency_key)
            VALUES ($1, $2, 1, 'STAFF_POS', $3)
            RETURNING id
        `, [seedTenantId, sessionId, `perf-01-order-${Date.now()}`]);
        const orderId = orderRes.rows[0].id;

        const orderItemRes = await query(`
            INSERT INTO order_items (tenant_id, order_id, menu_item_id, snapshot_name, snapshot_price, quantity)
            VALUES ($1, $2, $3, $4, $5, 1)
            RETURNING id
        `, [seedTenantId, orderId, item.id, item.name, item.price]);
        const orderItemId = orderItemRes.rows[0].id;

        await query(`
            INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity)
            VALUES ($1, $2, 'SERVED', 1)
        `, [seedTenantId, orderItemId]);

        // Settle session
        const managerUserRes = await query(`SELECT id FROM users WHERE email = 'admin@phoco.vn' LIMIT 1`);
        const managerId = managerUserRes.rows[0].id;

        try {
            await StaffService.confirmPaymentAndCloseSession(
                seedTenantId,
                sessionId,
                1,
                managerId,
                'PERF-01 auto update test'
            );
        } catch (err) {
            console.error('CONFIRM ERROR IN TEST 6:', err);
        }

        // Verify daily_shop_stats contains record for today
        const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
        const statsRes = await fetch(`${baseUrl}/api/v1/staff/reports/daily-stats?from=${todayDate}&to=${todayDate}`, {
            headers: { 'Authorization': `Bearer ${managerToken}` }
        });
        const statsData = await statsRes.json() as any;
        expect(statsRes.status).toBe(200);
        expect(statsData.stats.length).toBe(1);
        expect(statsData.stats[0].statDate).toBe(todayDate);
        expect(statsData.stats[0].confirmedSessionsCount).toBeGreaterThanOrEqual(1);
        expect(Number(statsData.stats[0].netAmount)).toBeGreaterThanOrEqual(Number(item.price));
    });
});
