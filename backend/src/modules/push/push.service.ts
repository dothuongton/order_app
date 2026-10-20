import webpush from 'web-push';
import { assertPushEndpoint } from '../../utils/push-endpoint.js';
import { query } from '../../db/pool.js';
import { config } from '../../config/index.js';

import { deferUntilCommit } from '../../utils/transaction-effects.js';

// Configure Web Push VAPID credentials
if (config.isPushEnabled && config.vapidPublicKey && config.vapidPrivateKey) {
    try {
        webpush.setVapidDetails(
            config.vapidSubject,
            config.vapidPublicKey,
            config.vapidPrivateKey
        );
    } catch (err) {
        console.warn('⚠️ Failed to initialize webpush details:', err);
    }
}

export interface PushSubscriptionInput {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    userAgent?: string;
}

export interface PushNotificationPayload {
    title: string;
    body: string;
    eventId: string;
    type: 'order.created' | 'service_request.created' | 'test';
    tableId?: string;
    tableName?: string;
    sessionId?: string;
    url?: string;
    requiredPermission?: string;
}

export class PushService {
    /**
     * Get public VAPID key to send to client for PushManager.subscribe()
     */
    static getPublicKey(): string {
        return config.vapidPublicKey;
    }

    /**
     * Upsert a staff push subscription linked to authenticated user and tenant
     */
    static async subscribe(tenantId: string, userId: string, input: PushSubscriptionInput) {
        if (!input.endpoint || typeof input.keys?.p256dh !== 'string' || !input.keys.p256dh || input.keys.p256dh.length > 256 || typeof input.keys?.auth !== 'string' || !input.keys.auth || input.keys.auth.length > 128) {
            throw { status: 400, code: 'INVALID_SUBSCRIPTION', message: 'Dữ liệu subscription không hợp lệ' };
        }

        assertPushEndpoint(input.endpoint);

        const res = await query(`
            INSERT INTO staff_push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth, user_agent, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (endpoint) DO UPDATE
            SET tenant_id = EXCLUDED.tenant_id,
                user_id = EXCLUDED.user_id,
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                user_agent = EXCLUDED.user_agent,
                updated_at = NOW()
            WHERE staff_push_subscriptions.user_id = EXCLUDED.user_id
              AND staff_push_subscriptions.tenant_id = EXCLUDED.tenant_id
            RETURNING id, endpoint, created_at
        `, [tenantId, userId, input.endpoint, input.keys.p256dh, input.keys.auth, input.userAgent || null]);

        if (!res.rows.length) throw { status: 409, code: 'SUBSCRIPTION_OWNED', message: 'Thiết bị đã được đăng ký bởi tài khoản khác; hãy hủy đăng ký trước' };
        return {
            success: true,
            id: res.rows[0].id,
            message: 'Đăng ký nhận thông báo Web Push thành công'
        };
    }

    /**
     * Unsubscribe an endpoint belonging to current staff
     */
    static async unsubscribe(tenantId: string, userId: string, endpoint: string) {
        if (!endpoint) {
            throw { status: 400, code: 'ENDPOINT_REQUIRED', message: 'Yêu cầu cung cấp endpoint để hủy đăng ký' };
        }

        await query(`
            DELETE FROM staff_push_subscriptions
            WHERE endpoint = $1 AND user_id = $2 AND tenant_id = $3
        `, [endpoint, userId, tenantId]);

        return { success: true, message: 'Đã hủy đăng ký nhận thông báo Web Push' };
    }

    /**
     * Get subscription count and status for current user
     */
    static async getStatus(tenantId: string, userId: string) {
        const res = await query(`
            SELECT COUNT(id) as count, MAX(last_success_at) as last_success
            FROM staff_push_subscriptions
            WHERE tenant_id = $1 AND user_id = $2
        `, [tenantId, userId]);

        return {
            isSubscribed: parseInt(res.rows[0].count, 10) > 0,
            deviceCount: parseInt(res.rows[0].count, 10),
            lastSuccessAt: res.rows[0].last_success
        };
    }

    /**
     * Send Web Push to all active staff subscriptions for a tenant having the required permission
     */
    static async sendToStaff(tenantId: string, payload: PushNotificationPayload) {
        if (deferUntilCommit(() => PushService.sendToStaff(tenantId, payload))) return { sentCount: 0, deferred: true };
        if (!config.isPushEnabled) {
            return { sentCount: 0, disabled: true };
        }
        try {
            // Find subscriptions of active members in this tenant
            let queryStr = `
                SELECT 
                    sps.id, sps.endpoint, sps.p256dh, sps.auth, sps.user_id,
                    m.role, m.permissions
                FROM staff_push_subscriptions sps
                JOIN memberships m ON m.user_id = sps.user_id AND m.tenant_id = sps.tenant_id
                WHERE sps.tenant_id = $1 AND m.is_active = true
            `;
            const params: any[] = [tenantId];

            const subRes = await query(queryStr, params);
            if (subRes.rows.length === 0) {
                return { sentCount: 0 };
            }

            // Filter by permission / role if required
            const validSubs = subRes.rows.filter(row => {
                if (!payload.requiredPermission) return true;
                if (['owner', 'manager'].includes(row.role)) return true;
                return Array.isArray(row.permissions) && row.permissions.includes(payload.requiredPermission);
            });

            if (validSubs.length === 0) {
                return { sentCount: 0 };
            }

            // Prepare notification payload
            const internalUrl = payload.url || '/staff';
            const pushData = JSON.stringify({
                title: payload.title,
                body: payload.body,
                icon: '/icon.svg',
                badge: '/icon.svg',
                tag: payload.eventId || `push-${Date.now()}`,
                data: {
                    eventId: payload.eventId,
                    type: payload.type,
                    tableId: payload.tableId,
                    tableName: payload.tableName,
                    sessionId: payload.sessionId,
                    url: internalUrl,
                    timestamp: Date.now()
                }
            });

            const sendPromises = validSubs.map(async (sub) => {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth
                    }
                };

                try {
                    assertPushEndpoint(sub.endpoint);
                    await webpush.sendNotification(pushSubscription, pushData, {
                        TTL: 3600, // 1 hour time-to-live
                        urgency: 'high'
                    });

                    // Update last success
                    await query(`
                        UPDATE staff_push_subscriptions
                        SET last_success_at = NOW()
                        WHERE id = $1
                    `, [sub.id]).catch(() => {});

                    return { success: true, id: sub.id };
                } catch (err: any) {
                    const statusCode = err.statusCode || err.status;
                    // If subscription has expired or unsubscribed (404 Not Found or 410 Gone), remove it
                    if (statusCode === 404 || statusCode === 410) {
                        await query(`
                            DELETE FROM staff_push_subscriptions
                            WHERE id = $1
                        `, [sub.id]).catch(() => {});
                    }
                    return { success: false, id: sub.id, error: err.message };
                }
            });

            // Fire and resolve all in parallel without blocking callers
            const results = await Promise.allSettled(sendPromises);
            const successfulCount = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;

            return { sentCount: successfulCount, totalTarget: validSubs.length };
        } catch (error) {
            // Log controlled message without exposing secrets
            console.error('[WebPush] Error dispatching push notifications:', (error as any).message || error);
            return { sentCount: 0 };
        }
    }

    /**
     * Send test notification to staff member's device
     */
    static async sendTest(tenantId: string, userId: string, endpoint?: string) {
        if (!config.isPushEnabled) {
            throw { status: 400, code: 'PUSH_NOT_CONFIGURED', message: 'Hệ thống Web Push chưa được cấu hình VAPID keys' };
        }
        let subQuery = `
            SELECT id, endpoint, p256dh, auth
            FROM staff_push_subscriptions
            WHERE tenant_id = $1 AND user_id = $2
        `;
        const params: any[] = [tenantId, userId];

        if (endpoint) {
            subQuery += ` AND endpoint = $3`;
            params.push(endpoint);
        }

        const subRes = await query(subQuery, params);
        if (subRes.rows.length === 0) {
            throw { status: 404, code: 'NO_SUBSCRIPTION', message: 'Chưa tìm thấy thiết bị nào được đăng ký Web Push' };
        }

        const sub = subRes.rows[0];
        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
            }
        };

        const pushData = JSON.stringify({
            title: '🔔 Thử nghiệm thông báo Web Push',
            body: 'Thiết bị của bạn đã được kết nối và sẵn sàng nhận thông báo đơn & hỗ trợ khi khóa màn hình!',
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: `test-${Date.now()}`,
            data: {
                eventId: `test-${Date.now()}`,
                type: 'test',
                url: '/staff',
                timestamp: Date.now()
            }
        });

        assertPushEndpoint(sub.endpoint);
        await webpush.sendNotification(pushSubscription, pushData, {
            TTL: 60,
            urgency: 'high'
        });

        await query(`
            UPDATE staff_push_subscriptions
            SET last_success_at = NOW()
            WHERE id = $1
        `, [sub.id]).catch(() => {});

        return { success: true, message: 'Đã gửi thông báo thử nghiệm thành công tới thiết bị' };
    }
}
