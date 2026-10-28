import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { revokeStaffToken } from '../../utils/staff-token.js';
import jwt from 'jsonwebtoken';
import { query } from '../../db/pool.js';
import { config } from '../../config/index.js';
import { authenticateStaff } from '../../middleware/auth.js';
import { invalidateStaffAuth } from '../../utils/auth-cache.js';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password || email.length > 254 || Buffer.byteLength(password) > 72) {
            return res.status(400).json({
                error: 'BAD_REQUEST',
                message: 'Vui lòng nhập email và mật khẩu'
            });
        }

        const userRes = await query(`
            SELECT id, email, password_hash, full_name, phone, is_platform_admin
            FROM users
            WHERE email = LOWER($1)
        `, [email.trim()]);

        if (userRes.rows.length === 0) {
            return res.status(401).json({
                error: 'INVALID_CREDENTIALS',
                message: 'Email hoặc mật khẩu không chính xác'
            });
        }

        const user = userRes.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({
                error: 'INVALID_CREDENTIALS',
                message: 'Email hoặc mật khẩu không chính xác'
            });
        }

        // Fetch memberships
        const memRes = await query(`
            SELECT m.tenant_id, m.role, m.permissions, t.name as tenant_name, t.slug as tenant_slug,
                   t.logo_url as tenant_logo_url, t.cover_url as tenant_cover_url,
                   t.description as tenant_description, t.phone as tenant_phone,
                   t.address as tenant_address, t.opening_hours as tenant_opening_hours,
                   t.active_theme_config as tenant_theme_config
            FROM memberships m
            JOIN tenants t ON t.id = m.tenant_id
            WHERE m.user_id = $1 AND m.is_active = true
        `, [user.id]);

        if (memRes.rows.length === 0 && !user.is_platform_admin) {
            return res.status(403).json({
                error: 'NO_MEMBERSHIP',
                message: 'Tài khoản chưa được gán vào quán nào'
            });
        }

        const defaultTenant = memRes.rows[0] || null;
        const token = jwt.sign(
            {
                userId: user.id,
                tenantId: defaultTenant?.tenant_id || null,
                role: defaultTenant?.role || (user.is_platform_admin ? 'super_admin' : 'staff'),
                isPlatformAdmin: user.is_platform_admin
            },
            config.jwtSecret,
            { expiresIn: '7d', jwtid: randomUUID(), algorithm: 'HS256' }
        );

        res.cookie('staff_token', token, {
            httpOnly: true,
            secure: config.nodeEnv === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        if (user.is_platform_admin) {
            res.cookie('admin_token', token, {
                httpOnly: true,
                secure: config.nodeEnv === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });
        }

        return res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                phone: user.phone,
                isPlatformAdmin: user.is_platform_admin
            },
            currentTenant: defaultTenant ? {
                id: defaultTenant.tenant_id,
                name: defaultTenant.tenant_name,
                slug: defaultTenant.tenant_slug,
                role: defaultTenant.role,
                permissions: defaultTenant.permissions,
                logoUrl: defaultTenant.tenant_logo_url,
                coverUrl: defaultTenant.tenant_cover_url,
                description: defaultTenant.tenant_description,
                phone: defaultTenant.tenant_phone,
                address: defaultTenant.tenant_address,
                openingHours: defaultTenant.tenant_opening_hours,
                activeThemeConfig: defaultTenant.tenant_theme_config || null
            } : null,
            memberships: memRes.rows
        });
    } catch (err: any) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
});

authRouter.get('/me', authenticateStaff, async (req: Request, res: Response) => {
    return res.json({
        user: req.staff
    });
});

authRouter.patch('/profile', authenticateStaff, async (req: Request, res: Response) => {
    try {
        const userId = req.staff?.id;
        if (!userId) {
            return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Chưa đăng nhập' });
        }
        const { fullName, phone } = req.body || {};
        if (typeof fullName !== 'string' || !fullName.trim()) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: 'Tên nhân viên không được để trống' });
        }
        const trimmedName = fullName.trim();
        if (trimmedName.length > 255) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: 'Tên nhân viên tối đa 255 ký tự' });
        }
        const trimmedPhone = typeof phone === 'string' ? phone.trim() : null;

        const result = await query(
            `UPDATE users 
             SET full_name = $1, 
                 phone = COALESCE($2, phone), 
                 updated_at = NOW() 
             WHERE id = $3 
             RETURNING id, email, full_name, phone, is_platform_admin`,
            [trimmedName, trimmedPhone, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Không tìm thấy tài khoản' });
        }

        const updated = result.rows[0];
        invalidateStaffAuth();
        return res.json({
            success: true,
            user: {
                id: updated.id,
                email: updated.email,
                fullName: updated.full_name,
                phone: updated.phone,
                isPlatformAdmin: updated.is_platform_admin
            }
        });
    } catch (err: any) {
        console.error('Update profile error:', err);
        return res.status(500).json({ error: 'SERVER_ERROR', message: 'Lỗi máy chủ khi cập nhật thông tin' });
    }
});

authRouter.patch('/change-password', authenticateStaff, async (req: Request, res: Response) => {
    try {
        const userId = req.staff?.id;
        if (!userId) {
            return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Chưa đăng nhập' });
        }
        const { currentPassword, newPassword } = req.body || {};
        if (typeof currentPassword !== 'string' || !currentPassword) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: 'Vui lòng nhập mật khẩu hiện tại' });
        }
        if (typeof newPassword !== 'string' || newPassword.length < 6) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: 'Mật khẩu mới phải có tối thiểu 6 ký tự' });
        }
        if (Buffer.byteLength(newPassword) > 72) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: 'Mật khẩu mới quá dài (tối đa 72 bytes)' });
        }

        const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' });
        }

        const isMatch = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: 'WRONG_PASSWORD', message: 'Mật khẩu hiện tại không chính xác' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
        invalidateStaffAuth();

        return res.json({ success: true, message: 'Đổi mật khẩu thành công' });
    } catch (err: any) {
        console.error('Change password error:', err);
        return res.status(500).json({ error: 'SERVER_ERROR', message: 'Lỗi máy chủ khi đổi mật khẩu' });
    }
});

authRouter.post('/logout', async (req: Request, res: Response) => {
    try {
        const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
        const tokens = new Set([bearer, req.cookies?.staff_token, req.cookies?.admin_token].filter((token): token is string => typeof token === 'string' && !!token));
        await Promise.all([...tokens].map(revokeStaffToken));
        res.clearCookie('staff_token');
        res.clearCookie('admin_token');
        return res.json({ success: true, message: 'Đã đăng xuất' });
    } catch {
        return res.status(500).json({ error: 'SERVER_ERROR', message: 'Không thể đăng xuất; vui lòng thử lại' });
    }
});
