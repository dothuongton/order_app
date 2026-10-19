import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { query } from '../db/pool.js';
import { hashToken } from '../utils/crypto.js';

export interface StaffUser {
    id: string;
    email: string;
    fullName: string;
    tenantId: string;
    tenantName?: string;
    tenantSlug?: string;
    role: string;
    permissions: string[];
    isPlatformAdmin?: boolean;
}

export interface SuperAdminUser {
    id: string;
    email: string;
    fullName: string;
    isPlatformAdmin: boolean;
}

export interface GuestContext {
    guestSessionId: string;
    tenantId: string;
    tableId: string;
    sessionId: string;
    tableNumber: string;
}

declare global {
    namespace Express {
        interface Request {
            staff?: StaffUser;
            superAdmin?: SuperAdminUser;
            guest?: GuestContext;
            requestId?: string;
        }
    }
}

export async function authenticateStaff(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;
        const cookieToken = req.cookies?.staff_token;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : cookieToken;

        if (!token) {
            return res.status(401).json({
                error: 'UNAUTHORIZED',
                message: 'Yêu cầu đăng nhập tài khoản nhân viên'
            });
        }

        const decoded = jwt.verify(token, config.jwtSecret) as any;
        const userId = decoded.userId;
        const tenantId = req.headers['x-tenant-id'] as string || decoded.tenantId;

        // Fetch user and active membership for tenant
        const resMem = await query(`
            SELECT 
                u.id, u.email, u.full_name, u.is_platform_admin,
                m.tenant_id, m.role, m.permissions, m.is_active,
                t.name as tenant_name, t.slug as tenant_slug
            FROM users u
            JOIN memberships m ON m.user_id = u.id
            LEFT JOIN tenants t ON t.id = m.tenant_id
            WHERE u.id = $1 AND m.tenant_id = $2 AND m.is_active = true
        `, [userId, tenantId]);

        if (resMem.rows.length === 0) {
            return res.status(403).json({
                error: 'FORBIDDEN',
                message: 'Tài khoản không có quyền truy cập quán này hoặc đã bị khóa'
            });
        }

        const row = resMem.rows[0];
        req.staff = {
            id: row.id,
            email: row.email,
            fullName: row.full_name,
            tenantId: row.tenant_id,
            tenantName: row.tenant_name,
            tenantSlug: row.tenant_slug,
            role: row.role,
            permissions: row.permissions || []
        };

        next();
    } catch (err) {
        return res.status(401).json({
            error: 'INVALID_TOKEN',
            message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn'
        });
    }
}

export function requirePermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.staff) {
            return res.status(401).json({ error: 'UNAUTHORIZED' });
        }
        // Owner, manager, cashier, and waiter are all active staff roles
        if (req.staff.role === 'owner' || req.staff.role === 'manager' || req.staff.role === 'cashier' || req.staff.role === 'waiter') {
            return next();
        }
        if (!req.staff.permissions.includes(permission)) {
            return res.status(403).json({
                error: 'PERMISSION_DENIED',
                message: `Bạn không có quyền thực hiện thao tác này (${permission})`
            });
        }
        next();
    };
}

export async function authenticateGuest(req: Request, res: Response, next: NextFunction) {
    try {
        const token = req.cookies?.guest_token || (req.headers['x-guest-token'] as string);

        if (!token) {
            return res.status(401).json({
                error: 'ACCESS_REVOKED',
                message: 'Vui lòng quét lại mã QR tại bàn để tham gia'
            });
        }

        const tokenHash = hashToken(token);

        // Query guest session and verify session is OPEN
        const resGuest = await query(`
            SELECT 
                gs.id as guest_session_id,
                gs.tenant_id,
                gs.table_id,
                gs.session_id,
                gs.expires_at,
                gs.revoked_at,
                ts.status as session_status,
                t.table_number
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

        if (row.revoked_at || new Date(row.expires_at) < new Date()) {
            return res.status(401).json({
                error: 'ACCESS_REVOKED',
                message: 'Phiên truy cập đã hết hạn. Vui lòng quét lại mã QR tại bàn'
            });
        }

        if (row.session_status !== 'OPEN') {
            return res.status(403).json({
                error: 'SESSION_CLOSED',
                message: 'Phiên bàn đã kết thúc. Cảm ơn quý khách!'
            });
        }

        req.guest = {
            guestSessionId: row.guest_session_id,
            tenantId: row.tenant_id,
            tableId: row.table_id,
            sessionId: row.session_id,
            tableNumber: row.table_number
        };

        next();
    } catch (err) {
        return res.status(500).json({
            error: 'SERVER_ERROR',
            message: 'Không thể xác thực quyền khách'
        });
    }
}

/**
 * Super Admin Authentication Middleware (requires is_platform_admin = true)
 */
export async function authenticateSuperAdmin(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;
        const cookieToken = req.cookies?.admin_token;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : cookieToken;

        if (!token) {
            return res.status(401).json({
                error: 'UNAUTHORIZED',
                message: 'Yêu cầu đăng nhập tài khoản quản trị hệ thống (Super Admin)'
            });
        }

        const decoded = jwt.verify(token, config.jwtSecret) as any;
        const userId = decoded.userId;

        const resUser = await query(`
            SELECT id, email, full_name, is_platform_admin
            FROM users
            WHERE id = $1
        `, [userId]);

        if (resUser.rows.length === 0 || !resUser.rows[0].is_platform_admin) {
            return res.status(403).json({
                error: 'FORBIDDEN',
                message: 'Chỉ Super Admin hệ thống mới có quyền truy cập khu vực này'
            });
        }

        const row = resUser.rows[0];
        req.superAdmin = {
            id: row.id,
            email: row.email,
            fullName: row.full_name,
            isPlatformAdmin: true
        };

        next();
    } catch (err) {
        return res.status(401).json({
            error: 'INVALID_TOKEN',
            message: 'Phiên đăng nhập Super Admin không hợp lệ hoặc đã hết hạn'
        });
    }
}

/**
 * Require Shop Owner or Manager role for CMS modifications
 */
export function requireShopAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.staff) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    if (['owner', 'manager'].includes(req.staff.role) || req.staff.isPlatformAdmin) {
        return next();
    }
    return res.status(403).json({
        error: 'PERMISSION_DENIED',
        message: 'Chỉ Chủ quán (Owner) hoặc Quản lý (Manager) mới có quyền truy cập CMS này'
    });
}

