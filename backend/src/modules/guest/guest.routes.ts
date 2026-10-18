import { Router, Request, Response } from 'express';
import { GuestService } from './guest.service.js';
import { authenticateGuest } from '../../middleware/auth.js';
import { config } from '../../config/index.js';
import { query } from '../../db/pool.js';

export const guestRouter = Router();

// Public routes
// 1. Get menu by QR ID
guestRouter.get('/public/tables/:qrId/menu', async (req: Request, res: Response) => {
    try {
        const { qrId } = req.params;
        const data = await GuestService.getPublicTableMenu(qrId);
        if (!data) {
            return res.status(404).json({
                error: 'NOT_FOUND',
                message: 'Không tìm thấy bàn tương ứng với mã QR này'
            });
        }
        return res.json(data);
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 2. Join table session
guestRouter.post('/public/tables/:qrId/join', async (req: Request, res: Response) => {
    try {
        const { qrId } = req.params;
        const { deviceFingerprint } = req.body || {};
        const sessionData = await GuestService.joinSession(qrId, deviceFingerprint);

        // Set HttpOnly cookie for browser security
        res.cookie('guest_token', sessionData.token, {
            httpOnly: true,
            secure: config.nodeEnv === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        return res.json({
            token: sessionData.token,
            tenantId: sessionData.tenantId,
            tableId: sessionData.tableId,
            sessionId: sessionData.sessionId,
            tableNumber: sessionData.tableNumber,
            expiresAt: sessionData.expiresAt
        });
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi tham gia phiên bàn'
        });
    }
});

// Authenticated guest routes
guestRouter.use('/guest', authenticateGuest);

// 3. Get session info
guestRouter.get('/guest/session', async (req: Request, res: Response) => {
    try {
        const guest = req.guest!;
        const requests = await GuestService.getSessionServiceRequests(guest.sessionId);

        return res.json({
            guestSessionId: guest.guestSessionId,
            tenantId: guest.tenantId,
            tableId: guest.tableId,
            sessionId: guest.sessionId,
            tableNumber: guest.tableNumber,
            openRequests: requests
        });
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 4. Create new order
guestRouter.post('/guest/orders', async (req: Request, res: Response) => {
    try {
        const guest = req.guest!;
        const { idempotencyKey, items } = req.body;

        if (!idempotencyKey) {
            return res.status(400).json({
                error: 'MISSING_IDEMPOTENCY_KEY',
                message: 'Thiếu idempotency key'
            });
        }

        const result = await GuestService.createOrder(
            guest.tenantId,
            guest.sessionId,
            guest.tableId,
            { idempotencyKey, items }
        );

        return res.status(201).json(result);
    } catch (err: any) {
        const status = err.status || (err.statusCode ? err.statusCode : 500);
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi gửi yêu cầu gọi món'
        });
    }
});

// 5. Get orders list
guestRouter.get('/guest/orders', async (req: Request, res: Response) => {
    try {
        const guest = req.guest!;
        const orders = await GuestService.getSessionOrders(guest.tenantId, guest.sessionId);
        return res.json({ orders });
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 6. Get bill summary
guestRouter.get('/guest/bill-summary', async (req: Request, res: Response) => {
    try {
        const guest = req.guest!;
        const summary = await GuestService.getBillSummary(guest.tenantId, guest.sessionId);
        return res.json(summary);
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 7. Create service request (Gọi nhân viên / Yêu cầu thanh toán)
guestRouter.post('/guest/service-requests', async (req: Request, res: Response) => {
    try {
        const guest = req.guest!;
        const { type, note } = req.body;

        if (!['ASSISTANCE', 'CHECKOUT'].includes(type)) {
            return res.status(400).json({
                error: 'INVALID_REQUEST_TYPE',
                message: 'Loại yêu cầu không hợp lệ (ASSISTANCE hoặc CHECKOUT)'
            });
        }

        const result = await GuestService.createServiceRequest(
            guest.tenantId,
            guest.sessionId,
            guest.tableId,
            type,
            note
        );

        return res.json(result);
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 8. Operation status check
guestRouter.get('/guest/operations/:requestId', async (req: Request, res: Response) => {
    try {
        const guest = req.guest!;
        const { requestId } = req.params;

        const resRecord = await query(`
            SELECT action, scope, result_json, created_at
            FROM idempotency_records
            WHERE tenant_id = $1 AND key = $2 AND scope = $3
        `, [guest.tenantId, requestId, guest.sessionId]);

        if (resRecord.rows.length === 0) {
            return res.status(404).json({
                error: 'NOT_FOUND',
                message: 'Không tìm thấy kết quả của thao tác'
            });
        }

        return res.json({
            handled: true,
            result: resRecord.rows[0].result_json,
            createdAt: resRecord.rows[0].created_at
        });
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});
