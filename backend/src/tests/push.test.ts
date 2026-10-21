import { describe, it, expect, beforeAll } from 'vitest';
import { query } from '../db/pool.js';
import { PushService } from '../modules/push/push.service.js';
import { config } from '../config/index.js';
import webpush from 'web-push';

describe('Web Push Notification System', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    let userId: string;

    beforeAll(async () => {
        const userRes = await query(`SELECT id FROM users WHERE email = 'admin@phoco.vn'`);
        userId = userRes.rows[0].id;
    });

    it('returns configured VAPID public key and availability', () => {
        const avail = PushService.getAvailability();
        expect(avail.available).toBe(true);
        expect(avail.enabled).toBe(true);
        expect(avail.publicKey).toBe(config.vapidPublicKey);

        const key = PushService.getPublicKey();
        expect(key).toBe(config.vapidPublicKey);
        expect(key.length).toBeGreaterThan(20);
    });

    it('subscribes and stores device subscription correctly', async () => {
        const testSub = {
            endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-staff-1',
            keys: {
                p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0AgtGoKE',
                auth: 'tBHItJI5svbpez7KI4CCXg'
            },
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)'
        };

        const res = await PushService.subscribe(tenantId, userId, testSub);
        expect(res.success).toBe(true);

        const status = await PushService.getStatus(tenantId, userId);
        expect(status.isSubscribed).toBe(true);
        expect(status.deviceCount).toBeGreaterThanOrEqual(1);
    });

    it('requires current device endpoint for test push (no silent arbitrary fallback)', async () => {
        await expect(PushService.sendTest(tenantId, userId, undefined as any)).rejects.toMatchObject({
            code: 'CURRENT_ENDPOINT_REQUIRED'
        });
        await expect(PushService.sendTest(tenantId, userId, '')).rejects.toMatchObject({
            code: 'CURRENT_ENDPOINT_REQUIRED'
        });
    });

    it('rejects test push for an unregistered endpoint', async () => {
        await expect(
            PushService.sendTest(tenantId, userId, 'https://fcm.googleapis.com/fcm/send/unregistered-endpoint-999')
        ).rejects.toMatchObject({
            code: 'DEVICE_NOT_REGISTERED'
        });
    });

    it('rejects invalid or non-https push endpoints', async () => {
        await expect(PushService.subscribe(tenantId, userId, {
            endpoint: 'ftp://insecure.endpoint',
            keys: { p256dh: '123', auth: '456' }
        })).rejects.toMatchObject({ code: 'INSECURE_ENDPOINT' });
    });

    it('unsubscribes device cleanly', async () => {
        const endpoint = 'https://fcm.googleapis.com/fcm/send/test-endpoint-staff-1';
        const res = await PushService.unsubscribe(tenantId, userId, endpoint);
        expect(res.success).toBe(true);

        const checkRes = await query(`SELECT id FROM staff_push_subscriptions WHERE endpoint = $1`, [endpoint]);
        expect(checkRes.rows.length).toBe(0);
    });
});
