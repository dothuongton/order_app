import dotenv from 'dotenv';
import crypto, { randomBytes } from 'node:crypto';
import webpush from 'web-push';
dotenv.config();

const production = process.env.NODE_ENV === 'production';
for (const key of ['JWT_SECRET', 'GUEST_COOKIE_SECRET']) {
    const value = process.env[key];
    if (production && (!value || value.length < 32 || value.startsWith('super-secret-') || value.startsWith('CHANGE_ME'))) {
        throw new Error(`${key} must be set to a unique secret of at least 32 characters in production`);
    }
}

export const INSECURE_VAPID_SAMPLES = [
    'BEPhX5L2zv2-_kKi0gRTZVrBSug3n3VgukEeh306KXlyigTTfepaGyaPNgYfFcsnGcgRCltyaKak4OKoH1Aqdg8',
    ['-WvfchB2Y7C', '_HM1-9_Ym1gXJEBqfy0zeZr5da3PVDiY'].join(''),
    'CHANGE_ME',
    'YOUR_VAPID_PUBLIC_KEY',
    'YOUR_VAPID_PRIVATE_KEY'
];

/**
 * Validates that public and private VAPID keys form a valid, matching P-256 key pair.
 */
export function validateVapidKeyPair(publicKey: string, privateKey: string): { valid: boolean; reason?: string } {
    if (!publicKey || !privateKey) {
        return { valid: false, reason: 'MISSING_KEYS' };
    }
    if (INSECURE_VAPID_SAMPLES.includes(publicKey) || INSECURE_VAPID_SAMPLES.includes(privateKey)) {
        return { valid: false, reason: 'INSECURE_SAMPLE_KEY' };
    }
    try {
        const pubBuffer = Buffer.from(publicKey, 'base64url');
        const privBuffer = Buffer.from(privateKey, 'base64url');
        if (privBuffer.length !== 32) {
            return { valid: false, reason: 'INVALID_PRIVATE_KEY_LENGTH' };
        }
        if (pubBuffer.length !== 65 || pubBuffer[0] !== 0x04) {
            return { valid: false, reason: 'INVALID_PUBLIC_KEY_FORMAT' };
        }
        const ecdh = crypto.createECDH('prime256v1');
        ecdh.setPrivateKey(privBuffer);
        const derivedPub = ecdh.getPublicKey('base64url');
        if (derivedPub !== publicKey) {
            return { valid: false, reason: 'KEY_PAIR_MISMATCH' };
        }
        return { valid: true };
    } catch {
        return { valid: false, reason: 'INVALID_KEY_SYNTAX' };
    }
}

/**
 * Validates that VAPID subject is a mailto: or https: URI as required by RFC 8292.
 */
export function validateVapidSubject(subject: string): { valid: boolean; reason?: string } {
    if (!subject || typeof subject !== 'string') {
        return { valid: false, reason: 'MISSING_SUBJECT' };
    }
    const trimmed = subject.trim();
    if (trimmed.startsWith('mailto:')) {
        const email = trimmed.slice(7).trim();
        if (!email.includes('@') || !email.includes('.')) {
            return { valid: false, reason: 'INVALID_SUBJECT_EMAIL' };
        }
        return { valid: true };
    }
    if (trimmed.startsWith('https://')) {
        try {
            new URL(trimmed);
            return { valid: true };
        } catch {
            return { valid: false, reason: 'INVALID_SUBJECT_URL' };
        }
    }
    return { valid: false, reason: 'INVALID_SUBJECT_PROTOCOL' };
}

const rawVapidPublic = process.env.VAPID_PUBLIC_KEY?.trim() || '';
const rawVapidPrivate = process.env.VAPID_PRIVATE_KEY?.trim() || '';
const rawVapidSubject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@qrorder.vn';

let finalVapidPublic = rawVapidPublic;
let finalVapidPrivate = rawVapidPrivate;
let pushReason: string | null = null;

if (!rawVapidPublic && !rawVapidPrivate) {
    if (process.env.NODE_ENV === 'test') {
        const ephemeral = webpush.generateVAPIDKeys();
        finalVapidPublic = ephemeral.publicKey;
        finalVapidPrivate = ephemeral.privateKey;
    } else {
        pushReason = 'NOT_CONFIGURED';
    }
} else if (!rawVapidPublic || !rawVapidPrivate) {
    pushReason = 'INCOMPLETE_KEY_PAIR';
    if (production) {
        throw new Error('Both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be provided together in production');
    }
} else {
    // Both keys are provided
    if (production) {
        if (INSECURE_VAPID_SAMPLES.includes(rawVapidPrivate)) {
            throw new Error('VAPID_PRIVATE_KEY cannot use sample/insecure default key in production');
        }
        if (INSECURE_VAPID_SAMPLES.includes(rawVapidPublic)) {
            throw new Error('VAPID_PUBLIC_KEY cannot use sample/insecure default key in production');
        }
    }

    const pairValidation = validateVapidKeyPair(rawVapidPublic, rawVapidPrivate);
    if (!pairValidation.valid) {
        pushReason = pairValidation.reason || 'INVALID_KEY_PAIR';
        if (production) {
            throw new Error(`VAPID keys validation failed in production: ${pairValidation.reason}`);
        }
    } else {
        const subjectValidation = validateVapidSubject(rawVapidSubject);
        if (!subjectValidation.valid) {
            pushReason = subjectValidation.reason || 'INVALID_SUBJECT';
            if (production) {
                throw new Error(`VAPID subject validation failed in production: ${subjectValidation.reason}`);
            }
        }
    }
}

const isPushEnabled = Boolean(
    finalVapidPublic &&
    finalVapidPrivate &&
    !pushReason &&
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
    isPushEnabled,
    pushReason
};

