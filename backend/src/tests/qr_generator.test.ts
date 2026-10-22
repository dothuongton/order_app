import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { app } from '../app.js';
import { query, pool } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { generatePublicQrId } from '../utils/crypto.js';

let server: http.Server;
let base: string;
let managerToken: string;
const tenantId = '11111111-1111-1111-1111-111111111111';

describe('QR Generator & Public Table Security (Issue #41)', () => {
    beforeAll(async () => {
        await seed();
        server = http.createServer(app);
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => resolve());
        });
        const addr = server.address() as any;
        base = `http://127.0.0.1:${addr.port}/api/v1`;

        // Login as manager to obtain staff token
        const loginRes = await fetch(`${base}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@phoco.vn', password: '123456' })
        });
        const loginData = await loginRes.json();
        managerToken = loginData.token;
    });

    afterAll(async () => {
        if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
        await pool.end();
    });

    describe('1. CSPRNG Entropy and Format Constraints', () => {
        it('generates an opaque QR ID with 128-bit random hex entropy by default', () => {
            const qrId = generatePublicQrId();
            expect(qrId).toMatch(/^qr_[0-9a-f]{32}$/);
            expect(qrId.length).toBe(35);
            expect(qrId.length).toBeLessThanOrEqual(64); // tables.public_qr_id VARCHAR(64)
        });

        it('guarantees 0 collisions across 10,000 generated QR IDs', () => {
            const iterations = 10000;
            const set = new Set<string>();
            for (let i = 0; i < iterations; i++) {
                set.add(generatePublicQrId());
            }
            expect(set.size).toBe(iterations);
        });

        it('sanitizes custom prefixes and ensures total length never exceeds 64 characters', () => {
            // Normal prefix
            const withPrefix = generatePublicQrId('phoco_b1');
            expect(withPrefix).toMatch(/^phoco_b1_[0-9a-f]{32}$/);
            expect(withPrefix.length).toBeLessThanOrEqual(64);

            // Very long prefix (> 30 chars) must be truncated cleanly
            const superLongPrefix = 'a'.repeat(100);
            const truncated = generatePublicQrId(superLongPrefix);
            expect(truncated.length).toBe(30 + 1 + 32); // 63 chars <= 64
            expect(truncated.length).toBeLessThanOrEqual(64);

            // Special characters must be stripped
            const dirtyPrefix = '../../<script>alert(1);</script>!@#$%^&*()_+';
            const sanitized = generatePublicQrId(dirtyPrefix);
            expect(sanitized).toMatch(/^[a-zA-Z0-9_-]+_[0-9a-f]{32}$/);
            expect(sanitized.length).toBeLessThanOrEqual(64);

            // Empty or invalid prefix falls back to 'qr'
            const emptyPrefix = generatePublicQrId('!@#$%^');
            expect(emptyPrefix).toMatch(/^qr_[0-9a-f]{32}$/);
        });
    });

    describe('2. Staff Table Creation Integration', () => {
        it('creates a new table via Staff API with cryptographically secure QR ID', async () => {
            const uniqueTableNumber = `Test-${Date.now().toString().slice(-4)}`;
            const res = await fetch(`${base}/staff/tables`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${managerToken}`
                },
                body: JSON.stringify({
                    table_number: uniqueTableNumber,
                    capacity: 6
                })
            });

            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.table).toBeDefined();
            expect(data.table.table_number).toBe(uniqueTableNumber);

            // Public QR ID must be CSPRNG generated (>= 128-bit hex suffix)
            const publicQrId = data.table.public_qr_id;
            expect(publicQrId).toBeDefined();
            expect(publicQrId.length).toBeLessThanOrEqual(64);
            expect(publicQrId).toMatch(/[0-9a-f]{32}$/); // Ends with 32-char hex (128 bits)

            // Verify in DB
            const dbCheck = await query(`SELECT id, public_qr_id FROM tables WHERE id = $1`, [data.table.id]);
            expect(dbCheck.rows.length).toBe(1);
            expect(dbCheck.rows[0].public_qr_id).toBe(publicQrId);
        });
    });

    describe('3. Legacy QR Code Compatibility', () => {
        it('preserves existing legacy QR codes without breaking existing printed materials', async () => {
            // Seed table A01 has legacy public_qr_id 'qr-phoco-a01'
            const legacyRes = await fetch(`${base}/public/tables/qr-phoco-a01/menu`);
            expect(legacyRes.status).toBe(200);
            const legacyData = await legacyRes.json();
            expect(legacyData.table).toBeDefined();
            expect(legacyData.table.tableNumber).toBe('A01');
            expect(legacyData.tenant).toBeDefined();
        });
    });
});
