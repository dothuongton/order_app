import crypto from 'crypto';

export function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRandomToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
}

export function generatePayloadFingerprint(payload: any): string {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Generates an opaque, cryptographically secure public QR identifier (CSPRNG).
 * Uses 16 random bytes (128 bits of entropy) to ensure public table URLs are unguessable.
 * Max length is guaranteed <= 64 characters (matching tables.public_qr_id VARCHAR(64)).
 *
 * @param prefix Optional prefix (e.g. 'qr' or 'qr_phoco_1'). Sanitized to alphanumeric and underscore, max 30 chars.
 * @returns Unguessable QR ID string, e.g. 'qr_a1b2c3d4e5f60718293a4b5c6d7e8f90' (length 35)
 */
export function generatePublicQrId(prefix: string = 'qr'): string {
    const randomHex = crypto.randomBytes(16).toString('hex');
    const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
    return cleanPrefix ? `${cleanPrefix}_${randomHex}` : `qr_${randomHex}`;
}
