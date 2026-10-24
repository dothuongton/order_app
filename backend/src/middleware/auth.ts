import { Request, Response, NextFunction } from 'express';
import { verifyStaffToken } from '../utils/staff-token.js';
import { config } from '../config/index.js';
import { query } from '../db/pool.js';
import { hashToken } from '../utils/crypto.js';
import { getOrSetDeviceCookie } from '../utils/device-cookie.js';

export interface StaffUser {
    id: string;
    email: string;
    fullName: string;
    tenantId: string;
    tenantName?: string;
    tenantSlug?: string;
    tenantStatus?: string;
    logoUrl?: string | null;
    coverUrl?: string | null;
    description?: string | null;
    phone?: string | null;
    address?: string | null;
    openingHours?: string | null;
    activeThemeConfig?: any;
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
    claimedDeviceHash?: string | null;
    claimVersion?: number;
    deviceHash?: string;
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

        const decoded = await verifyStaffToken(token);
        const userId = decoded.userId;
        const tenantId = req.headers['x-tenant-id'] as string || decoded.tenantId;

        // Fetch user and active membership for tenant
        const resMem = await query(`
            SELECT 
                u.id, u.email, u.full_name, u.is_platform_admin,
                m.tenant_id, m.role, m.permissions, m.is_active,
                t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status,
                t.logo_url as tenant_logo_url, t.cover_url as tenant_cover_url,
                t.description as tenant_description, t.phone as tenant_phone,
                t.address as tenant_address, t.opening_hours as tenant_opening_hours,
                t.active_theme_config as tenant_theme_config
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
        const tenantStatus = (row.tenant_status || 'active').toLowerCase();

        // Enforce tenant lifecycle status for staff (Issue #6 / Issue #19)
        if (tenantStatus === 'archived') {
            const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
            const pathToCheck = (req.originalUrl || req.path).split('?')[0];

            if (isMutation) {
                const isExistingSessionResolution =
                    // 1. Session payment, close, and bulk serving/acceptance (Issue #6, #19)
                    /\/sessions\/[^/]+\/(confirm-payment-and-close|close-without-charge|serve-all|accept-all)$/.test(pathToCheck) ||
                    // 2. Existing order item handling
                    /\/order-items\/[^/]+\/(accept|serve|cancel)$/.test(pathToCheck) ||
                    // 3. Service request handling
                    /\/service-requests\/[^/]+\/(accept|complete|cancel)$/.test(pathToCheck) ||
                    // 4. Marking table ready after session closed
                    /\/tables\/[^/]+\/mark-ready$/.test(pathToCheck) ||
                    // 5. Auth logout
                    pathToCheck.endsWith('/auth/logout');

                if (!isExistingSessionResolution) {
                    return res.status(403).json({
                        error: 'SHOP_ARCHIVED',
                        message: 'Quán ăn này đã được đưa vào lưu trữ và ngừng hoạt động hoàn toàn'
                    });
                }
            } else {
                // Allow reading dashboard snapshot, tables, session orders and bill summary for settling lingering obligations
                const isReadOnlyRecovery =
                    /\/sessions\/[^/]+\/(bill-summary|orders)$/.test(pathToCheck) ||
                    pathToCheck.endsWith('/dashboard/snapshot') ||
                    pathToCheck.endsWith('/tables') ||
                    /\/tables\/[^/]+$/.test(pathToCheck);

                if (!isReadOnlyRecovery) {
                    return res.status(403).json({
                        error: 'SHOP_ARCHIVED',
                        message: 'Quán ăn này đã được đưa vào lưu trữ và ngừng hoạt động hoàn toàn'
                    });
                }
            }
        }

        if (tenantStatus === 'suspended') {
            const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
            if (isMutation) {
                const pathToCheck = (req.originalUrl || req.path).split('?')[0];
                const isExistingSessionResolution =
                    // 1. Session payment, close, and bulk serving (Issue #26 / R4)
                    /\/sessions\/[^/]+\/(confirm-payment-and-close|close-without-charge|serve-all|accept-all)$/.test(pathToCheck) ||
                    // 2. Existing order item handling
                    /\/order-items\/[^/]+\/(accept|serve|cancel)$/.test(pathToCheck) ||
                    // 3. Service request handling
                    /\/service-requests\/[^/]+\/(accept|complete|cancel)$/.test(pathToCheck) ||
                    // 4. Marking table ready after session closed
                    /\/tables\/[^/]+\/mark-ready$/.test(pathToCheck) ||
                    // 5. Auth logout
                    pathToCheck.endsWith('/auth/logout');

                if (!isExistingSessionResolution) {
                    return res.status(403).json({
                        error: 'SHOP_SUSPENDED',
                        message: 'Quán đang tạm ngưng hoạt động. Thao tác tạo mới/sửa đổi bị tạm dừng (chỉ cho phép thu tiền và xử lý các bàn hiện hữu).'
                    });
                }
            }
        }

        req.staff = {
            id: row.id,
            email: row.email,
            fullName: row.full_name,
            tenantId: row.tenant_id,
            tenantName: row.tenant_name,
            tenantSlug: row.tenant_slug,
            tenantStatus: tenantStatus,
            logoUrl: row.tenant_logo_url || null,
            coverUrl: row.tenant_cover_url || null,
            description: row.tenant_description || null,
            phone: row.tenant_phone || null,
            address: row.tenant_address || null,
            openingHours: row.tenant_opening_hours || null,
            activeThemeConfig: row.tenant_theme_config || null,
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
        // Only owner and manager have implicit full access; other roles use explicit grants.
        if (req.staff.role === 'owner' || req.staff.role === 'manager') {
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
        const token = (req.headers['x-guest-token'] as string) || req.cookies?.guest_token;

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
                ts.claimed_device_hash,
                ts.claim_version,
                t.table_number, t.is_enabled, te.status as tenant_status
            FROM guest_sessions gs
            JOIN table_sessions ts ON ts.id = gs.session_id
            JOIN tables t ON t.id = gs.table_id
            JOIN tenants te ON te.id = gs.tenant_id
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

        if (row.tenant_status !== 'active' || !row.is_enabled) {
            return res.status(403).json({ error: 'SHOP_SUSPENDED', message: 'Quán hoặc bàn đang ngừng phục vụ' });
        }

        const { deviceHash } = getOrSetDeviceCookie(req, res);

        if (config.orderingMode === 'approved_single_device') {
            if (row.claimed_device_hash && row.claimed_device_hash !== deviceHash) {
                return res.status(403).json({
                    error: 'DEVICE_NOT_CLAIMED',
                    code: 'DEVICE_NOT_CLAIMED',
                    message: 'Thiết bị này không có quyền thao tác trên bàn này. Chỉ thiết bị giữ quyền mới có thể thao tác.'
                });
            }
        }

        req.guest = {
            guestSessionId: row.guest_session_id,
            tenantId: row.tenant_id,
            tableId: row.table_id,
            sessionId: row.session_id,
            tableNumber: row.table_number,
            claimedDeviceHash: row.claimed_device_hash,
            claimVersion: row.claim_version,
            deviceHash
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

        const decoded = await verifyStaffToken(token);
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

