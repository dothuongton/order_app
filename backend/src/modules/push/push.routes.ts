import { Router, Request, Response } from 'express';
import { authenticateStaff } from '../../middleware/auth.js';
import { PushService } from './push.service.js';

export const pushRouter = Router();

// All push endpoints require staff authentication
pushRouter.use(authenticateStaff);

/**
 * GET /api/v1/staff/push/public-key
 * Returns public VAPID key and availability to frontend for subscription
 */
pushRouter.get('/public-key', (req: Request, res: Response) => {
    const availability = PushService.getAvailability();
    return res.json({
        available: availability.available,
        enabled: availability.enabled,
        publicKey: availability.publicKey,
        reason: availability.reason
    });
});

/**
 * GET /api/v1/staff/push/status
 * Returns subscription status and push availability for current staff member
 */
pushRouter.get('/status', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const availability = PushService.getAvailability();
        if (!availability.available) {
            return res.json({
                available: false,
                enabled: false,
                reason: availability.reason,
                isSubscribed: false,
                deviceCount: 0,
                lastSuccessAt: null
            });
        }
        const status = await PushService.getStatus(staff.tenantId, staff.id);
        return res.json({
            available: true,
            enabled: true,
            reason: null,
            ...status
        });
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi kiểm tra trạng thái thông báo'
        });
    }
});

/**
 * POST /api/v1/staff/push/subscribe
 * Register or update a Web Push subscription for current staff
 */
pushRouter.post('/subscribe', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const { endpoint, keys } = req.body || {};

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({
                error: 'INVALID_PAYLOAD',
                message: 'Thiếu thông tin endpoint hoặc khóa mã hóa p256dh/auth'
            });
        }

        const userAgent = req.headers['user-agent'] as string | undefined;
        const result = await PushService.subscribe(staff.tenantId, staff.id, {
            endpoint,
            keys,
            userAgent
        });

        return res.json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi đăng ký Web Push'
        });
    }
});

/**
 * POST /api/v1/staff/push/unsubscribe
 * Remove an endpoint subscription for current staff
 */
pushRouter.post('/unsubscribe', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const { endpoint } = req.body || {};

        if (!endpoint) {
            return res.status(400).json({
                error: 'MISSING_ENDPOINT',
                message: 'Thiếu endpoint cần hủy đăng ký'
            });
        }

        const result = await PushService.unsubscribe(staff.tenantId, staff.id, endpoint);
        return res.json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi hủy đăng ký Web Push'
        });
    }
});

/**
 * POST /api/v1/staff/push/test
 * Send a test push notification to verify device receipt
 */
pushRouter.post('/test', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const { endpoint } = req.body || {};

        const result = await PushService.sendTest(staff.tenantId, staff.id, endpoint);
        return res.json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi gửi thông báo thử nghiệm'
        });
    }
});
