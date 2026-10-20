import { z } from 'zod';
import { Router, Request, Response } from 'express';
import { authenticateSuperAdmin } from '../../middleware/auth.js';
import { AdminService } from './admin.service.js';
import { AdminApiError } from './admin.errors.js';
import {
    listShopsQuerySchema,
    createShopSchema,
    updateShopSchema,
    listAuditLogsQuerySchema
} from './admin.validation.js';

export const adminRouter = Router();

function handleAdminError(err: any, res: Response) {
    if (err instanceof AdminApiError) {
        return res.status(err.statusCode).json({
            error: err.errorCode,
            message: err.message,
            ...(err.details ? { details: err.details } : {})
        });
    }
    if (err && typeof err.status === 'number') {
        return res.status(err.status).json({
            error: err.code === 'INVALID_INPUT' ? 'BAD_REQUEST' : (err.code || 'BAD_REQUEST'),
            message: err.message
        });
    }
    if (err instanceof z.ZodError) {
        return res.status(400).json({
            error: 'BAD_REQUEST',
            message: 'Dữ liệu đầu vào không hợp lệ',
            details: err.issues.map(i => ({
                field: i.path.join('.'),
                issue: i.message
            }))
        });
    }
    console.error('[Admin API Server Error]', err);
    return res.status(500).json({
        error: 'SERVER_ERROR',
        message: 'Đã xảy ra lỗi máy chủ nội bộ'
    });
}

// Param middleware to validate UUID for :id
adminRouter.param('id', (req, res, next, id) => {
    if (!z.string().uuid().safeParse(id).success) {
        return res.status(400).json({
            error: 'INVALID_ID',
            message: 'Mã định danh không đúng định dạng UUID'
        });
    }
    next();
});

// Protect all admin routes with Super Admin authentication
adminRouter.use(authenticateSuperAdmin);

/**
 * GET /api/v1/admin/stats
 * Platform overview statistics
 */
adminRouter.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await AdminService.getPlatformStats();
        res.json(stats);
    } catch (err: any) {
        handleAdminError(err, res);
    }
});

/**
 * GET /api/v1/admin/shops
 * List shops with bounded pagination, search, and status filter
 */
adminRouter.get('/shops', async (req: Request, res: Response) => {
    try {
        const queryInput = listShopsQuerySchema.parse(req.query);
        const result = await AdminService.listShops(queryInput);
        res.json(result);
    } catch (err: any) {
        handleAdminError(err, res);
    }
});

/**
 * GET /api/v1/admin/shops/:id
 * Get single shop detail by tenant ID
 */
adminRouter.get('/shops/:id', async (req: Request, res: Response) => {
    try {
        const shop = await AdminService.getShopDetail(req.params.id);
        res.json({ shop });
    } catch (err: any) {
        handleAdminError(err, res);
    }
});

/**
 * POST /api/v1/admin/shops
 * Create a new shop with initial owner and configuration
 */
adminRouter.post('/shops', async (req: Request, res: Response) => {
    try {
        const bodyInput = createShopSchema.parse(req.body);
        const newShop = await AdminService.createShop(bodyInput, req.superAdmin!.id);

        res.status(201).json({
            message: 'Tạo quán thành công',
            shop: newShop
        });
    } catch (err: any) {
        handleAdminError(err, res);
    }
});

/**
 * PATCH /api/v1/admin/shops/:id
 * Update shop metadata or suspend/activate status
 */
adminRouter.patch('/shops/:id', async (req: Request, res: Response) => {
    try {
        const tenantId = req.params.id;
        const bodyInput = updateShopSchema.parse(req.body);

        const updated = await AdminService.updateShop(tenantId, bodyInput, req.superAdmin!.id);

        res.json({
            message: 'Cập nhật quán thành công',
            shop: updated
        });
    } catch (err: any) {
        handleAdminError(err, res);
    }
});

/**
 * GET /api/v1/admin/templates
 * List available layout templates
 */
adminRouter.get('/templates', async (req: Request, res: Response) => {
    try {
        const templates = await AdminService.listTemplates();
        res.json({ templates });
    } catch (err: any) {
        handleAdminError(err, res);
    }
});

/**
 * GET /api/v1/admin/audit-logs
 * List privileged Super Admin audit logs with pagination and filters
 */
adminRouter.get('/audit-logs', async (req: Request, res: Response) => {
    try {
        const queryInput = listAuditLogsQuerySchema.parse(req.query);
        const result = await AdminService.listAuditLogs(queryInput);
        res.json(result);
    } catch (err: any) {
        handleAdminError(err, res);
    }
});
