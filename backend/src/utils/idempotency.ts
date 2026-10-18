import { PoolClient } from 'pg';
import { generatePayloadFingerprint } from './crypto.js';

export class IdempotencyError extends Error {
    statusCode: number;
    code: string;
    constructor(message: string, code: string = 'IDEMPOTENCY_CONFLICT', statusCode: number = 409) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
    }
}

export async function checkIdempotency(
    client: PoolClient,
    tenantId: string | null,
    action: string,
    scope: string,
    key: string,
    payload: any
): Promise<{ handled: boolean; result?: any }> {
    const fingerprint = generatePayloadFingerprint(payload);

    const res = await client.query(`
        SELECT payload_fingerprint, result_json 
        FROM idempotency_records 
        WHERE tenant_id IS NOT DISTINCT FROM $1 
          AND action = $2 
          AND scope = $3 
          AND key = $4
    `, [tenantId, action, scope, key]);

    if (res.rows.length > 0) {
        const record = res.rows[0];
        if (record.payload_fingerprint !== fingerprint) {
            throw new IdempotencyError(
                'Idempotency key đã được sử dụng với nội dung khác',
                'IDEMPOTENCY_KEY_REUSED',
                409
            );
        }
        return { handled: true, result: record.result_json };
    }

    return { handled: false };
}

export async function recordIdempotency(
    client: PoolClient,
    tenantId: string | null,
    action: string,
    scope: string,
    key: string,
    payload: any,
    result: any
): Promise<void> {
    const fingerprint = generatePayloadFingerprint(payload);

    await client.query(`
        INSERT INTO idempotency_records (tenant_id, action, scope, key, payload_fingerprint, result_json)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id, action, scope, key) DO UPDATE 
        SET result_json = EXCLUDED.result_json
    `, [tenantId, action, scope, key, fingerprint, JSON.stringify(result)]);
}
