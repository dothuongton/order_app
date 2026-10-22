import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';

export interface AuditLogInput {
    tenantId: string;
    userId?: string | null;
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, any> | null;
}

export function isSensitiveAuditKey(key: string): boolean {
    const normalized = key.toLowerCase().replace(/[-_]/g, '');
    return /(?:password|passwd|token|secret|hash|cookie|credential|authorization|privatekey|apikey)/i.test(normalized);
}

export function redactAuditDetails(obj: any): any {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(redactAuditDetails);
    }
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (isSensitiveAuditKey(k)) {
            cleaned[k] = '[REDACTED]';
        } else if (typeof v === 'object' && v !== null) {
            cleaned[k] = redactAuditDetails(v);
        } else {
            cleaned[k] = v;
        }
    }
    return cleaned;
}

/**
 * Record an audit log event.
 * If client is provided, runs inside that transaction (so if transaction rolls back, audit log rolls back cleanly).
 * If client is omitted, runs as an independent query.
 */
export async function recordAuditLog(
    entry: AuditLogInput,
    client?: PoolClient
): Promise<void> {
    const detailsJson = entry.details ? JSON.stringify(redactAuditDetails(entry.details)) : null;
    const sql = `
        INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
        VALUES ($1, $2, $3, $4, $5, $6)
    `;
    const params = [
        entry.tenantId,
        entry.userId || null,
        entry.action,
        entry.resourceType,
        entry.resourceId,
        detailsJson
    ];

    if (client) {
        await client.query(sql, params);
    } else {
        await query(sql, params);
    }
}
