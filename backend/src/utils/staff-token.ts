import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { query } from '../db/pool.js';
import { hashToken } from './crypto.js';

export function verifyStaffTokenSignature(token: string): jwt.JwtPayload {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.userId !== 'string') throw new Error('Invalid token');
    return decoded;
}

export async function verifyStaffToken(token: string): Promise<jwt.JwtPayload> {
    const decoded = verifyStaffTokenSignature(token);
    const revoked = await query('SELECT 1 FROM revoked_staff_tokens WHERE token_hash = $1 AND expires_at > NOW()', [hashToken(token)]);
    if (revoked.rows.length) throw new Error('Token revoked');
    return decoded;
}

export async function revokeStaffToken(token: string) {
    try {
        const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
        if (typeof decoded === 'string' || !decoded.exp) return;
        await query(`INSERT INTO revoked_staff_tokens (token_hash, expires_at) VALUES ($1, $2)
            ON CONFLICT (token_hash) DO NOTHING`, [hashToken(token), new Date(decoded.exp * 1000)]);
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) return;
        throw error;
    }
}
