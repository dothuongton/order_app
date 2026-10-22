import { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config/index.js';

export const allowedOrigins = new Set([
    new URL(config.frontendUrl).origin,
    ...(process.env.RENDER_EXTERNAL_URL ? [new URL(process.env.RENDER_EXTERNAL_URL).origin] : []),
    ...config.corsOrigins.split(',').map(s => s.trim()).filter(Boolean),
    ...(config.nodeEnv === 'production' ? [] : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'])
]);

export function isAllowedOrigin(origin?: string): boolean {
    if (!origin) return true;
    if (allowedOrigins.has(origin)) return true;
    if (config.nodeEnv !== 'production') {
        if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return true;
        }
    }
    return false;
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
        'Content-Security-Policy-Report-Only',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none';"
    );
    if (config.nodeEnv === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
}

// CORS alone does not prevent state-changing requests authenticated by cookies.
export function protectOrigin(req: Request, res: Response, next: NextFunction) {
    if (!isAllowedOrigin(req.get('origin')) ||
        (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('sec-fetch-site') === 'cross-site' && !req.get('origin'))) {
        return res.status(403).json({ error: 'ORIGIN_DENIED', message: 'Nguồn truy cập không được phép' });
    }
    next();
}

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau.' }
});
export const guestWriteLimiter = rateLimit({
    windowMs: 60 * 1000, limit: 30,
    skip: req => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    keyGenerator: (req) => {
        const token = (req.headers['x-guest-token'] as string) || req.cookies?.guest_token;
        if (token) return `guest_${token}`;
        return req.ip || 'unknown';
    },
    validate: { keyGeneratorIpFallback: false },
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau.' }
});

export const staffMutationLimiter = rateLimit({
    windowMs: 60 * 1000, limit: 120,
    skip: req => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    keyGenerator: (req) => {
        const staff = (req as any).staff;
        if (staff?.id) return `staff_${staff.tenantId || 'common'}_${staff.id}`;
        if (staff?.tenantId) return `tenant_${staff.tenantId}`;
        return req.ip || 'unknown';
    },
    validate: { keyGeneratorIpFallback: false },
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Thao tác quá nhanh. Vui lòng thử lại sau.' }
});

export const adminMutationLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    skip: req => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    keyGenerator: (req) => {
        const superAdmin = (req as any).superAdmin;
        if (superAdmin?.id) return `admin_${superAdmin.id}`;
        return req.ip || 'unknown';
    },
    validate: { keyGeneratorIpFallback: false },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Thao tác quản trị quá nhanh. Vui lòng thử lại sau.' }
});
