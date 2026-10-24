import { Router, Request, Response } from 'express';
import { authenticateStaff, requirePermission } from '../../middleware/auth.js';
import { query } from '../../db/pool.js';
import { ReportingService } from './reporting.service.js';

export const reportsRouter = Router();

reportsRouter.use(authenticateStaff);
reportsRouter.use(requirePermission('report.view'));

reportsRouter.get('/summary', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;

        // 1. Confirmed manual settlement summary
        const confirmedQuery = query(`
            SELECT 
                COUNT(DISTINCT ts.id) as confirmed_sessions_count,
                COALESCE(SUM(COALESCE(msc.amount, b.total_amount, 0)), 0) as total_confirmed_amount
            FROM table_sessions ts
            JOIN bills b ON b.session_id = ts.id
            LEFT JOIN manual_settlement_confirmations msc ON msc.session_id = ts.id
            WHERE ts.tenant_id = $1 
              AND (b.status = 'CONFIRMED' OR msc.id IS NOT NULL OR ts.close_reason = 'CONFIRMED_SETTLED')
              AND COALESCE(msc.amount, b.total_amount, 0) > 0
        `, [staff.tenantId]);

        // 2. Count served items across all served parts in this restaurant (with net settlement discount reconciliation)
        const servedItemsQuery = query(`
            WITH confirmed_lines AS (
                SELECT 
                    bl.item_name,
                    SUM(bl.quantity_served) as qty,
                    SUM(bl.quantity_served * bl.unit_price) as gross,
                    SUM(bl.subtotal) as net
                FROM bill_lines bl
                JOIN bills b ON b.id = bl.bill_id
                WHERE b.tenant_id = $1 AND b.status = 'CONFIRMED'
                GROUP BY bl.item_name
            ),
            open_lines AS (
                SELECT 
                    oi.snapshot_name as item_name,
                    SUM(oip.quantity) as qty,
                    SUM(oip.quantity * oi.snapshot_price) as gross,
                    SUM(oip.quantity * oi.snapshot_price) as net
                FROM order_item_parts oip
                JOIN order_items oi ON oi.id = oip.order_item_id
                JOIN orders o ON o.id = oi.order_id
                JOIN table_sessions ts ON ts.id = o.session_id
                WHERE o.tenant_id = $1 AND ts.status = 'OPEN' AND oip.status = 'SERVED'
                GROUP BY oi.snapshot_name
            ),
            combined AS (
                SELECT item_name, qty, gross, net FROM confirmed_lines
                UNION ALL
                SELECT item_name, qty, gross, net FROM open_lines
            )
            SELECT 
                item_name,
                SUM(qty) as total_served,
                SUM(gross) as gross_amount,
                SUM(net) as total_amount
            FROM combined
            GROUP BY item_name
            ORDER BY total_served DESC
            LIMIT 15
        `, [staff.tenantId]);

        // 3. Open sessions currently in progress
        const openSessionsQuery = query(`
            SELECT 
                COUNT(ts.id) as open_sessions_count
            FROM table_sessions ts
            WHERE ts.tenant_id = $1 AND ts.status = 'OPEN'
        `, [staff.tenantId]);

        // 4. Recent settled & released sessions
        const recentSettledQuery = query(`
            SELECT 
                ts.id as session_id,
                t.table_number,
                ts.requester_guest_name as opening_guest_name,
                COALESCE(msc.amount, b.total_amount, 0) as confirmed_amount,
                COALESCE(msc.confirmed_at, ts.closed_at, ts.updated_at) as confirmed_at,
                COALESCE(u.full_name, 'Nhân viên') as confirmed_by_name,
                msc.note as settlement_note,
                ts.opened_at,
                ts.status as session_status,
                ts.close_reason,
                b.status as bill_status
            FROM table_sessions ts
            JOIN tables t ON t.id = ts.table_id
            JOIN bills b ON b.session_id = ts.id
            LEFT JOIN manual_settlement_confirmations msc ON msc.session_id = ts.id
            LEFT JOIN users u ON u.id = COALESCE(msc.confirmed_by, ts.closed_by)
            WHERE ts.tenant_id = $1 
              AND (
                ((b.status = 'CONFIRMED' OR msc.id IS NOT NULL OR ts.close_reason = 'CONFIRMED_SETTLED') AND COALESCE(msc.amount, b.total_amount, 0) > 0)
                OR (
                    ts.status = 'CLOSED' AND ts.close_reason IS NOT NULL
                    AND (
                        b.status = 'CANCELLED'
                        OR (b.status = 'CONFIRMED' AND COALESCE(msc.amount, b.total_amount, 0) = 0)
                    )
                )
              )
            ORDER BY COALESCE(msc.confirmed_at, ts.closed_at, ts.updated_at) DESC
            LIMIT 50
        `, [staff.tenantId]);

        const [confirmedRes, servedItemsRes, openSessionsRes, recentSettledRes] = await Promise.all([
            confirmedQuery,
            servedItemsQuery,
            openSessionsQuery,
            recentSettledQuery
        ]);

        const confirmedSessionsCount = parseInt(confirmedRes.rows[0].confirmed_sessions_count, 10);
        const totalConfirmedAmount = Number(confirmedRes.rows[0].total_confirmed_amount);
        const averageOrderValue = confirmedSessionsCount > 0 ? Math.round(totalConfirmedAmount / confirmedSessionsCount) : 0;

        return res.json({
            metrics: {
                confirmedSessionsCount,
                totalConfirmedAmount,
                label: 'Tổng bill đã được nhân viên xác nhận thanh toán (Ghi nhận thủ công)',
                averageOrderValue,
                openSessionsCount: parseInt(openSessionsRes.rows[0].open_sessions_count, 10)
            },
            topServedItems: servedItemsRes.rows,
            recentSettledSessions: recentSettledRes.rows
        });
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

/**
 * GET /api/v1/staff/reports/daily-stats
 * Query daily reporting read model (Issue #45)
 */
reportsRouter.get('/daily-stats', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const fromDate = typeof req.query.from === 'string' ? req.query.from : undefined;
        const toDate = typeof req.query.to === 'string' ? req.query.to : undefined;

        const stats = await ReportingService.getDailyShopStats(staff.tenantId, fromDate, toDate);
        return res.json({ stats });
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});
