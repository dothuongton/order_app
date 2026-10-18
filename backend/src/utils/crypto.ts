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
