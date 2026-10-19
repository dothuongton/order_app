import { z } from 'zod';
import { Router, Request, Response } from 'express';
import { authenticateStaff, requireShopAdmin } from '../../middleware/auth.js';
import { CmsService } from './cms.service.js';
import { query } from '../../db/pool.js';

import { decodeImage } from '../../utils/images.js';

export const cmsRouter = Router();
cmsRouter.param('id', (req, res, next, id) => {
    if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'INVALID_ID', message: 'ID không hợp lệ' });
    next();
});

// Protect all CMS routes with staff authentication + owner/manager role
cmsRouter.use(authenticateStaff);
cmsRouter.use(requireShopAdmin);

/**
 * GET /api/v1/cms/profile
 * Get shop identity and active theme/template settings
 */
cmsRouter.get('/profile', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const profile = await CmsService.getProfile(tenantId);
        res.json({ profile });
    } catch (err: any) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

/**
 * PATCH /api/v1/cms/profile
 * Update shop identity settings
 */
cmsRouter.patch('/profile', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const updated = await CmsService.updateProfile(tenantId, req.body, req.staff!.id);
        res.json({ message: 'Cập nhật thông tin quán thành công', profile: updated });
    } catch (err: any) {
        res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
});

/**
 * GET /api/v1/cms/draft
 * Get current CMS draft
 */
cmsRouter.get('/draft', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const draft = await CmsService.getDraft(tenantId);
        res.json({ draft });
    } catch (err: any) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

/**
 * PUT /api/v1/cms/draft
 * Save current CMS draft
 */
cmsRouter.put('/draft', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const { templateId, themeConfig, contentConfig } = req.body;
        if (!templateId || !themeConfig) {
            return res.status(400).json({
                error: 'BAD_REQUEST',
                message: 'Thiếu templateId hoặc cấu hình themeConfig'
            });
        }

        const saved = await CmsService.saveDraft(
            tenantId,
            { templateId, themeConfig, contentConfig },
            req.staff!.id
        );
        res.json({ message: 'Lưu bản nháp thành công', draft: saved });
    } catch (err: any) {
        res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
});

/**
 * POST /api/v1/cms/publish
 * Publish current draft to Storefront
 */
cmsRouter.post('/publish', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const changelog = req.body.changelog || 'Xuất bản giao diện mới';
        const result = await CmsService.publishDraft(tenantId, changelog, req.staff!.id);
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
});

/**
 * GET /api/v1/cms/versions
 * List history of published versions
 */
cmsRouter.get('/versions', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const versions = await CmsService.getVersions(tenantId);
        res.json({ versions });
    } catch (err: any) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

/**
 * POST /api/v1/cms/rollback
 * Rollback to a previous published version
 */
cmsRouter.post('/rollback', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const versionNumber = parseInt(req.body.version, 10);
        if (!versionNumber || versionNumber <= 0) {
            return res.status(400).json({ error: 'BAD_REQUEST', message: 'Số phiên bản không hợp lệ' });
        }

        const result = await CmsService.rollbackVersion(tenantId, versionNumber, req.staff!.id);
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
});

// ==================== BANNERS ====================

cmsRouter.get('/banners', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const banners = await CmsService.listBanners(tenantId);
        res.json({ banners });
    } catch (err: any) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

cmsRouter.post('/banners', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const banner = await CmsService.createBanner(tenantId, req.body);
        res.status(201).json({ message: 'Tạo banner thành công', banner });
    } catch (err: any) {
        res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
});

cmsRouter.patch('/banners/:id', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const banner = await CmsService.updateBanner(tenantId, req.params.id, req.body);
        res.json({ message: 'Cập nhật banner thành công', banner });
    } catch (err: any) {
        res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
});

cmsRouter.delete('/banners/:id', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        await CmsService.deleteBanner(tenantId, req.params.id);
        res.json({ message: 'Xóa banner thành công' });
    } catch (err: any) {
        res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
});

// ==================== PROMOTIONS ====================

cmsRouter.get('/promotions', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const promotions = await CmsService.listPromotions(tenantId);
        res.json({ promotions });
    } catch (err: any) {
        res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

cmsRouter.post('/promotions', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const promo = await CmsService.createPromotion(tenantId, req.body);
        res.status(201).json({ message: 'Tạo chương trình khuyến mãi thành công', promotion: promo });
    } catch (err: any) {
        res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
});

cmsRouter.patch('/promotions/:id', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const promo = await CmsService.updatePromotion(tenantId, req.params.id, req.body);
        res.json({ message: 'Cập nhật khuyến mãi thành công', promotion: promo });
    } catch (err: any) {
        res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
});

cmsRouter.delete('/promotions/:id', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        await CmsService.deletePromotion(tenantId, req.params.id);
        res.json({ message: 'Xóa chương trình khuyến mãi thành công' });
    } catch (err: any) {
        res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
});

/**
 * POST /api/v1/cms/upload
 * Upload image directly as Base64 (persisted in database, zero external dependencies)
 */
cmsRouter.post('/upload', async (req: Request, res: Response) => {
    try {
        const tenantId = req.staff!.tenantId;
        const { data, filename } = req.body;
        if (!data || typeof data !== 'string') {
            return res.status(400).json({ error: 'INVALID_DATA', message: 'Vui lòng cung cấp dữ liệu ảnh' });
        }

        const { mimeType, sizeBytes } = decodeImage(data);

        const insertRes = await query(`
            INSERT INTO uploaded_images (tenant_id, filename, mime_type, size_bytes, data_base64)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, mime_type, size_bytes, created_at
        `, [tenantId, filename || 'image.jpg', mimeType, sizeBytes, data]);

        const row = insertRes.rows[0];
        return res.status(201).json({
            id: row.id,
            url: `/api/v1/public/images/${row.id}`,
            mimeType: row.mime_type,
            sizeBytes: row.size_bytes
        });
    } catch (err: any) {
        return res.status(err.status || 500).json({ error: err.code || 'UPLOAD_FAILED', message: err.message || 'Lỗi tải ảnh lên' });
    }
});
