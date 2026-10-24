import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { query, pool } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { StaffService } from '../modules/staff/staff.service.js';
import { GuestService } from '../modules/guest/guest.service.js';

describe('Staff action latency benchmark (isolated test database)', () => {
    const sampleCount = 10;
    const partCount = 25;
    let tenantId: string;
    let tableId: string;
    let menuItemId: string;
    let userId: string;
    const openedSessions: string[] = [];

    beforeAll(async () => {
        await seed(true);
        await query(`UPDATE table_sessions SET status = 'CLOSED', updated_at = NOW() WHERE status = 'OPEN'`);
        const tenant = await query(`SELECT id FROM tenants ORDER BY created_at LIMIT 1`);
        tenantId = tenant.rows[0].id;
        const table = await query(`SELECT id FROM tables WHERE tenant_id = $1 ORDER BY table_number LIMIT 1`, [tenantId]);
        tableId = table.rows[0].id;
        const menuItem = await query(`SELECT id FROM menu_items WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        menuItemId = menuItem.rows[0].id;
        const user = await query(`SELECT id FROM users WHERE email = 'admin@phoco.vn' LIMIT 1`);
        userId = user.rows[0].id;
    });

    afterAll(async () => {
        for (const sessionId of openedSessions) {
            await query(`UPDATE table_sessions SET status = 'CLOSED', updated_at = NOW() WHERE id = $1`, [sessionId]);
        }
    });

    async function measureQueries<T>(run: () => Promise<T>): Promise<{ result: T; queryCount: number }> {
        let queryCount = 0;
        const poolAny = pool as any;
        const originalConnect = poolAny.connect;
        poolAny.connect = async (...args: any[]) => {
            const client = await originalConnect.apply(pool, args);
            const originalQuery = client.query.bind(client);
            client.query = (...queryArgs: any[]) => {
                queryCount += 1;
                return originalQuery(...queryArgs);
            };
            return client;
        };
        try {
            return { result: await run(), queryCount };
        } finally {
            poolAny.connect = originalConnect;
        }
    }

    function percentile(values: number[], p: number): number {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
    }

    it('reports accept, serve and bill-summary p50/p95 while asserting state and event integrity', async () => {
        const acceptMs: number[] = [];
        const serveMs: number[] = [];
        const billMs: number[] = [];
        let acceptQueryCount = 0;
        let serveQueryCount = 0;

        for (let sample = 0; sample < sampleCount; sample += 1) {
            const session = await StaffService.openSession(tenantId, tableId, userId);
            const sessionId = session.sessionId;
            openedSessions.push(sessionId);
            const nextOrder = await query(`SELECT COALESCE(MAX(order_number), 0) + 1 AS value FROM orders WHERE session_id = $1`, [sessionId]);
            const order = await query(`
                INSERT INTO orders (tenant_id, session_id, order_number, source, idempotency_key)
                VALUES ($1, $2, $3, 'GUEST', $4)
                RETURNING id
            `, [tenantId, sessionId, nextOrder.rows[0].value, `staff-action-perf-${sample}`]);
            const items = await query(`
                INSERT INTO order_items (tenant_id, order_id, menu_item_id, quantity, snapshot_name, snapshot_price)
                SELECT $1, $2, $3, 1, 'Perf item ' || g::text, 1000
                FROM generate_series(1, $4) AS g
                RETURNING id
            `, [tenantId, order.rows[0].id, menuItemId, partCount]);
            await query(`
                INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity)
                SELECT $1, item_id, 'PENDING', 1 FROM unnest($2::uuid[]) AS item_id
            `, [tenantId, items.rows.map((item: any) => item.id)]);

            const acceptStart = performance.now();
            const accept = await measureQueries(() => StaffService.acceptAllPending(tenantId, sessionId, userId));
            acceptMs.push(performance.now() - acceptStart);
            acceptQueryCount += accept.queryCount;
            expect(accept.result.acceptedCount).toBe(partCount);
            expect(accept.queryCount).toBeLessThanOrEqual(5);

            const serveStart = performance.now();
            const serve = await measureQueries(() => StaffService.serveAllAccepted(tenantId, sessionId, userId));
            serveMs.push(performance.now() - serveStart);
            serveQueryCount += serve.queryCount;
            expect(serve.result.servedCount).toBe(partCount);
            expect(serve.queryCount).toBeLessThanOrEqual(5);

            const billStart = performance.now();
            const summary = await GuestService.getBillSummary(tenantId, sessionId);
            billMs.push(performance.now() - billStart);
            expect(summary.unresolvedCount).toBe(0);
            expect(summary.servedTotal).toBe(partCount * 1000);
            expect(summary.rounds[0].items).toHaveLength(partCount);

            const events = await query(`
                SELECT e.to_status, COUNT(*)::int AS count, SUM(e.quantity)::int AS quantity
                FROM order_item_events e
                JOIN order_items oi ON oi.id = e.order_item_id
                JOIN orders o ON o.id = oi.order_id
                WHERE o.session_id = $1
                GROUP BY e.to_status
            `, [sessionId]);
            expect(events.rows).toEqual(expect.arrayContaining([
                expect.objectContaining({ to_status: 'ACCEPTED', count: partCount, quantity: partCount }),
                expect.objectContaining({ to_status: 'SERVED', count: partCount, quantity: partCount })
            ]));
            await query(`UPDATE table_sessions SET status = 'CLOSED', updated_at = NOW() WHERE id = $1`, [sessionId]);
        }

        process.stdout.write(`STAFF_ACTION_BENCHMARK ${JSON.stringify({
            database: 'isolated PostgreSQL test database',
            samples: sampleCount,
            partsPerSession: partCount,
            accept: { p50Ms: percentile(acceptMs, 0.5), p95Ms: percentile(acceptMs, 0.95), avgSqlCalls: acceptQueryCount / sampleCount },
            serve: { p50Ms: percentile(serveMs, 0.5), p95Ms: percentile(serveMs, 0.95), avgSqlCalls: serveQueryCount / sampleCount },
            billSummary: { p50Ms: percentile(billMs, 0.5), p95Ms: percentile(billMs, 0.95) }
        })}\n`);
    });
});
