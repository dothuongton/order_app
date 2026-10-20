import { Router, Request, Response } from 'express';
import { GuestService } from './guest.service.js';
import { authenticateGuest } from '../../middleware/auth.js';
import { config } from '../../config/index.js';
import { query } from '../../db/pool.js';
import { hashToken } from '../../utils/crypto.js';

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
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
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

// 2b. Get verified closed session receipt (authenticated by guest token, accessible even when session is closed)
guestRouter.get('/guest/receipt', async (req: Request, res: Response) => {
    try {
        const guestHeaderToken = req.headers['x-guest-token'] as string | undefined;
        const cookieToken = req.cookies?.guest_token as string | undefined;

        // Staff Bearer tokens are not guest credentials and cannot authenticate guest receipts.
        // Explicit x-guest-token takes precedence over cookie.
        // If an explicit header token is provided, do not fall back to cookie to prevent cross-table/session leakage.
        let token: string | undefined;
        if (typeof guestHeaderToken === 'string' && guestHeaderToken.trim().length > 0) {
            token = guestHeaderToken.trim();
        } else if (typeof cookieToken === 'string' && cookieToken.trim().length > 0) {
            token = cookieToken.trim();
        }

        if (!token) {
            return res.status(401).json({
                error: 'UNAUTHORIZED',
                message: 'Thiếu guest token để xem biên nhận'
            });
        }

        const tokenHash = hashToken(token);
        const resGuest = await query(`
            SELECT
                gs.id as guest_session_id,
                gs.tenant_id,
                gs.table_id,
                gs.session_id,
                gs.expires_at,
                gs.revoked_at,
                ts.status as session_status,
                ts.close_reason,
                ts.closed_at,
                t.table_number,
                t.public_qr_id
            FROM guest_sessions gs
            JOIN table_sessions ts ON ts.id = gs.session_id
            JOIN tables t ON t.id = gs.table_id
            WHERE gs.token_hash = $1
        `, [tokenHash]);

        if (resGuest.rows.length === 0) {
            return res.status(401).json({
                error: 'ACCESS_REVOKED',
                message: 'Phiên không hợp lệ hoặc quyền truy cập đã hết hiệu lực'
            });
        }

        const row = resGuest.rows[0];

        // Scope verification: fail-closed if caller explicitly requests a different session or QR
        const requestedSessionId = req.query.sessionId as string | undefined;
        const requestedQrId = req.query.qrId as string | undefined;

        if (requestedSessionId && row.session_id !== requestedSessionId) {
            return res.status(403).json({
                error: 'SCOPE_MISMATCH',
                message: 'Token không thuộc về phiên bàn được yêu cầu'
            });
        }

        if (requestedQrId && row.public_qr_id !== requestedQrId) {
            return res.status(403).json({
                error: 'SCOPE_MISMATCH',
                message: 'Token không thuộc về mã QR bàn được yêu cầu'
            });
        }

        if (new Date(row.expires_at) < new Date()) {
            return res.status(401).json({
                error: 'TOKEN_EXPIRED',
                message: 'Phiên truy cập đã hết hạn'
            });
        }

        if (row.session_status === 'OPEN') {
            return res.json({
                isClosed: false,
                sessionStatus: 'OPEN',
                sessionId: row.session_id,
                tableNumber: row.table_number
            });
        }

        const closeReason = row.close_reason || 'CLOSED';
        if (closeReason === 'CONFIRMED_SETTLED') {
            const billRes = await query(`
                SELECT id, total_amount, confirmed_at, status
                FROM bills
                WHERE session_id = $1 AND status = 'CONFIRMED'
                LIMIT 1
            `, [row.session_id]);

            if (billRes.rows.length > 0) {
                const bill = billRes.rows[0];
                const linesRes = await query(`
                    SELECT item_name, variant_name, quantity_served, unit_price, subtotal
                    FROM bill_lines
                    WHERE bill_id = $1
                    ORDER BY created_at ASC
                `, [bill.id]);

                const promoRes = await query(`
                    SELECT pr.promotion_id, pr.discount_amount,
                           COALESCE(pr.snapshot_title, p.title) as promo_title,
                           COALESCE(pr.snapshot_code, p.code) as promo_code
                    FROM promotion_redemptions pr
                    LEFT JOIN promotions p ON p.id = pr.promotion_id
                    WHERE pr.session_id = $1
                `, [row.session_id]);

                return res.json({
                    isClosed: true,
                    sessionStatus: 'CLOSED',
                    closeReason: 'CONFIRMED_SETTLED',
                    settled: true,
                    tableNumber: row.table_number,
                    tableName: `Bàn ${row.table_number}`,
                    sessionId: row.session_id,
                    totalAmount: parseInt(bill.total_amount, 10),
                    confirmedAt: bill.confirmed_at,
                    billLines: linesRes.rows.map(r => ({
                        itemName: r.item_name,
                        variantName: r.variant_name,
                        quantityServed: r.quantity_served,
                        unitPrice: parseInt(r.unit_price, 10),
                        subtotal: parseInt(r.subtotal, 10)
                    })),
                    appliedPromotions: promoRes.rows.map(r => ({
                        id: r.promotion_id,
                        title: r.promo_title,
                        code: r.promo_code,
                        discountAmount: parseInt(r.discount_amount, 10)
                    })),
                    message: 'Phiên bàn đã thanh toán hoàn tất'
                });
            }
        }

        if (closeReason === 'CLOSED_WITHOUT_CHARGE') {
            return res.json({
                isClosed: true,
                sessionStatus: 'CLOSED',
                closeReason: 'CLOSED_WITHOUT_CHARGE',
                settled: false,
                tableNumber: row.table_number,
                tableName: `Bàn ${row.table_number}`,
                sessionId: row.session_id,
                totalAmount: 0,
                confirmedAt: row.closed_at,
                billLines: [],
                appliedPromotions: [],
                message: 'Phiên bàn đã kết thúc (không phát sinh chi phí)'
            });
        }

        return res.json({
            isClosed: true,
            sessionStatus: 'CLOSED',
            closeReason: closeReason,
            settled: false,
            tableNumber: row.table_number,
            tableName: `Bàn ${row.table_number}`,
            sessionId: row.session_id,
            totalAmount: 0,
            confirmedAt: row.closed_at,
            billLines: [],
            appliedPromotions: [],
            message: 'Phiên bàn đã kết thúc'
        });
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
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
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
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
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 6. Get bill summary
guestRouter.get('/guest/bill-summary', async (req: Request, res: Response) => {
    try {
        const guest = req.guest!;
        const summary = await GuestService.getBillSummary(guest.tenantId, guest.sessionId);
        return res.json(summary);
    } catch (err: any) {
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
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
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
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
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});
