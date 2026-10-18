import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../../db/pool.js';
import { config } from '../../config/index.js';
import { authenticateStaff } from '../../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
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
            SELECT m.tenant_id, m.role, m.permissions, t.name as tenant_name, t.slug as tenant_slug
            FROM memberships m
            JOIN tenants t ON t.id = m.tenant_id
            WHERE m.user_id = $1 AND m.is_active = true
        `, [user.id]);

        if (memRes.rows.length === 0) {
            return res.status(403).json({
                error: 'NO_MEMBERSHIP',
                message: 'Tài khoản chưa được gán vào quán nào'
            });
        }

        const defaultTenant = memRes.rows[0];
        const token = jwt.sign(
            {
                userId: user.id,
                tenantId: defaultTenant.tenant_id,
                role: defaultTenant.role
            },
            config.jwtSecret,
            { expiresIn: '7d' }
        );

        res.cookie('staff_token', token, {
            httpOnly: true,
            secure: config.nodeEnv === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                phone: user.phone
            },
            currentTenant: {
                id: defaultTenant.tenant_id,
                name: defaultTenant.tenant_name,
                slug: defaultTenant.tenant_slug,
                role: defaultTenant.role,
                permissions: defaultTenant.permissions
            },
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

authRouter.post('/logout', (req: Request, res: Response) => {
    res.clearCookie('staff_token');
    return res.json({ success: true, message: 'Đã đăng xuất' });
});
