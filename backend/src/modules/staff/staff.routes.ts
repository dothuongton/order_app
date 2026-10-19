import { z } from 'zod';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { StaffService } from './staff.service.js';
import { GuestService } from '../guest/guest.service.js';
import { authenticateStaff, requirePermission } from '../../middleware/auth.js';
import { config } from '../../config/index.js';
import { query } from '../../db/pool.js';

export const staffRouter = Router();
staffRouter.param('id', (req, res, next, id) => {
    if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'INVALID_ID', message: 'ID không hợp lệ' });
    next();
});

staffRouter.use(authenticateStaff);

// 1. Dashboard snapshot
staffRouter.get('/dashboard/snapshot', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const data = await StaffService.getDashboardSnapshot(staff.tenantId);
        return res.json(data);
    } catch (err: any) {
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
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
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
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
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
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
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 12. Menu toggle availability
staffRouter.get('/menu/categories', async (req: Request, res: Response) => {
    try {
        const result = await query('SELECT id, name, sort_order FROM menu_categories WHERE tenant_id = $1 AND is_active = true ORDER BY sort_order, name', [req.staff!.tenantId]);
        return res.json({ categories: result.rows });
    } catch { return res.status(500).json({ error: 'SERVER_ERROR' }); }
});

staffRouter.get('/menu/items', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const items = await query(`
            SELECT mi.*, mc.name as category_name,
                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', miv.id,
                                'name', miv.name,
                                'price_adjustment', miv.price_adjustment,
                                'is_available', miv.is_available
                            ) ORDER BY miv.price_adjustment ASC, miv.name ASC
                        )
                        FROM menu_item_variants miv
                        WHERE miv.menu_item_id = mi.id AND miv.tenant_id = $1
                    ),
                    '[]'::json
                ) as variants
            FROM menu_items mi
            LEFT JOIN menu_categories mc ON mc.id = mi.category_id
            WHERE mi.tenant_id = $1
            ORDER BY mc.sort_order ASC, mi.name ASC
        `, [staff.tenantId]);
        return res.json({
            items: items.rows.map(r => ({
                ...r,
                price: parseInt(r.price, 10)
            }))
        });
    } catch (err: any) {
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

staffRouter.put('/menu/items/:id/toggle-available', requirePermission('menu.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const itemId = req.params.id;
        const { isAvailable } = req.body;
        if (typeof isAvailable !== 'boolean') return res.status(400).json({ error: 'INVALID_INPUT', message: 'isAvailable phải là boolean' });

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
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 13. Create Menu Item (Supports up to 3 variants)
staffRouter.post('/menu/items', requirePermission('menu.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const variantInputSchema = z.object({
            id: z.string().uuid().optional().nullable().or(z.literal('')),
            name: z.string().trim().min(1, 'Tên biến thể không được để trống').max(255),
            price_adjustment: z.coerce.number().int().min(0, 'Phụ thu không được âm').default(0),
            is_available: z.boolean().optional().default(true)
        });

        const schema = z.object({
            name: z.string().trim().min(1, 'Tên món không được để trống').max(255),
            category_id: z.string().uuid('Danh mục không hợp lệ'),
            price: z.coerce.number().int().nonnegative('Giá món không hợp lệ'),
            description: z.string().max(2000).optional().nullable(),
            image_url: z.string().max(5000000).optional().nullable().or(z.literal('')),
            is_available: z.boolean().optional().default(true),
            variants: z.array(variantInputSchema).max(3, 'Một sản phẩm chỉ có tối đa 3 dạng biến thể').optional()
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ' });
        }

        const { name, category_id, price, description, image_url, is_available, variants } = parsed.data;

        // Verify category belongs to tenant
        const catRes = await query('SELECT id FROM menu_categories WHERE id = $1 AND tenant_id = $2', [category_id, staff.tenantId]);
        if (catRes.rows.length === 0) {
            return res.status(400).json({ error: 'INVALID_CATEGORY', message: 'Danh mục không tồn tại' });
        }

        const insertRes = await query(`
            INSERT INTO menu_items (tenant_id, category_id, name, description, price, image_url, is_available)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [staff.tenantId, category_id, name, description || null, price, image_url || null, is_available]);

        const createdItem = insertRes.rows[0];

        // Insert variants if provided (up to 3)
        if (variants && variants.length > 0) {
            for (const v of variants) {
                await query(`
                    INSERT INTO menu_item_variants (tenant_id, menu_item_id, name, price_adjustment, is_available)
                    VALUES ($1, $2, $3, $4, $5)
                `, [staff.tenantId, createdItem.id, v.name, v.price_adjustment || 0, v.is_available ?? true]);
            }
        }

        const variantsRes = await query(`
            SELECT id, name, price_adjustment, is_available
            FROM menu_item_variants
            WHERE menu_item_id = $1 AND tenant_id = $2
            ORDER BY price_adjustment ASC, name ASC
        `, [createdItem.id, staff.tenantId]);

        return res.status(201).json({
            item: {
                ...createdItem,
                price: parseInt(createdItem.price, 10),
                variants: variantsRes.rows.map(r => ({
                    ...r,
                    price_adjustment: parseInt(r.price_adjustment, 10)
                }))
            },
            message: 'Thêm món mới thành công'
        });
    } catch (err: any) {
        console.error('Staff create menu item error:', err);
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 14. Update Menu Item (Supports up to 3 variants)
staffRouter.put('/menu/items/:id', requirePermission('menu.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const itemId = req.params.id;

        const variantInputSchema = z.object({
            id: z.string().uuid().optional().nullable().or(z.literal('')),
            name: z.string().trim().min(1, 'Tên biến thể không được để trống').max(255),
            price_adjustment: z.coerce.number().int().min(0, 'Phụ thu không được âm').default(0),
            is_available: z.boolean().optional().default(true)
        });

        const schema = z.object({
            name: z.string().trim().min(1, 'Tên món không được để trống').max(255).optional(),
            category_id: z.string().uuid('Danh mục không hợp lệ').optional(),
            price: z.coerce.number().int().nonnegative('Giá món không hợp lệ').optional(),
            description: z.string().max(2000).optional().nullable(),
            image_url: z.string().max(5000000).optional().nullable().or(z.literal('')),
            is_available: z.boolean().optional(),
            variants: z.array(variantInputSchema).max(3, 'Một sản phẩm chỉ có tối đa 3 dạng biến thể').optional()
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ' });
        }

        // Check if item exists and belongs to tenant
        const curRes = await query('SELECT * FROM menu_items WHERE id = $1 AND tenant_id = $2', [itemId, staff.tenantId]);
        if (curRes.rows.length === 0) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Không tìm thấy món ăn' });
        }

        const { name, category_id, price, description, image_url, is_available, variants } = parsed.data;

        if (category_id) {
            const catRes = await query('SELECT id FROM menu_categories WHERE id = $1 AND tenant_id = $2', [category_id, staff.tenantId]);
            if (catRes.rows.length === 0) {
                return res.status(400).json({ error: 'INVALID_CATEGORY', message: 'Danh mục không tồn tại' });
            }
        }

        const updateRes = await query(`
            UPDATE menu_items
            SET category_id = COALESCE($1::uuid, category_id),
                name = COALESCE($2::varchar, name),
                description = CASE WHEN $3::boolean THEN $4::text ELSE description END,
                price = COALESCE($5::bigint, price),
                image_url = CASE WHEN $6::boolean THEN $7::text ELSE image_url END,
                is_available = COALESCE($8::boolean, is_available),
                updated_at = NOW()
            WHERE id = $9::uuid AND tenant_id = $10::uuid
            RETURNING *
        `, [
            category_id || null,
            name || null,
            description !== undefined,
            description || null,
            price !== undefined ? price : null,
            image_url !== undefined,
            image_url || null,
            is_available !== undefined ? is_available : null,
            itemId,
            staff.tenantId
        ]);

        if (updateRes.rows.length === 0) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Không tìm thấy món ăn' });
        }

        // If variants provided, replace existing variants (up to 3)
        if (variants !== undefined) {
            await query('DELETE FROM menu_item_variants WHERE menu_item_id = $1 AND tenant_id = $2', [itemId, staff.tenantId]);
            for (const v of variants) {
                await query(`
                    INSERT INTO menu_item_variants (tenant_id, menu_item_id, name, price_adjustment, is_available)
                    VALUES ($1, $2, $3, $4, $5)
                `, [staff.tenantId, itemId, v.name, v.price_adjustment || 0, v.is_available ?? true]);
            }
        }

        const updatedItem = updateRes.rows[0];
        const variantsRes = await query(`
            SELECT id, name, price_adjustment, is_available
            FROM menu_item_variants
            WHERE menu_item_id = $1 AND tenant_id = $2
            ORDER BY price_adjustment ASC, name ASC
        `, [itemId, staff.tenantId]);

        return res.json({
            item: {
                ...updatedItem,
                price: parseInt(updatedItem.price, 10),
                variants: variantsRes.rows.map(r => ({
                    ...r,
                    price_adjustment: parseInt(r.price_adjustment, 10)
                }))
            },
            message: 'Cập nhật món thành công'
        });
    } catch (err: any) {
        console.error('Staff update menu item error:', err);
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 15. Delete Menu Item
staffRouter.delete('/menu/items/:id', requirePermission('menu.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const itemId = req.params.id;

        const checkRes = await query('SELECT id, name FROM menu_items WHERE id = $1 AND tenant_id = $2', [itemId, staff.tenantId]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Không tìm thấy món ăn' });
        }

        await query('DELETE FROM menu_items WHERE id = $1 AND tenant_id = $2', [itemId, staff.tenantId]);

        return res.json({ success: true, message: `Đã xóa món "${checkRes.rows[0].name}" thành công` });
    } catch (err: any) {
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 16. Create Table
staffRouter.post('/tables', requirePermission('table.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const schema = z.object({
            table_number: z.string().trim().min(1, 'Số bàn không được để trống').max(64),
            capacity: z.number().int().min(1, 'Sức chứa tối thiểu 1 người').max(100).optional().default(4)
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ' });
        }

        const { table_number, capacity } = parsed.data;

        // Check uniqueness within tenant
        const existing = await query('SELECT id FROM tables WHERE tenant_id = $1 AND LOWER(table_number) = LOWER($2)', [staff.tenantId, table_number]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'DUPLICATE_TABLE', message: `Bàn "${table_number}" đã tồn tại` });
        }

        // Generate public_qr_id
        const cleanNum = table_number.toLowerCase().replace(/[^a-z0-9]/g, '') || 't';
        const randomSuffix = crypto.randomBytes(3).toString('hex');
        const slug = (staff.tenantSlug || 'shop').toLowerCase().replace(/[^a-z0-9]/g, '');
        const publicQrId = `qr-${slug}-${cleanNum}-${randomSuffix}`;

        const insertRes = await query(`
            INSERT INTO tables (tenant_id, table_number, public_qr_id, capacity, readiness, is_enabled)
            VALUES ($1, $2, $3, $4, 'READY', true)
            RETURNING *
        `, [staff.tenantId, table_number, publicQrId, capacity]);

        return res.status(201).json({ table: insertRes.rows[0], message: `Đã tạo bàn "${table_number}" thành công` });
    } catch (err: any) {
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 17. Update Table
staffRouter.patch('/tables/:id', requirePermission('table.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const tableId = req.params.id;

        const schema = z.object({
            table_number: z.string().trim().min(1, 'Số bàn không được để trống').max(64).optional(),
            capacity: z.number().int().min(1, 'Sức chứa tối thiểu 1 người').max(100).optional(),
            is_enabled: z.boolean().optional()
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ' });
        }

        const checkRes = await query('SELECT id, table_number FROM tables WHERE id = $1 AND tenant_id = $2', [tableId, staff.tenantId]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Không tìm thấy bàn' });
        }

        const { table_number, capacity, is_enabled } = parsed.data;

        if (table_number && table_number.toLowerCase() !== checkRes.rows[0].table_number.toLowerCase()) {
            const dupRes = await query('SELECT id FROM tables WHERE tenant_id = $1 AND LOWER(table_number) = LOWER($2) AND id != $3', [staff.tenantId, table_number, tableId]);
            if (dupRes.rows.length > 0) {
                return res.status(400).json({ error: 'DUPLICATE_TABLE', message: `Bàn "${table_number}" đã tồn tại` });
            }
        }

        const updateRes = await query(`
            UPDATE tables
            SET table_number = COALESCE($1, table_number),
                capacity = COALESCE($2, capacity),
                is_enabled = COALESCE($3, is_enabled),
                updated_at = NOW()
            WHERE id = $4 AND tenant_id = $5
            RETURNING *
        `, [table_number || null, capacity || null, is_enabled !== undefined ? is_enabled : null, tableId, staff.tenantId]);

        return res.json({ table: updateRes.rows[0], message: 'Cập nhật bàn thành công' });
    } catch (err: any) {
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// 18. Delete Table
staffRouter.delete('/tables/:id', requirePermission('table.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const tableId = req.params.id;

        const checkRes = await query('SELECT id, table_number FROM tables WHERE id = $1 AND tenant_id = $2', [tableId, staff.tenantId]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Không tìm thấy bàn' });
        }

        // Check if there is an active OPEN session
        const openSessionRes = await query('SELECT id FROM table_sessions WHERE table_id = $1 AND status = \'OPEN\'', [tableId]);
        if (openSessionRes.rows.length > 0) {
            return res.status(400).json({
                error: 'TABLE_SESSION_OPEN',
                message: `Bàn "${checkRes.rows[0].table_number}" đang có phiên phục vụ mở. Vui lòng thanh toán hoặc hủy phiên trước khi xóa bàn.`
            });
        }

        await query('DELETE FROM tables WHERE id = $1 AND tenant_id = $2', [tableId, staff.tenantId]);

        return res.json({ success: true, message: `Đã xóa bàn "${checkRes.rows[0].table_number}" thành công` });
    } catch (err: any) {
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});
