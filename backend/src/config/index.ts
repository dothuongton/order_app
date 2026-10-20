import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';
dotenv.config();

const production = process.env.NODE_ENV === 'production';
for (const key of ['JWT_SECRET', 'GUEST_COOKIE_SECRET']) {
    const value = process.env[key];
    if (production && (!value || value.length < 32 || value.startsWith('super-secret-') || value.startsWith('CHANGE_ME'))) {
        throw new Error(`${key} must be set to a unique secret of at least 32 characters in production`);
    }
}

const rawVapidPublic = process.env.VAPID_PUBLIC_KEY?.trim() || '';
const rawVapidPrivate = process.env.VAPID_PRIVATE_KEY?.trim() || '';
const rawVapidSubject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@qrorder.vn';

const INSECURE_VAPID_SAMPLES = [
    'BEPhX5L2zv2-_kKi0gRTZVrBSug3n3VgukEeh306KXlyigTTfepaGyaPNgYfFcsnGcgRCltyaKak4OKoH1Aqdg8',
    ['-WvfchB2Y7C', '_HM1-9_Ym1gXJEBqfy0zeZr5da3PVDiY'].join(''),
    'CHANGE_ME',
    'YOUR_VAPID_PUBLIC_KEY',
    'YOUR_VAPID_PRIVATE_KEY'
];

if (production) {
    if (rawVapidPrivate && INSECURE_VAPID_SAMPLES.includes(rawVapidPrivate)) {
        throw new Error('VAPID_PRIVATE_KEY cannot use sample/insecure default key in production');
    }
    if (rawVapidPublic && INSECURE_VAPID_SAMPLES.includes(rawVapidPublic)) {
        throw new Error('VAPID_PUBLIC_KEY cannot use sample/insecure default key in production');
    }
    if ((rawVapidPublic && !rawVapidPrivate) || (!rawVapidPublic && rawVapidPrivate)) {
        throw new Error('Both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be provided together in production');
    }
}

// In test environment only: if keys are not provided, generate ephemeral keys in memory
let finalVapidPublic = rawVapidPublic;
let finalVapidPrivate = rawVapidPrivate;

if (process.env.NODE_ENV === 'test' && (!finalVapidPublic || !finalVapidPrivate)) {
    const ephemeral = webpush.generateVAPIDKeys();
    finalVapidPublic = ephemeral.publicKey;
    finalVapidPrivate = ephemeral.privateKey;
}

const isPushEnabled = Boolean(
    finalVapidPublic && 
    finalVapidPrivate && 
    !INSECURE_VAPID_SAMPLES.includes(finalVapidPrivate)
);

export const config = {
    port: parseInt(process.env.PORT || '4000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL || 'postgres://admin:@localhost:5432/qr_order_db',
    jwtSecret: process.env.JWT_SECRET || randomBytes(48).toString('hex'),
    frontendUrl: process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173',
    corsOrigins: process.env.CORS_ORIGINS || '',
    guestCookieSecret: process.env.GUEST_COOKIE_SECRET || randomBytes(48).toString('hex'),
    vapidPublicKey: finalVapidPublic,
    vapidPrivateKey: finalVapidPrivate,
    vapidSubject: rawVapidSubject,
    isPushEnabled
};

