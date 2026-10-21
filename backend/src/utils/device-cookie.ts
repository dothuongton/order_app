import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { config } from '../config/index.js';

export function getDeviceCookieName(req: Request): string {
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https' || config.nodeEnv === 'production';
    return isSecure ? '__Host-order-device' : 'order_device';
}

export function getOrSetDeviceCookie(req: Request, res?: Response): { deviceToken: string; deviceHash: string } {
    let token = req.cookies?.['__Host-order-device'] || req.cookies?.['order_device'] || (req.headers['x-device-cookie'] as string);

    if (!token || typeof token !== 'string' || token.length < 32) {
        token = crypto.randomBytes(32).toString('hex');
        if (res) {
            const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https' || config.nodeEnv === 'production';
            const cookieName = isSecure ? '__Host-order-device' : 'order_device';
            res.cookie(cookieName, token, {
                httpOnly: true,
                secure: isSecure,
                sameSite: 'lax',
                path: '/',
                maxAge: 365 * 24 * 60 * 60 * 1000 // 1 year
            });
        }
    }

    const deviceHash = crypto.createHash('sha256').update(token).digest('hex');
    return { deviceToken: token, deviceHash };
}

export function hashDeviceToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}
