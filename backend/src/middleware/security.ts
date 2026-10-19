import { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config/index.js';

export const allowedOrigins = new Set([
    new URL(config.frontendUrl).origin,
    ...(process.env.RENDER_EXTERNAL_URL ? [new URL(process.env.RENDER_EXTERNAL_URL).origin] : []),
    ...config.corsOrigins.split(',').map(s => s.trim()).filter(Boolean),
    ...(config.nodeEnv === 'production' ? [] : ['http://localhost:5173', 'http://localhost:3000'])
]);

export function isAllowedOrigin(origin?: string): boolean {
    return !origin || allowedOrigins.has(origin);
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
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
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau.' }
});
