import { z } from 'zod';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { StaffService } from './staff.service.js';
import { GuestService } from '../guest/guest.service.js';
import { authenticateStaff, requirePermission } from '../../middleware/auth.js';
import { staffMutationLimiter } from '../../middleware/security.js';
import { config } from '../../config/index.js';
import { query, withTransaction } from '../../db/pool.js';
import { validate } from '../../utils/validation.js';
import { generatePublicQrId } from '../../utils/crypto.js';

export const staffRouter = Router();
staffRouter.param('id', (req, res, next, id) => {
    if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'INVALID_ID', message: 'ID không hợp lệ' });
    next();
});

staffRouter.use(authenticateStaff);
staffRouter.use(staffMutationLimiter);

// Staff ordering uses authenticated identity; public guest claims are unchanged.
staffRouter.post('/sessions/:id/orders', requirePermission('order.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const sessionId = validate(z.string().uuid(), req.params.id);
        const session = await query<{table_id:string}>(
            'SELECT table_id FROM table_sessions WHERE id=$1 AND tenant_id=$2', [sessionId,staff.tenantId]);
        if (!session.rows.length) return res.status(404).json({error:'SESSION_NOT_FOUND',message:'Không tìm thấy phiên bàn'});
        const result = await GuestService.createOrder(staff.tenantId,sessionId,session.rows[0].table_id,
            {idempotencyKey:req.body.idempotencyKey,items:req.body.items}, undefined,
            {id:staff.id,fullName:staff.fullName});
        return res.status(201).json(result);
    } catch (err: unknown) {
        const error = err as {status?:number;code?:string;message?:string};
        return res.status(error.status || 500).json({error:error.code || 'SERVER_ERROR',message:error.status ? error.message : 'Không thể gửi món hộ khách. Vui lòng thử lại.'});
    }
});

// Staff enters the existing guest storefront only after server-side authorization.
staffRouter.get('/sessions/:id/ordering-context', requirePermission('order.manage'), async (req: Request, res: Response) => {
    try {
        const staff=req.staff!;
        const result=await query<{id:string;status:string;opened_at:string;public_qr_id:string}>(`
            SELECT ts.id,ts.status,ts.opened_at,t.public_qr_id FROM table_sessions ts
            JOIN tables t ON t.id=ts.table_id AND t.tenant_id=ts.tenant_id
            WHERE ts.id=$1 AND ts.tenant_id=$2`,[req.params.id,staff.tenantId]);
        const session=result.rows[0];
        if (!session) return res.status(404).json({error:'SESSION_NOT_FOUND',message:'Không tìm thấy phiên bàn'});
        if (session.status!=='OPEN') return res.status(409).json({error:'SESSION_CLOSED',message:'Phiên bàn đã kết thúc'});
        if (req.query.qrId!==session.public_qr_id) return res.status(409).json({error:'TABLE_MISMATCH',message:'Phiên không thuộc bàn đang mở'});
        const menu=await GuestService.getPublicTableMenu(session.public_qr_id);
        return res.json({...menu,
            session:{id:session.id,status:session.status,openedAt:session.opened_at},
            staff:{id:staff.id,fullName:staff.fullName}});
    } catch (err:unknown) {
        const error=err as {status?:number;code?:string;message?:string};
        return res.status(error.status || 500).json({error:error.code || 'SERVER_ERROR',message:error.status ? error.message : 'Không thể xác nhận quyền gọi hộ'});
    }
});

staffRouter.get('/sessions/:id/orders', requirePermission('order.manage'), async (req: Request, res: Response) => {
    try {
        const staff=req.staff!;
        const found=await query('SELECT id FROM table_sessions WHERE id=$1 AND tenant_id=$2',[req.params.id,staff.tenantId]);
        if (!found.rows.length) return res.status(404).json({error:'SESSION_NOT_FOUND',message:'Không tìm thấy phiên bàn'});
        return res.json({orders:await GuestService.getSessionOrders(staff.tenantId,req.params.id),staff:{fullName:staff.fullName}});
    } catch {
        return res.status(500).json({error:'SERVER_ERROR',message:'Không tải được món của phiên bàn'});
    }
});

staffRouter.get('/sessions/:id/order-attributions', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const sessionId = validate(z.string().uuid(), req.params.id);
        const result = await query(`SELECT o.order_number AS "orderNumber", a.user_id AS "staffId",
            a.details->>'staffName' AS "staffName", a.created_at AS "createdAt"
            FROM orders o JOIN audit_logs a ON a.resource_id=o.id::text AND a.tenant_id=o.tenant_id
                AND a.action='STAFF_CREATE_ORDER' AND a.resource_type='order'
            WHERE o.tenant_id=$1 AND o.session_id=$2 ORDER BY o.order_number`, [staff.tenantId,sessionId]);
        return res.json({attributions:result.rows});
    } catch (err: unknown) {
        const error = err as {status?:number;message?:string};
        return res.status(error.status || 500).json({error:'SERVER_ERROR',message:error.message});
    }
});

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

// 2b. Gaeru Flow - Approve Session Request (P1)
staffRouter.post('/tables/:id/approve-request', requirePermission('session.open'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const tableId = req.params.id;
        const result: any = await StaffService.approveSessionRequest(staff.tenantId, tableId, staff.id, req.body);
        if (result.isError) {
            return res.status(result.status || 409).json({
                error: result.code || 'SERVER_ERROR',
                code: result.code || 'SERVER_ERROR',
                message: result.message
            });
        }
        return res.status(200).json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            code: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi duyệt yêu cầu mở bàn'
        });
    }
});

// 2c. Gaeru Flow - Reject Session Request (P1)
staffRouter.post('/tables/:id/reject-request', requirePermission('session.open'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const tableId = req.params.id;
        const result = await StaffService.rejectSessionRequest(staff.tenantId, tableId, staff.id, req.body);
        return res.status(200).json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            code: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi từ chối yêu cầu mở bàn'
        });
    }
});

// 2d. Gaeru Flow - Release Claim (P1)
staffRouter.post('/tables/:id/release-claim', requirePermission('session.open'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const tableId = req.params.id;
        const result = await StaffService.releaseSessionClaim(staff.tenantId, tableId, staff.id);
        return res.status(200).json(result);
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            code: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi giải phóng quyền đặt món'
        });
    }
});

// 2e. Gaeru Flow - Get Pending Requests (P1)
staffRouter.get('/requests/pending', requirePermission('session.open'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const requests = await StaffService.getPendingRequests(staff.tenantId);
        return res.status(200).json({ requests });
    } catch (err: any) {
        const status = err.status || 500;
        return res.status(status).json({
            error: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi lấy danh sách yêu cầu mở bàn'
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
            const { settlementVersion, note, requestId, expectedAmount, paymentMethod } = req.body || {};

            if (expectedAmount === undefined || typeof expectedAmount !== 'number' || isNaN(expectedAmount) || expectedAmount < 0) {
                return res.status(400).json({
                    error: 'MISSING_EXPECTED_AMOUNT',
                    message: 'Vui lòng cung cấp số tiền thanh toán dự kiến (expectedAmount) hợp lệ'
                });
            }

            const result = await StaffService.confirmPaymentAndCloseSession(
                staff.tenantId,
                sessionId,
                settlementVersion,
                staff.id,
                note,
                requestId,
                Number(expectedAmount),
                paymentMethod
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

// 12. Menu categories CRUD (Issue #100)
staffRouter.get('/menu/categories', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const includeInactive = req.query.include_inactive === 'true' || req.query.all === 'true';
        const whereSql = includeInactive
            ? 'mc.tenant_id = $1'
            : 'mc.tenant_id = $1 AND mc.is_active = true';

        const result = await query(`
            SELECT
                mc.id,
                mc.name,
                mc.sort_order,
                mc.is_active,
                COUNT(mi.id)::int AS item_count
            FROM menu_categories mc
            LEFT JOIN menu_items mi ON mi.category_id = mc.id AND mi.tenant_id = mc.tenant_id
            WHERE ${whereSql}
            GROUP BY mc.id, mc.name, mc.sort_order, mc.is_active
            ORDER BY mc.sort_order ASC, mc.name ASC
        `, [staff.tenantId]);

        return res.json({ categories: result.rows });
    } catch (err: any) {
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Lỗi lấy danh sách danh mục' });
    }
});

staffRouter.post('/menu/categories', requirePermission('menu.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const schema = z.object({
            name: z.string().trim().min(1, 'Tên danh mục không được để trống').max(255, 'Tên danh mục không được vượt quá 255 ký tự'),
            sort_order: z.coerce.number().int().optional(),
            is_active: z.boolean().optional().default(true)
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'INVALID_CATEGORY_NAME',
                code: 'INVALID_CATEGORY_NAME',
                message: parsed.error.issues[0]?.message || 'Tên danh mục không hợp lệ'
            });
        }

        const { name, is_active } = parsed.data;

        const category = await withTransaction(async (client) => {
            // Check duplicate name within tenant (case-insensitive)
            const dupCheck = await client.query(
                'SELECT id FROM menu_categories WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
                [staff.tenantId, name]
            );
            if (dupCheck.rows.length > 0) {
                throw { status: 409, code: 'CATEGORY_NAME_EXISTS', message: 'Tên danh mục đã tồn tại trong quán' };
            }

            // Determine sort_order if not provided
            let sortOrder = parsed.data.sort_order;
            if (sortOrder === undefined) {
                const sortRes = await client.query(
                    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM menu_categories WHERE tenant_id = $1',
                    [staff.tenantId]
                );
                sortOrder = parseInt(sortRes.rows[0].next_sort, 10);
            }

            const insertRes = await client.query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order, is_active)
                VALUES ($1, $2, $3, $4)
                RETURNING id, tenant_id, name, sort_order, is_active, created_at, updated_at
            `, [staff.tenantId, name, sortOrder, is_active]);

            const newCat = insertRes.rows[0];

            // Record audit log
            await client.query(`
                INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
                VALUES ($1, $2, 'category_create', 'menu_category', $3, $4)
            `, [staff.tenantId, staff.id, newCat.id, JSON.stringify({ name, sort_order: sortOrder })]);

            return { ...newCat, item_count: 0 };
        });

        return res.status(201).json({
            category,
            message: 'Thêm danh mục món thành công'
        });
    } catch (err: any) {
        if (err.code === '23505' && (err.constraint === 'idx_menu_categories_tenant_name' || err.message?.includes('idx_menu_categories_tenant_name') || err.detail?.includes('LOWER(TRIM(name))'))) {
            return res.status(409).json({
                error: 'CATEGORY_NAME_EXISTS',
                code: 'CATEGORY_NAME_EXISTS',
                message: 'Tên danh mục đã tồn tại trong quán'
            });
        }
        return res.status(err.status || 500).json({
            error: err.code || 'SERVER_ERROR',
            code: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi thêm danh mục'
        });
    }
});

const handleUpdateCategory = async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const categoryId = req.params.id;

        const schema = z.object({
            name: z.string().trim().min(1, 'Tên danh mục không được để trống').max(255, 'Tên danh mục không được vượt quá 255 ký tự').optional(),
            sort_order: z.coerce.number().int().optional(),
            is_active: z.boolean().optional()
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'INVALID_CATEGORY_NAME',
                code: 'INVALID_CATEGORY_NAME',
                message: parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ'
            });
        }

        const { name, sort_order, is_active } = parsed.data;
        if (name === undefined && sort_order === undefined && is_active === undefined) {
            return res.status(400).json({
                error: 'INVALID_INPUT',
                code: 'INVALID_INPUT',
                message: 'Cần ít nhất một trường để cập nhật danh mục'
            });
        }

        const updatedCategory = await withTransaction(async (client) => {
            // Lock category row FOR UPDATE
            const curRes = await client.query(
                'SELECT * FROM menu_categories WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
                [categoryId, staff.tenantId]
            );
            if (curRes.rows.length === 0) {
                throw { status: 404, code: 'CATEGORY_NOT_FOUND', message: 'Không tìm thấy danh mục món' };
            }

            const current = curRes.rows[0];

            // If renaming, check duplicate name within tenant
            if (name && name.toLowerCase() !== current.name.toLowerCase()) {
                const dupCheck = await client.query(
                    'SELECT id FROM menu_categories WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND id != $3',
                    [staff.tenantId, name, categoryId]
                );
                if (dupCheck.rows.length > 0) {
                    throw { status: 409, code: 'CATEGORY_NAME_EXISTS', message: 'Tên danh mục đã tồn tại trong quán' };
                }
            }

            const updateRes = await client.query(`
                UPDATE menu_categories
                SET name = COALESCE($1, name),
                    sort_order = COALESCE($2, sort_order),
                    is_active = COALESCE($3, is_active),
                    updated_at = NOW()
                WHERE id = $4 AND tenant_id = $5
                RETURNING id, tenant_id, name, sort_order, is_active, created_at, updated_at
            `, [
                name !== undefined ? name : null,
                sort_order !== undefined ? sort_order : null,
                is_active !== undefined ? is_active : null,
                categoryId,
                staff.tenantId
            ]);

            const updated = updateRes.rows[0];

            // Get current item count
            const countRes = await client.query(
                'SELECT COUNT(*)::int AS count FROM menu_items WHERE category_id = $1 AND tenant_id = $2',
                [categoryId, staff.tenantId]
            );

            // Record audit log
            await client.query(`
                INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
                VALUES ($1, $2, 'category_update', 'menu_category', $3, $4)
            `, [staff.tenantId, staff.id, categoryId, JSON.stringify({
                old: { name: current.name, sort_order: current.sort_order, is_active: current.is_active },
                new: { name: updated.name, sort_order: updated.sort_order, is_active: updated.is_active }
            })]);

            return { ...updated, item_count: countRes.rows[0].count };
        });

        return res.json({
            category: updatedCategory,
            message: 'Cập nhật danh mục thành công'
        });
    } catch (err: any) {
        if (err.code === '23505' && (err.constraint === 'idx_menu_categories_tenant_name' || err.message?.includes('idx_menu_categories_tenant_name') || err.detail?.includes('LOWER(TRIM(name))'))) {
            return res.status(409).json({
                error: 'CATEGORY_NAME_EXISTS',
                code: 'CATEGORY_NAME_EXISTS',
                message: 'Tên danh mục đã tồn tại trong quán'
            });
        }
        return res.status(err.status || 500).json({
            error: err.code || 'SERVER_ERROR',
            code: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi cập nhật danh mục'
        });
    }
};

staffRouter.put('/menu/categories/:id', requirePermission('menu.manage'), handleUpdateCategory);
staffRouter.patch('/menu/categories/:id', requirePermission('menu.manage'), handleUpdateCategory);

staffRouter.delete('/menu/categories/:id', requirePermission('menu.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const categoryId = req.params.id;

        const deletedCategory = await withTransaction(async (client) => {
            // Lock category row FOR UPDATE
            const catRes = await client.query(
                'SELECT id, name FROM menu_categories WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
                [categoryId, staff.tenantId]
            );
            if (catRes.rows.length === 0) {
                throw { status: 404, code: 'CATEGORY_NOT_FOUND', message: 'Không tìm thấy danh mục món' };
            }

            const cat = catRes.rows[0];

            // Check if any menu items reference this category (including available and unavailable)
            const countRes = await client.query(
                'SELECT COUNT(*)::int AS count FROM menu_items WHERE category_id = $1 AND tenant_id = $2',
                [categoryId, staff.tenantId]
            );

            const count = countRes.rows[0].count;
            if (count > 0) {
                throw {
                    status: 409,
                    code: 'CATEGORY_NOT_EMPTY',
                    itemCount: count,
                    message: `Danh mục "${cat.name}" đang chứa ${count} món ăn. Vui lòng chuyển hoặc xóa các món thuộc danh mục này trước khi xóa danh mục.`
                };
            }

            try {
                await client.query(
                    'DELETE FROM menu_categories WHERE id = $1 AND tenant_id = $2',
                    [categoryId, staff.tenantId]
                );
            } catch (dbErr: any) {
                // If a concurrent transaction inserted an item, foreign key RESTRICT will raise 23503
                if (dbErr.code === '23503') {
                    throw {
                        status: 409,
                        code: 'CATEGORY_NOT_EMPTY',
                        itemCount: 1,
                        message: `Danh mục "${cat.name}" đang chứa món ăn. Vui lòng chuyển hoặc xóa các món thuộc danh mục này trước khi xóa danh mục.`
                    };
                }
                throw dbErr;
            }

            // Record audit log
            await client.query(`
                INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
                VALUES ($1, $2, 'category_delete', 'menu_category', $3, $4)
            `, [staff.tenantId, staff.id, categoryId, JSON.stringify({ name: cat.name })]);

            return cat;
        });

        return res.json({
            success: true,
            code: 'CATEGORY_DELETED',
            message: `Đã xóa danh mục "${deletedCategory.name}" thành công`
        });
    } catch (err: any) {
        return res.status(err.status || 500).json({
            error: err.code || 'SERVER_ERROR',
            code: err.code || 'SERVER_ERROR',
            message: err.message || 'Lỗi xóa danh mục',
            ...(err.itemCount !== undefined ? { itemCount: err.itemCount } : {})
        });
    }
});

// Helpers for menu items & option groups
function normalizeOptionGroups(data: any): Array<{
    id: string;
    name: string;
    selectionMode: 'SINGLE' | 'MULTIPLE';
    minSelections: number;
    maxSelections: number;
    pricingMode: 'FREE' | 'ADDITIVE';
    sortOrder: number;
    options: Array<{
        id: string;
        name: string;
        priceDelta: number;
        isDefault: boolean;
        isAvailable: boolean;
        sortOrder: number;
    }>;
}> {
    const rawGroups = data.option_groups || data.optionGroups || data.variant_groups;
    if (rawGroups && Array.isArray(rawGroups)) {
        return rawGroups.map((g: any, gIdx: number) => {
            const pricingMode: 'FREE' | 'ADDITIVE' = (g.pricing_mode || g.pricingMode) === 'FREE' ? 'FREE' : 'ADDITIVE';
            const selectionMode: 'SINGLE' | 'MULTIPLE' = (g.selection_mode || g.selectionMode) === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE';
            const minSelections = g.min_selections !== undefined ? parseInt(g.min_selections, 10) : (g.minSelections !== undefined ? parseInt(g.minSelections, 10) : (selectionMode === 'SINGLE' ? 1 : 0));
            const maxSelections = selectionMode === 'SINGLE' ? 1 : (g.max_selections !== undefined ? parseInt(g.max_selections, 10) : (g.maxSelections !== undefined ? parseInt(g.maxSelections, 10) : 10));
            const grpId = (g.id && z.string().uuid().safeParse(g.id).success) ? g.id : crypto.randomUUID();

            const options = (g.options || []).map((o: any, oIdx: number) => {
                const optId = (o.id && z.string().uuid().safeParse(o.id).success) ? o.id : crypto.randomUUID();
                const rawDelta = o.price_delta !== undefined ? o.price_delta : (o.priceDelta !== undefined ? o.priceDelta : (o.price_adjustment !== undefined ? o.price_adjustment : 0));
                const priceDelta = pricingMode === 'FREE' ? 0 : Math.max(0, parseInt(rawDelta, 10) || 0);
                const isDefault = Boolean(o.is_default ?? o.isDefault ?? false);
                const isAvailable = o.is_available !== undefined ? Boolean(o.is_available) : (o.isAvailable !== undefined ? Boolean(o.isAvailable) : true);
                const sortOrder = o.sort_order !== undefined ? parseInt(o.sort_order, 10) : (o.sortOrder !== undefined ? parseInt(o.sortOrder, 10) : oIdx);

                return {
                    id: optId,
                    name: String(o.name || '').trim(),
                    priceDelta,
                    isDefault,
                    isAvailable,
                    sortOrder
                };
            });

            // If a SINGLE required group has no explicit default, default to the first available option
            if (selectionMode === 'SINGLE' && minSelections > 0 && !options.some((o: any) => o.isDefault) && options.length > 0) {
                options[0].isDefault = true;
            }

            return {
                id: grpId,
                name: String(g.name || '').trim(),
                selectionMode,
                minSelections,
                maxSelections,
                pricingMode,
                sortOrder: g.sort_order !== undefined ? parseInt(g.sort_order, 10) : (g.sortOrder !== undefined ? parseInt(g.sortOrder, 10) : gIdx),
                options
            };
        });
    }

    if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
        const grpId = crypto.randomUUID();
        return [{
            id: grpId,
            name: 'Biến thể',
            selectionMode: 'SINGLE',
            minSelections: 0,
            maxSelections: 1,
            pricingMode: 'ADDITIVE',
            sortOrder: 0,
            options: data.variants.map((v: any, oIdx: number) => ({
                id: (v.id && z.string().uuid().safeParse(v.id).success) ? v.id : crypto.randomUUID(),
                name: String(v.name || '').trim(),
                priceDelta: Math.max(0, parseInt(v.price_adjustment || v.price_delta || 0, 10)),
                isDefault: false,
                isAvailable: v.is_available ?? true,
                sortOrder: oIdx
            }))
        }];
    }

    return [];
}

async function syncItemOptions(client: any, tenantId: string, itemId: string, groups: ReturnType<typeof normalizeOptionGroups>) {
    await client.query('DELETE FROM item_options WHERE menu_item_id = $1 AND tenant_id = $2', [itemId, tenantId]);
    await client.query('DELETE FROM item_option_groups WHERE menu_item_id = $1 AND tenant_id = $2', [itemId, tenantId]);
    await client.query('DELETE FROM menu_item_variants WHERE menu_item_id = $1 AND tenant_id = $2', [itemId, tenantId]);

    for (const g of groups) {
        await client.query(`
            INSERT INTO item_option_groups (
                id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
        `, [g.id, tenantId, itemId, g.name, g.selectionMode, g.minSelections, g.maxSelections, g.pricingMode, g.sortOrder]);

        for (const opt of g.options) {
            await client.query(`
                INSERT INTO item_options (
                    id, tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [opt.id, tenantId, g.id, itemId, opt.name, opt.priceDelta, opt.isDefault, opt.isAvailable, opt.sortOrder]);

            await client.query(`
                INSERT INTO menu_item_variants (
                    id, tenant_id, menu_item_id, group_name, name, price_adjustment, is_available
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [opt.id, tenantId, itemId, g.name, opt.name, opt.priceDelta, opt.isAvailable]);
        }
    }
}

async function fetchFullMenuItem(tenantId: string, itemId: string, client?: any) {
    const q = client ? client.query.bind(client) : query;
    const res = await q(`
        SELECT mi.*, mc.name as category_name,
            COALESCE(
                (
                    SELECT json_agg(
                        json_build_object(
                            'id', iog.id,
                            'name', iog.name,
                            'selection_mode', iog.selection_mode,
                            'selectionMode', iog.selection_mode,
                            'min_selections', iog.min_selections,
                            'minSelections', iog.min_selections,
                            'max_selections', iog.max_selections,
                            'maxSelections', iog.max_selections,
                            'pricing_mode', iog.pricing_mode,
                            'pricingMode', iog.pricing_mode,
                            'sort_order', iog.sort_order,
                            'sortOrder', iog.sort_order,
                            'options', COALESCE(
                                (
                                    SELECT json_agg(
                                        json_build_object(
                                            'id', io.id,
                                            'name', io.name,
                                            'price_delta', io.price_delta,
                                            'priceDelta', io.price_delta,
                                            'is_default', io.is_default,
                                            'isDefault', io.is_default,
                                            'is_available', io.is_available,
                                            'isAvailable', io.is_available,
                                            'sort_order', io.sort_order,
                                            'sortOrder', io.sort_order
                                        ) ORDER BY io.sort_order ASC, io.price_delta ASC, io.name ASC
                                    )
                                    FROM item_options io
                                    WHERE io.group_id = iog.id
                                ),
                                '[]'::json
                            )
                        ) ORDER BY iog.sort_order ASC, iog.created_at ASC
                    )
                    FROM item_option_groups iog
                    WHERE iog.menu_item_id = mi.id AND iog.tenant_id = $1
                ),
                '[]'::json
            ) as option_groups,
            COALESCE(
                (
                    SELECT json_agg(
                        json_build_object(
                            'id', miv.id,
                            'group_name', COALESCE(miv.group_name, 'Biến thể'),
                            'name', miv.name,
                            'price_adjustment', miv.price_adjustment,
                            'is_available', miv.is_available
                        ) ORDER BY miv.group_name ASC, miv.price_adjustment ASC, miv.name ASC
                    )
                    FROM menu_item_variants miv
                    WHERE miv.menu_item_id = mi.id AND miv.tenant_id = $1
                ),
                '[]'::json
            ) as variants
        FROM menu_items mi
        LEFT JOIN menu_categories mc ON mc.id = mi.category_id
        WHERE mi.id = $2 AND mi.tenant_id = $1
    `, [tenantId, itemId]);

    if (res.rows.length === 0) return null;
    const r = res.rows[0];

    const rawVariants = (r.variants || []).map((v: any) => ({
        ...v,
        group_name: v.group_name || 'Biến thể',
        price_adjustment: parseInt(v.price_adjustment, 10) || 0
    }));
    const groupsMap = new Map<string, any[]>();
    for (const v of rawVariants) {
        if (!groupsMap.has(v.group_name)) groupsMap.set(v.group_name, []);
        groupsMap.get(v.group_name)!.push({
            id: v.id,
            name: v.name,
            price_adjustment: v.price_adjustment,
            is_available: v.is_available
        });
    }
    const variant_groups = Array.from(groupsMap.entries()).map(([name, options]) => ({
        name,
        options
    }));

    const option_groups = (r.option_groups || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        selection_mode: g.selection_mode || g.selectionMode || 'SINGLE',
        selectionMode: g.selection_mode || g.selectionMode || 'SINGLE',
        min_selections: parseInt(g.min_selections ?? g.minSelections ?? 0, 10),
        minSelections: parseInt(g.min_selections ?? g.minSelections ?? 0, 10),
        max_selections: parseInt(g.max_selections ?? g.maxSelections ?? 1, 10),
        maxSelections: parseInt(g.max_selections ?? g.maxSelections ?? 1, 10),
        pricing_mode: g.pricing_mode || g.pricingMode || 'ADDITIVE',
        pricingMode: g.pricing_mode || g.pricingMode || 'ADDITIVE',
        sort_order: parseInt(g.sort_order ?? g.sortOrder ?? 0, 10),
        sortOrder: parseInt(g.sort_order ?? g.sortOrder ?? 0, 10),
        options: (g.options || []).map((o: any) => ({
            id: o.id,
            name: o.name,
            price_delta: parseInt(o.price_delta ?? o.priceDelta ?? 0, 10),
            priceDelta: parseInt(o.price_delta ?? o.priceDelta ?? 0, 10),
            is_default: Boolean(o.is_default ?? o.isDefault),
            isDefault: Boolean(o.is_default ?? o.isDefault),
            is_available: Boolean(o.is_available ?? o.isAvailable ?? true),
            isAvailable: Boolean(o.is_available ?? o.isAvailable ?? true),
            sort_order: parseInt(o.sort_order ?? o.sortOrder ?? 0, 10),
            sortOrder: parseInt(o.sort_order ?? o.sortOrder ?? 0, 10)
        }))
    }));

    return {
        ...r,
        sort_order: parseInt(r.sort_order || '0', 10),
        price: parseInt(r.price, 10),
        variants: rawVariants,
        variant_groups,
        option_groups,
        optionGroups: option_groups
    };
}

staffRouter.get('/menu/items', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const items = await query(`
            SELECT mi.*, mc.name as category_name,
                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', iog.id,
                                'name', iog.name,
                                'selection_mode', iog.selection_mode,
                                'selectionMode', iog.selection_mode,
                                'min_selections', iog.min_selections,
                                'minSelections', iog.min_selections,
                                'max_selections', iog.max_selections,
                                'maxSelections', iog.max_selections,
                                'pricing_mode', iog.pricing_mode,
                                'pricingMode', iog.pricing_mode,
                                'sort_order', iog.sort_order,
                                'sortOrder', iog.sort_order,
                                'options', COALESCE(
                                    (
                                        SELECT json_agg(
                                            json_build_object(
                                                'id', io.id,
                                                'name', io.name,
                                                'price_delta', io.price_delta,
                                                'priceDelta', io.price_delta,
                                                'is_default', io.is_default,
                                                'isDefault', io.is_default,
                                                'is_available', io.is_available,
                                                'isAvailable', io.is_available,
                                                'sort_order', io.sort_order,
                                                'sortOrder', io.sort_order
                                            ) ORDER BY io.sort_order ASC, io.price_delta ASC, io.name ASC
                                        )
                                        FROM item_options io
                                        WHERE io.group_id = iog.id
                                    ),
                                    '[]'::json
                                )
                            ) ORDER BY iog.sort_order ASC, iog.created_at ASC
                        )
                        FROM item_option_groups iog
                        WHERE iog.menu_item_id = mi.id AND iog.tenant_id = $1
                    ),
                    '[]'::json
                ) as option_groups,
                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', miv.id,
                                'group_name', COALESCE(miv.group_name, 'Biến thể'),
                                'name', miv.name,
                                'price_adjustment', miv.price_adjustment,
                                'is_available', miv.is_available
                            ) ORDER BY miv.group_name ASC, miv.price_adjustment ASC, miv.name ASC
                        )
                        FROM menu_item_variants miv
                        WHERE miv.menu_item_id = mi.id AND miv.tenant_id = $1
                    ),
                    '[]'::json
                ) as variants
            FROM menu_items mi
            LEFT JOIN menu_categories mc ON mc.id = mi.category_id
            WHERE mi.tenant_id = $1
            ORDER BY mc.sort_order ASC, mi.sort_order ASC, mi.name ASC, mi.id ASC
        `, [staff.tenantId]);

        return res.json({
            items: items.rows.map(r => {
                const rawVariants = (r.variants || []).map((v: any) => ({
                    ...v,
                    group_name: v.group_name || 'Biến thể',
                    price_adjustment: parseInt(v.price_adjustment, 10) || 0
                }));
                const groupsMap = new Map<string, any[]>();
                for (const v of rawVariants) {
                    if (!groupsMap.has(v.group_name)) groupsMap.set(v.group_name, []);
                    groupsMap.get(v.group_name)!.push({
                        id: v.id,
                        name: v.name,
                        price_adjustment: v.price_adjustment,
                        is_available: v.is_available
                    });
                }
                const variant_groups = Array.from(groupsMap.entries()).map(([name, options]) => ({
                    name,
                    options
                }));

                const option_groups = (r.option_groups || []).map((g: any) => ({
                    id: g.id,
                    name: g.name,
                    selection_mode: g.selection_mode || g.selectionMode || 'SINGLE',
                    selectionMode: g.selection_mode || g.selectionMode || 'SINGLE',
                    min_selections: parseInt(g.min_selections ?? g.minSelections ?? 0, 10),
                    minSelections: parseInt(g.min_selections ?? g.minSelections ?? 0, 10),
                    max_selections: parseInt(g.max_selections ?? g.maxSelections ?? 1, 10),
                    maxSelections: parseInt(g.max_selections ?? g.maxSelections ?? 1, 10),
                    pricing_mode: g.pricing_mode || g.pricingMode || 'ADDITIVE',
                    pricingMode: g.pricing_mode || g.pricingMode || 'ADDITIVE',
                    sort_order: parseInt(g.sort_order ?? g.sortOrder ?? 0, 10),
                    sortOrder: parseInt(g.sort_order ?? g.sortOrder ?? 0, 10),
                    options: (g.options || []).map((o: any) => ({
                        id: o.id,
                        name: o.name,
                        price_delta: parseInt(o.price_delta ?? o.priceDelta ?? 0, 10),
                        priceDelta: parseInt(o.price_delta ?? o.priceDelta ?? 0, 10),
                        is_default: Boolean(o.is_default ?? o.isDefault),
                        isDefault: Boolean(o.is_default ?? o.isDefault),
                        is_available: Boolean(o.is_available ?? o.isAvailable ?? true),
                        isAvailable: Boolean(o.is_available ?? o.isAvailable ?? true),
                        sort_order: parseInt(o.sort_order ?? o.sortOrder ?? 0, 10),
                        sortOrder: parseInt(o.sort_order ?? o.sortOrder ?? 0, 10)
                    }))
                }));

                return {
                    ...r,
                    sort_order: parseInt(r.sort_order || '0', 10),
                    price: parseInt(r.price, 10),
                    variants: rawVariants,
                    variant_groups,
                    option_groups,
                    optionGroups: option_groups
                };
            })
        });
    } catch (err: any) {
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// Single item details endpoint
staffRouter.get('/menu/items/:id', async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const itemId = req.params.id;
        const item = await fetchFullMenuItem(staff.tenantId, itemId);
        if (!item) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Không tìm thấy món ăn' });
        }
        return res.json({ item });
    } catch (err: any) {
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

// Category-scoped item reordering
staffRouter.post('/menu/reorder', requirePermission('menu.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const schema = z.object({
            categoryId: z.string().uuid(),
            itemIds: z.array(z.string().uuid()).min(1)
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ' });
        }
        const { categoryId, itemIds } = parsed.data;

        // Check duplicates
        const uniqueIds = new Set(itemIds);
        if (uniqueIds.size !== itemIds.length) {
            return res.status(400).json({ error: 'DUPLICATE_ITEMS', message: 'Danh sách ID món bị trùng lặp' });
        }

        await withTransaction(async (client) => {
            const cat = await client.query('SELECT id FROM menu_categories WHERE id = $1 AND tenant_id = $2', [categoryId, staff.tenantId]);
            if (cat.rows.length === 0) {
                throw { status: 400, code: 'INVALID_CATEGORY', message: 'Danh mục không tồn tại' };
            }

            const itemsRes = await client.query(
                'SELECT id FROM menu_items WHERE tenant_id = $1 AND category_id = $2 AND id = ANY($3::uuid[])',
                [staff.tenantId, categoryId, itemIds]
            );
            if (itemsRes.rows.length !== itemIds.length) {
                throw { status: 400, code: 'INVALID_ITEMS', message: 'Một số món không thuộc danh mục này hoặc không tồn tại' };
            }

            for (let i = 0; i < itemIds.length; i++) {
                await client.query(
                    'UPDATE menu_items SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
                    [i, itemIds[i], staff.tenantId]
                );
            }
        });

        return res.json({ success: true, message: 'Đã cập nhật thứ tự món thành công' });
    } catch (err: any) {
        return res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
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

// Common Option Group Schemas
const optionItemSchema = z.object({
    id: z.string().uuid().optional().nullable().or(z.literal('')),
    name: z.string().trim().min(1, 'Tên tùy chọn không được để trống').max(255),
    price_delta: z.coerce.number().int().min(0, 'Phụ thu không được âm').default(0).optional(),
    priceDelta: z.coerce.number().int().min(0, 'Phụ thu không được âm').default(0).optional(),
    price_adjustment: z.coerce.number().int().min(0).optional(),
    is_default: z.boolean().optional().default(false),
    isDefault: z.boolean().optional().default(false),
    is_available: z.boolean().optional().default(true),
    isAvailable: z.boolean().optional().default(true),
    sort_order: z.coerce.number().int().default(0).optional(),
    sortOrder: z.coerce.number().int().default(0).optional()
});

const optionGroupInputSchema = z.object({
    id: z.string().uuid().optional().nullable().or(z.literal('')),
    name: z.string().trim().min(1, 'Tên dạng biến thể không được để trống').max(100),
    selection_mode: z.enum(['SINGLE', 'MULTIPLE']).optional(),
    selectionMode: z.enum(['SINGLE', 'MULTIPLE']).optional(),
    min_selections: z.coerce.number().int().min(0).max(30).optional(),
    minSelections: z.coerce.number().int().min(0).max(30).optional(),
    max_selections: z.coerce.number().int().min(1).max(30).optional(),
    maxSelections: z.coerce.number().int().min(1).max(30).optional(),
    pricing_mode: z.enum(['FREE', 'ADDITIVE']).optional(),
    pricingMode: z.enum(['FREE', 'ADDITIVE']).optional(),
    sort_order: z.coerce.number().int().default(0).optional(),
    sortOrder: z.coerce.number().int().default(0).optional(),
    options: z.array(optionItemSchema).min(1, 'Mỗi nhóm tùy chọn cần có ít nhất 1 lựa chọn').max(30, 'Tối đa 30 lựa chọn mỗi nhóm')
});

// 13. Create Menu Item (Supports up to 10 option groups, max 30 options per group)
staffRouter.post('/menu/items', requirePermission('menu.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;

        const schema = z.object({
            name: z.string().trim().min(1, 'Tên món không được để trống').max(255),
            category_id: z.string().uuid('Danh mục không hợp lệ'),
            price: z.coerce.number().int().nonnegative('Giá món không hợp lệ'),
            description: z.string().max(2000).optional().nullable(),
            image_url: z.string().max(5000000).optional().nullable().or(z.literal('')),
            is_available: z.boolean().optional().default(true),
            sort_order: z.coerce.number().int().optional(),
            option_groups: z.array(optionGroupInputSchema).max(10, 'Tối đa 10 nhóm tùy chọn').optional(),
            optionGroups: z.array(optionGroupInputSchema).max(10, 'Tối đa 10 nhóm tùy chọn').optional(),
            variant_groups: z.array(optionGroupInputSchema).max(3, 'Một sản phẩm chỉ có tối đa 3 dạng biến thể').optional(),
            variants: z.array(optionItemSchema).max(3, 'Một sản phẩm chỉ có tối đa 3 dạng biến thể').optional()
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ' });
        }

        const { name, category_id, price, description, image_url, is_available } = parsed.data;

        const normalizedGroups = normalizeOptionGroups(parsed.data);

        const createdItem = await withTransaction(async (client) => {
            // Verify category with FOR SHARE so concurrent category delete waits or fails properly
            const catRes = await client.query('SELECT id FROM menu_categories WHERE id = $1 AND tenant_id = $2 FOR SHARE', [category_id, staff.tenantId]);
            if (catRes.rows.length === 0) {
                throw { status: 400, code: 'CATEGORY_NOT_FOUND', message: 'Danh mục không tồn tại hoặc đã bị xóa' };
            }

            // Determine sort_order
            let sortOrder = parsed.data.sort_order;
            if (sortOrder === undefined) {
                const sortRes = await client.query('SELECT COALESCE(MAX(sort_order), -1) + 1 as next_sort FROM menu_items WHERE category_id = $1 AND tenant_id = $2', [category_id, staff.tenantId]);
                sortOrder = parseInt(sortRes.rows[0].next_sort, 10);
            }

            const insertRes = await client.query(`
                INSERT INTO menu_items (tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `, [staff.tenantId, category_id, name, description || null, price, image_url || null, is_available, sortOrder]);

            const item = insertRes.rows[0];

            if (normalizedGroups.length > 0) {
                await syncItemOptions(client, staff.tenantId, item.id, normalizedGroups);
            }

            return await fetchFullMenuItem(staff.tenantId, item.id, client);
        });

        return res.status(201).json({
            item: createdItem,
            message: 'Thêm món mới thành công'
        });
    } catch (err: any) {
        if (err.code === '23503' && (err.constraint === 'menu_items_category_id_fkey' || err.detail?.includes('category_id'))) {
            return res.status(400).json({
                error: 'CATEGORY_NOT_FOUND',
                code: 'CATEGORY_NOT_FOUND',
                message: 'Danh mục không tồn tại hoặc đã bị xóa'
            });
        }
        console.error('Staff create menu item error:', err);
        return res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
    }
});

// 14. Update Menu Item (Supports up to 10 option groups, max 30 options per group)
staffRouter.put('/menu/items/:id', requirePermission('menu.manage'), async (req: Request, res: Response) => {
    try {
        const staff = req.staff!;
        const itemId = req.params.id;

        const schema = z.object({
            name: z.string().trim().min(1, 'Tên món không được để trống').max(255).optional(),
            category_id: z.string().uuid('Danh mục không hợp lệ').optional(),
            price: z.coerce.number().int().nonnegative('Giá món không hợp lệ').optional(),
            description: z.string().max(2000).optional().nullable(),
            image_url: z.string().max(5000000).optional().nullable().or(z.literal('')),
            is_available: z.boolean().optional(),
            sort_order: z.coerce.number().int().optional(),
            option_groups: z.array(optionGroupInputSchema).max(10, 'Tối đa 10 nhóm tùy chọn').optional(),
            optionGroups: z.array(optionGroupInputSchema).max(10, 'Tối đa 10 nhóm tùy chọn').optional(),
            variant_groups: z.array(optionGroupInputSchema).max(3, 'Một sản phẩm chỉ có tối đa 3 dạng biến thể').optional(),
            variants: z.array(optionItemSchema).max(3, 'Một sản phẩm chỉ có tối đa 3 dạng biến thể').optional()
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ' });
        }

        const { name, category_id, price, description, image_url, is_available, sort_order } = parsed.data;
        const hasGroups = parsed.data.option_groups !== undefined || parsed.data.optionGroups !== undefined || parsed.data.variant_groups !== undefined || parsed.data.variants !== undefined;
        const normalizedGroups = normalizeOptionGroups(parsed.data);

        const updatedItem = await withTransaction(async (client) => {
            const curRes = await client.query('SELECT * FROM menu_items WHERE id = $1 AND tenant_id = $2', [itemId, staff.tenantId]);
            if (curRes.rows.length === 0) {
                throw { status: 404, code: 'NOT_FOUND', message: 'Không tìm thấy món ăn' };
            }
            const current = curRes.rows[0];

            let newSortOrder = sort_order;
            if (category_id && category_id !== current.category_id) {
                const catRes = await client.query('SELECT id FROM menu_categories WHERE id = $1 AND tenant_id = $2 FOR SHARE', [category_id, staff.tenantId]);
                if (catRes.rows.length === 0) {
                    throw { status: 400, code: 'CATEGORY_NOT_FOUND', message: 'Danh mục không tồn tại hoặc đã bị xóa' };
                }
                // When moving to new category, put at the end if not explicitly specified
                if (newSortOrder === undefined) {
                    const sortRes = await client.query('SELECT COALESCE(MAX(sort_order), -1) + 1 as next_sort FROM menu_items WHERE category_id = $1 AND tenant_id = $2', [category_id, staff.tenantId]);
                    newSortOrder = parseInt(sortRes.rows[0].next_sort, 10);
                }
            }

            const updateRes = await client.query(`
                UPDATE menu_items
                SET category_id = COALESCE($1::uuid, category_id),
                    name = COALESCE($2::varchar, name),
                    description = CASE WHEN $3::boolean THEN $4::text ELSE description END,
                    price = COALESCE($5::bigint, price),
                    image_url = CASE WHEN $6::boolean THEN $7::text ELSE image_url END,
                    is_available = COALESCE($8::boolean, is_available),
                    sort_order = COALESCE($9::int, sort_order),
                    updated_at = NOW()
                WHERE id = $10::uuid AND tenant_id = $11::uuid
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
                newSortOrder !== undefined ? newSortOrder : null,
                itemId,
                staff.tenantId
            ]);

            if (updateRes.rows.length === 0) {
                throw { status: 404, code: 'NOT_FOUND', message: 'Không tìm thấy món ăn' };
            }

            if (hasGroups) {
                await syncItemOptions(client, staff.tenantId, itemId, normalizedGroups);
            }

            return await fetchFullMenuItem(staff.tenantId, itemId, client);
        });

        return res.json({
            item: updatedItem,
            message: 'Cập nhật món thành công'
        });
    } catch (err: any) {
        if (err.code === '23503' && (err.constraint === 'menu_items_category_id_fkey' || err.detail?.includes('category_id'))) {
            return res.status(400).json({
                error: 'CATEGORY_NOT_FOUND',
                code: 'CATEGORY_NOT_FOUND',
                message: 'Danh mục không tồn tại hoặc đã bị xóa'
            });
        }
        console.error('Staff update menu item error:', err);
        return res.status(err.status || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
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

        // Generate cryptographically secure public_qr_id (>=128-bit entropy)
        const cleanNum = table_number.toLowerCase().replace(/[^a-z0-9]/g, '') || 't';
        const slug = (staff.tenantSlug || 'shop').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
        const prefix = `qr_${slug}_${cleanNum}`.slice(0, 30);
        const publicQrId = generatePublicQrId(prefix);

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

        // Check if this table has historical sessions, bills or settlements (DATA-01)
        const historyCheck = await query('SELECT id FROM table_sessions WHERE table_id = $1 LIMIT 1', [tableId]);
        if (historyCheck.rows.length > 0) {
            return res.status(400).json({
                error: 'TABLE_HAS_HISTORY',
                message: `Bàn "${checkRes.rows[0].table_number}" đã có lịch sử phục vụ và hóa đơn. Để bảo toàn doanh thu và sổ sách kế toán, không thể xóa vĩnh viễn bàn này. Vui lòng chuyển trạng thái sang "Ngừng phục vụ" (Tắt hoạt động).`
            });
        }

        await query('DELETE FROM tables WHERE id = $1 AND tenant_id = $2', [tableId, staff.tenantId]);

        return res.json({ success: true, message: `Đã xóa bàn "${checkRes.rows[0].table_number}" thành công` });
    } catch (err: any) {
        return res.status(err.status || 500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});
