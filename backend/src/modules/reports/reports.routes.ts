import { Router, Request, Response } from 'express';
import { authenticateStaff, requirePermission } from '../../middleware/auth.js';
import { query } from '../../db/pool.js';

export const reportsRouter = Router();

reportsRouter.use(authenticateStaff);
reportsRouter.use(requirePermission('report.view'));

reportsRouter.get('/summary', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;

        // 1. Confirmed manual settlement summary
        const confirmedRes = await query(`
            SELECT 
                COUNT(DISTINCT ts.id) as confirmed_sessions_count,
                COALESCE(SUM(COALESCE(msc.amount, b.total_amount, 0)), 0) as total_confirmed_amount
            FROM table_sessions ts
            JOIN bills b ON b.session_id = ts.id
            LEFT JOIN manual_settlement_confirmations msc ON msc.session_id = ts.id
            WHERE ts.tenant_id = $1 
              AND b.status = 'CONFIRMED'
              AND COALESCE(msc.amount, b.total_amount, 0) > 0
        `, [staff.tenantId]);

        const confirmedSessionsCount = parseInt(confirmedRes.rows[0].confirmed_sessions_count, 10);
        const totalConfirmedAmount = Number(confirmedRes.rows[0].total_confirmed_amount);
        const averageOrderValue = confirmedSessionsCount > 0 ? Math.round(totalConfirmedAmount / confirmedSessionsCount) : 0;

        // 2. Count served items across all served parts in this restaurant
        const servedItemsRes = await query(`
            SELECT 
                oi.snapshot_name as item_name,
                SUM(oip.quantity) as total_served,
                SUM(oip.quantity * oi.snapshot_price) as total_amount
            FROM order_item_parts oip
            JOIN order_items oi ON oi.id = oip.order_item_id
            JOIN orders o ON o.id = oi.order_id
            JOIN table_sessions ts ON ts.id = o.session_id
            WHERE ts.tenant_id = $1 AND oip.status = 'SERVED'
            GROUP BY oi.snapshot_name
            ORDER BY total_served DESC
            LIMIT 15
        `, [staff.tenantId]);

        // 3. Open sessions currently in progress
        const openSessionsRes = await query(`
            SELECT 
                COUNT(ts.id) as open_sessions_count
            FROM table_sessions ts
            WHERE ts.tenant_id = $1 AND ts.status = 'OPEN'
        `, [staff.tenantId]);

        // 4. Recent settled sessions
        const recentSettledRes = await query(`
            SELECT 
                ts.id as session_id,
                t.table_number,
                COALESCE(msc.amount, b.total_amount, 0) as confirmed_amount,
                COALESCE(msc.confirmed_at, ts.closed_at, ts.updated_at) as confirmed_at,
                COALESCE(u.full_name, 'Nhân viên') as confirmed_by_name,
                msc.note as settlement_note,
                ts.opened_at
            FROM table_sessions ts
            JOIN tables t ON t.id = ts.table_id
            JOIN bills b ON b.session_id = ts.id
            LEFT JOIN manual_settlement_confirmations msc ON msc.session_id = ts.id
            LEFT JOIN users u ON u.id = COALESCE(msc.confirmed_by, ts.closed_by)
            WHERE ts.tenant_id = $1 
              AND b.status = 'CONFIRMED'
              AND COALESCE(msc.amount, b.total_amount, 0) > 0
            ORDER BY COALESCE(msc.confirmed_at, ts.closed_at, ts.updated_at) DESC
            LIMIT 50
        `, [staff.tenantId]);

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
