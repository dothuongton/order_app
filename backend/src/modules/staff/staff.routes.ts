import { Router, Request, Response } from 'express';
import { StaffService } from './staff.service.js';
import { GuestService } from '../guest/guest.service.js';
import { authenticateStaff, requirePermission } from '../../middleware/auth.js';
import { config } from '../../config/index.js';
import { query } from '../../db/pool.js';

export const staffRouter = Router();

staffRouter.use(authenticateStaff);

// 1. Dashboard snapshot
staffRouter.get('/dashboard/snapshot', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const data = await StaffService.getDashboardSnapshot(staff.tenantId);
        return res.json(data);
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 2. Open session (F01)
staffRouter.post('/tables/:id/open', requirePermission('session.open'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const tableId = req.params.id;
        const result = await StaffService.openSession(staff.tenantId, tableId, staff.id);
        return res.status(201).json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi mở phiên bàn'
        });
    }
});

// 3. Mark table ready after cleaning (F11)
staffRouter.post('/tables/:id/mark-ready', requirePermission('table.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const tableId = req.params.id;
        const result = await StaffService.markTableReady(staff.tenantId, tableId);
        return res.json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi cập nhật bàn'
        });
    }
});

// 4. Accept order item (F05)
staffRouter.post('/order-items/:id/accept', requirePermission('order.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const orderItemId = req.params.id;
        const { quantity } = req.body || {};
        const result = await StaffService.acceptOrderItem(staff.tenantId, orderItemId, quantity, staff.id);
        return res.json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi tiếp nhận món'
        });
    }
});

// Accept all pending items in a session
staffRouter.post('/sessions/:id/accept-all', requirePermission('order.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const sessionId = req.params.id;
        const result = await StaffService.acceptAllPending(staff.tenantId, sessionId, staff.id);
        return res.json(result);
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 5. Serve order item (F06)
staffRouter.post('/order-items/:id/serve', requirePermission('order.serve'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const orderItemId = req.params.id;
        const { quantity } = req.body || {};
        const result = await StaffService.serveOrderItem(staff.tenantId, orderItemId, quantity, staff.id);
        return res.json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi phục vụ món'
        });
    }
});

// Serve all accepted items in a session
staffRouter.post('/sessions/:id/serve-all', requirePermission('order.serve'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const sessionId = req.params.id;
        const result = await StaffService.serveAllAccepted(staff.tenantId, sessionId, staff.id);
        return res.json(result);
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 6. Cancel order item (F07)
staffRouter.post('/order-items/:id/cancel', requirePermission('order.cancel'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const orderItemId = req.params.id;
        const { quantity, reason, markItemOutOfStock } = req.body || {};
        const result = await StaffService.cancelOrderItem(
            staff.tenantId,
            orderItemId,
            quantity,
            reason,
            staff.id,
            markItemOutOfStock
        );
        return res.json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi hủy món'
        });
    }
});

// 7. Get bill summary for session
staffRouter.get('/sessions/:id/bill-summary', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const sessionId = req.params.id;
        const summary = await GuestService.getBillSummary(staff.tenantId, sessionId);
        return res.json(summary);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi lấy tổng bill'
        });
    }
});

// 8. Confirm payment and close session (F10)
staffRouter.post(
    '/sessions/:id/confirm-payment-and-close',
    requirePermission('session.confirm_payment_close'),
    async (req: Request, res: Response) => {
        try {
            const staff = req.staff!;
            const sessionId = req.params.id;
            const { settlementVersion, note, requestId } = req.body || {};

            const result = await StaffService.confirmPaymentAndCloseSession(
                staff.tenantId,
                sessionId,
                settlementVersion,
                staff.id,
                note,
                requestId
            );

            return res.json(result);
        } catch (err: any) {
            const status = err.status || 500;
            return res.status(status).json({
                error: err.code || 'SERVER_ERROR',
                message: err.message || 'Lỗi xác nhận thanh toán'
            });
        }
    }
);

// 9. Close session without charge (F12)
staffRouter.post(
    '/sessions/:id/close-without-charge',
    requirePermission('session.close_without_charge'),
    async (req: Request, res: Response) => {
        try {
            const staff = req.staff!;
            const sessionId = req.params.id;
            const { reason } = req.body || {};

            const result = await StaffService.closeWithoutCharge(staff.tenantId, sessionId, staff.id, reason);
            return res.json(result);
        } catch (err: any) {
            const status = err.status || 500;
            return res.status(status).json({
                error: err.code || 'SERVER_ERROR',
                message: err.message || 'Lỗi kết thúc phiên'
            });
        }
    }
);

// 10. Service requests
staffRouter.post('/service-requests/:id/accept', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const requestId = req.params.id;
        const result = await StaffService.acceptServiceRequest(staff.tenantId, requestId, staff.id);
        return res.json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message
        });
    }
});

staffRouter.post('/service-requests/:id/complete', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const requestId = req.params.id;
        const result = await StaffService.completeServiceRequest(staff.tenantId, requestId, staff.id);
        return res.json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message
        });
    }
});

staffRouter.post('/service-requests/:id/cancel', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const requestId = req.params.id;
        const { reason } = req.body || {};
        const result = await StaffService.cancelServiceRequest(staff.tenantId, requestId, reason);
        return res.json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message
        });
    }
});

// 11. Generate QR Code
staffRouter.get('/tables/:id/qr-code', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const tableId = req.params.id;

        const tableRes = await query(`
            SELECT table_number, public_qr_id FROM tables
            WHERE id = $1 AND tenant_id = $2
        `, [tableId, staff.tenantId]);

        if (tableRes.rows.length === 0) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Không tìm thấy bàn' });
        }

        const table = tableRes.rows[0];
        const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
        const host = req.get('host');
        const defaultOrigin = `${protocol}://${host}`;
        const baseUrl = process.env.FRONTEND_URL || (config.frontendUrl.includes('localhost') && host ? defaultOrigin : config.frontendUrl);
        const qr = await StaffService.generateTableQR(table.public_qr_id, baseUrl);

        return res.json({
            tableNumber: table.table_number,
            publicQrId: table.public_qr_id,
            qrUrl: qr.qrUrl,
            dataUrl: qr.dataUrl
        });
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 12. Menu toggle availability
staffRouter.get('/menu/items', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const items = await query(`
            SELECT mi.*, mc.name as category_name
            FROM menu_items mi
            LEFT JOIN menu_categories mc ON mc.id = mi.category_id
            WHERE mi.tenant_id = $1
            ORDER BY mc.sort_order ASC, mi.name ASC
        `, [staff.tenantId]);
        return res.json({ items: items.rows });
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

staffRouter.put('/menu/items/:id/toggle-available', requirePermission('menu.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const itemId = req.params.id;
        const { isAvailable } = req.body;

        const result = await query(`
            UPDATE menu_items
            SET is_available = $1, updated_at = NOW()
            WHERE id = $2 AND tenant_id = $3
            RETURNING id, name, is_available
        `, [isAvailable, itemId, staff.tenantId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Không tìm thấy món' });
        }

        return res.json({ item: result.rows[0], message: `Đã cập nhật trạng thái món ${result.rows[0].name}` });
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});
