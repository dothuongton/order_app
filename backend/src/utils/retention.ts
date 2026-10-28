import { query } from '../db/pool.js';

/**
 * Data retention cleanup job (Mục 12 & 13 Datbantaicho)
 * Dọn dẹp dữ liệu tạm thời hết hạn để giải phóng bộ nhớ và giữ dung lượng DB gọn gàng.
 */
export async function runDataRetentionCleanup(): Promise<{
    cleanedIdempotency: number;
    cleanedGuestSessions: number;
    cleanedStaffTokens: number;
    cleanedRevokedTokens: number;
}> {
    try {
        // 1. Dọn idempotency_records cũ hơn 48 giờ
        const idempRes = await query(`
            DELETE FROM idempotency_records
            WHERE created_at < NOW() - INTERVAL '48 hours'
        `);

        // 2. Dọn guest_sessions đã hết hạn hoặc đã thu hồi hơn 24 giờ
        const guestRes = await query(`
            DELETE FROM guest_sessions
            WHERE expires_at < NOW() OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '24 hours')
        `);

        // 3. Dọn revoked_staff_tokens đã hết hạn
        const staffTokensRes = await query(`
            DELETE FROM revoked_staff_tokens
            WHERE expires_at < NOW()
        `);

        // 4. Dọn revoked_tokens (admin/user) đã hết hạn nếu bảng tồn tại
        let cleanedRevokedTokens = 0;
        try {
            const revokedTokensRes = await query(`
                DELETE FROM revoked_tokens
                WHERE expires_at < NOW()
            `);
            cleanedRevokedTokens = revokedTokensRes.rowCount || 0;
        } catch {
            // Ignore if optional revoked_tokens table is not yet provisioned
        }

        const summary = {
            cleanedIdempotency: idempRes.rowCount || 0,
            cleanedGuestSessions: guestRes.rowCount || 0,
            cleanedStaffTokens: staffTokensRes.rowCount || 0,
            cleanedRevokedTokens
        };

        return summary;
    } catch (err: any) {
        console.error('❌ Data retention cleanup error:', err.message);
        return {
            cleanedIdempotency: 0,
            cleanedGuestSessions: 0,
            cleanedStaffTokens: 0,
            cleanedRevokedTokens: 0
        };
    }
}
