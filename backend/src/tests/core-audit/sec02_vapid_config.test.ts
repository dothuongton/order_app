import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { PushService } from '../../modules/push/push.service.js';
import { config, validateVapidKeyPair, validateVapidSubject, INSECURE_VAPID_SAMPLES } from '../../config/index.js';
import webpush from 'web-push';

describe('SEC-02: Safe Web Push & VAPID configuration (Issue #4, #21)', () => {
    it('does not contain hardcoded fallback VAPID private key in source files', () => {
        const leakedPrivateKey = '-WvfchB2Y7C_HM1-9_Ym1gXJEBqfy0zeZr5da3PVDiY';
        const configSource = fs.readFileSync(path.join(__dirname, '../../config/index.ts'), 'utf-8');
        
        // Ensure the private key is not used as a fallback or default value
        expect(configSource).not.toContain(`process.env.VAPID_PRIVATE_KEY || '${leakedPrivateKey}'`);
        expect(configSource).not.toContain(`|| '${leakedPrivateKey}'`);
    });

    it('reports push available and returns valid public key in active runtime', () => {
        const availability = PushService.getAvailability();
        expect(availability.available).toBe(true);
        expect(availability.enabled).toBe(true);
        expect(availability.publicKey).toBe(config.vapidPublicKey);
        expect(PushService.getPublicKey()).toBe(config.vapidPublicKey);
        expect(typeof config.vapidPublicKey).toBe('string');
        expect(config.vapidPublicKey.length).toBeGreaterThan(20);
    });

    it('validates matching and mismatched VAPID key pairs cryptographically', () => {
        const pair1 = webpush.generateVAPIDKeys();
        const pair2 = webpush.generateVAPIDKeys();

        // Matching pair passes
        expect(validateVapidKeyPair(pair1.publicKey, pair1.privateKey)).toEqual({ valid: true });

        // Mismatched pair fails
        const mismatchResult = validateVapidKeyPair(pair1.publicKey, pair2.privateKey);
        expect(mismatchResult.valid).toBe(false);
        expect(mismatchResult.reason).toBe('KEY_PAIR_MISMATCH');

        // Corrupted/invalid syntax fails
        expect(validateVapidKeyPair('invalid-pub', pair1.privateKey).valid).toBe(false);
        expect(validateVapidKeyPair(pair1.publicKey, 'invalid-priv').valid).toBe(false);
        expect(validateVapidKeyPair('', '').valid).toBe(false);
    });

    it('validates VAPID subject protocol and email syntax', () => {
        expect(validateVapidSubject('mailto:owner@restaurant.vn')).toEqual({ valid: true });
        expect(validateVapidSubject('https://restaurant.vn/contact')).toEqual({ valid: true });

        expect(validateVapidSubject('mailto:invalid-no-at-sign').valid).toBe(false);
        expect(validateVapidSubject('http://insecure-http.vn').valid).toBe(false);
        expect(validateVapidSubject('ftp://ftp.vn').valid).toBe(false);
        expect(validateVapidSubject('').valid).toBe(false);
    });

    it('prevents insecure sample keys in production validation logic', () => {
        for (const sample of INSECURE_VAPID_SAMPLES) {
            expect(INSECURE_VAPID_SAMPLES.includes(sample)).toBe(true);
            expect(validateVapidKeyPair(sample, sample).valid).toBe(false);
        }
    });

    it('handles production subprocess startup safely when VAPID keys are unconfigured', () => {
        const script = `
            import { config } from './src/config/index.js';
            import { PushService } from './src/modules/push/push.service.js';
            const avail = PushService.getAvailability();
            console.log(JSON.stringify({
                isPushEnabled: config.isPushEnabled,
                pushReason: config.pushReason,
                available: avail.available,
                publicKey: avail.publicKey
            }));
        `;

        const stdout = execFileSync(process.execPath, ['--import', 'tsx', '-e', script], {
            cwd: path.resolve(__dirname, '../../..'),
            env: {
                ...process.env,
                NODE_ENV: 'production',
                JWT_SECRET: 'a'.repeat(48),
                GUEST_COOKIE_SECRET: 'b'.repeat(48),
                VAPID_PUBLIC_KEY: '',
                VAPID_PRIVATE_KEY: ''
            },
            encoding: 'utf-8'
        });

        const parsed = JSON.parse(stdout.trim());
        expect(parsed.isPushEnabled).toBe(false);
        expect(parsed.pushReason).toBe('NOT_CONFIGURED');
        expect(parsed.available).toBe(false);
        expect(parsed.publicKey).toBe('');
    });

    it('rejects mismatched VAPID keys in production subprocess with descriptive error', () => {
        const pair1 = webpush.generateVAPIDKeys();
        const pair2 = webpush.generateVAPIDKeys();

        const script = `import { config } from './src/config/index.js';`;

        expect(() => {
            execFileSync(process.execPath, ['--import', 'tsx', '-e', script], {
                cwd: path.resolve(__dirname, '../../..'),
                env: {
                    ...process.env,
                    NODE_ENV: 'production',
                    JWT_SECRET: 'a'.repeat(48),
                    GUEST_COOKIE_SECRET: 'b'.repeat(48),
                    VAPID_PUBLIC_KEY: pair1.publicKey,
                    VAPID_PRIVATE_KEY: pair2.privateKey
                },
                encoding: 'utf-8',
                stdio: 'pipe'
            });
        }).toThrow();
    });
});
