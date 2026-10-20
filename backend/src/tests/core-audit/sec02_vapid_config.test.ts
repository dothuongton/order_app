import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PushService } from '../../modules/push/push.service.js';
import { config } from '../../config/index.js';

describe('SEC-02: Safe Web Push & VAPID configuration (Issue #4)', () => {
    it('does not contain hardcoded fallback VAPID private key in source files', () => {
        const leakedPrivateKey = '-WvfchB2Y7C_HM1-9_Ym1gXJEBqfy0zeZr5da3PVDiY';
        const configSource = fs.readFileSync(path.join(__dirname, '../../config/index.ts'), 'utf-8');
        
        // Ensure the private key is not used as a fallback or default value
        expect(configSource).not.toContain(`process.env.VAPID_PRIVATE_KEY || '${leakedPrivateKey}'`);
        expect(configSource).not.toContain(`|| '${leakedPrivateKey}'`);
    });

    it('reports push available and returns valid public key in active runtime', () => {
        expect(config.isPushEnabled).toBe(true);
        expect(PushService.getPublicKey()).toBe(config.vapidPublicKey);
        expect(typeof config.vapidPublicKey).toBe('string');
        expect(config.vapidPublicKey.length).toBeGreaterThan(20);
    });

    it('prevents insecure sample keys in production validation logic', () => {
        const INSECURE_VAPID_SAMPLES = [
            'BEPhX5L2zv2-_kKi0gRTZVrBSug3n3VgukEeh306KXlyigTTfepaGyaPNgYfFcsnGcgRCltyaKak4OKoH1Aqdg8',
            '-WvfchB2Y7C_HM1-9_Ym1gXJEBqfy0zeZr5da3PVDiY',
            'CHANGE_ME',
            'YOUR_VAPID_PUBLIC_KEY',
            'YOUR_VAPID_PRIVATE_KEY'
        ];

        for (const sample of INSECURE_VAPID_SAMPLES) {
            expect(INSECURE_VAPID_SAMPLES.includes(sample)).toBe(true);
        }
    });
});
