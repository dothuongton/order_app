import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
dotenv.config();

const production = process.env.NODE_ENV === 'production';
for (const key of ['JWT_SECRET', 'GUEST_COOKIE_SECRET']) {
    const value = process.env[key];
    if (production && (!value || value.length < 32 || value.startsWith('super-secret-') || value.startsWith('CHANGE_ME'))) {
        throw new Error(`${key} must be set to a unique secret of at least 32 characters in production`);
    }
}

export const config = {
    port: parseInt(process.env.PORT || '4000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL || 'postgres://admin:@localhost:5432/qr_order_db',
    jwtSecret: process.env.JWT_SECRET || randomBytes(48).toString('hex'),
    frontendUrl: process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173',
    corsOrigins: process.env.CORS_ORIGINS || '',
    guestCookieSecret: process.env.GUEST_COOKIE_SECRET || randomBytes(48).toString('hex'),
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || 'BEPhX5L2zv2-_kKi0gRTZVrBSug3n3VgukEeh306KXlyigTTfepaGyaPNgYfFcsnGcgRCltyaKak4OKoH1Aqdg8',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '-WvfchB2Y7C_HM1-9_Ym1gXJEBqfy0zeZr5da3PVDiY',
    vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@qrorder.vn'
};

