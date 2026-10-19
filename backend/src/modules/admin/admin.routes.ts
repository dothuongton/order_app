import { z } from 'zod';
import { Router, Request, Response } from 'express';
import { authenticateSuperAdmin } from '../../middleware/auth.js';
import { AdminService } from './admin.service.js';

export const adminRouter = Router();
adminRouter.param('id', (req, res, next, id) => {
    if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'INVALID_ID', message: 'ID không hợp lệ' });
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
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

/**
 * GET /api/v1/admin/shops
 * List shops with optional search and status filter
 */
adminRouter.get('/shops', async (req: Request, res: Response) => {
    try {
        const search = req.query.search as string;
        const status = req.query.status as string;
        const shops = await AdminService.listShops(search, status);
        res.json({ shops });
    } catch (err: any) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

/**
 * POST /api/v1/admin/shops
 * Create a new shop with initial owner and configuration
 */
adminRouter.post('/shops', async (req: Request, res: Response) => {
    try {
        const { name, slug, phone, address, ownerEmail, ownerFullName, ownerPassword } = req.body;
        if (!name || !slug || !ownerEmail || !ownerFullName) {
            return res.status(400).json({
                error: 'BAD_REQUEST',
                message: 'Vui lòng điền đầy đủ tên quán, đường dẫn slug, email và tên chủ quán'
            });
        }

        const newShop = await AdminService.createShop(
            { name, slug, phone, address, ownerEmail, ownerFullName, ownerPassword },
            req.superAdmin!.id
        );

        res.status(201).json({
            message: 'Tạo quán thành công',
            shop: newShop
        });
    } catch (err: any) {
        res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
});

/**
 * PATCH /api/v1/admin/shops/:id
 * Update shop metadata or suspend/activate status
 */
adminRouter.patch('/shops/:id', async (req: Request, res: Response) => {
    try {
        const tenantId = req.params.id;
        const { name, slug, status, phone, address, description } = req.body;

        const updated = await AdminService.updateShop(
            tenantId,
            { name, slug, status, phone, address, description },
            req.superAdmin!.id
        );

        res.json({
            message: 'Cập nhật quán thành công',
            shop: updated
        });
    } catch (err: any) {
        res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
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
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

/**
 * GET /api/v1/admin/audit-logs
 * List privileged Super Admin audit logs
 */
adminRouter.get('/audit-logs', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string || '50', 10);
        const logs = await AdminService.listAuditLogs(limit);
        res.json({ logs });
    } catch (err: any) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});
