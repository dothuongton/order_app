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
                COUNT(msc.id) as confirmed_sessions_count,
                COALESCE(SUM(msc.amount), 0) as total_confirmed_amount
            FROM manual_settlement_confirmations msc
            WHERE msc.tenant_id = $1
        `, [staff.tenantId]);

        const confirmedSessionsCount = parseInt(confirmedRes.rows[0].confirmed_sessions_count, 10);
        const totalConfirmedAmount = Number(confirmedRes.rows[0].total_confirmed_amount);
        const averageOrderValue = confirmedSessionsCount > 0 ? Math.round(totalConfirmedAmount / confirmedSessionsCount) : 0;

        // 2. Count served items on CONFIRMED bills
        const servedItemsRes = await query(`
            SELECT 
                bl.item_name,
                SUM(bl.quantity_served) as total_served,
                SUM(bl.subtotal) as total_amount
            FROM bill_lines bl
            JOIN bills b ON b.id = bl.bill_id
            WHERE b.tenant_id = $1 AND b.status = 'CONFIRMED'
            GROUP BY bl.item_name
            ORDER BY total_served DESC
            LIMIT 10
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
                msc.amount as confirmed_amount,
                msc.confirmed_at,
                u.full_name as confirmed_by_name
            FROM manual_settlement_confirmations msc
            JOIN table_sessions ts ON ts.id = msc.session_id
            JOIN tables t ON t.id = ts.table_id
            JOIN users u ON u.id = msc.confirmed_by
            WHERE msc.tenant_id = $1
            ORDER BY msc.confirmed_at DESC
            LIMIT 20
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
