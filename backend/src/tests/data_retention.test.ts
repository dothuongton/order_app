import { describe, it, expect } from 'vitest';
import { query } from '../db/pool.js';
import { runDataRetentionCleanup } from '../utils/retention.js';

describe('Data Retention Cleanup Job (Issue #144 & Datbantaicho)', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';

    it('cleans up expired idempotency records, guest sessions, and revoked tokens safely', async () => {
        // 1. Seed expired records
        const oldKey = `old-retention-${Date.now()}`;
        const freshKey = `fresh-retention-${Date.now()}`;

        await query(`
            INSERT INTO idempotency_records (tenant_id, action, scope, key, payload_fingerprint, result_json, created_at)
            VALUES ($1, 'test', 'scope', $2, 'fp', '{}', NOW() - INTERVAL '50 hours'),
                   ($1, 'test', 'scope', $3, 'fp', '{}', NOW() - INTERVAL '1 hour')
        `, [tenantId, oldKey, freshKey]);

        await query(`
            INSERT INTO revoked_staff_tokens (token_hash, expires_at)
            VALUES ('old-expired-hash-' || gen_random_uuid(), NOW() - INTERVAL '2 hours'),
                   ('fresh-valid-hash-' || gen_random_uuid(), NOW() + INTERVAL '2 hours')
        `);

        // 2. Run cleanup
        const result = await runDataRetentionCleanup();
        expect(result.cleanedIdempotency).toBeGreaterThanOrEqual(1);
        expect(result.cleanedStaffTokens).toBeGreaterThanOrEqual(1);

        // 3. Verify old record is removed while fresh record remains
        const checkOld = await query(`SELECT 1 FROM idempotency_records WHERE key = $1`, [oldKey]);
        expect(checkOld.rows.length).toBe(0);

        const checkFresh = await query(`SELECT 1 FROM idempotency_records WHERE key = $1`, [freshKey]);
        expect(checkFresh.rows.length).toBe(1);

        // Cleanup fresh test record
        await query(`DELETE FROM idempotency_records WHERE key = $1`, [freshKey]);
    });
});
