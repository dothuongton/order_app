import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../app.js';
import { query } from '../db/pool.js';
import { seed } from '../db/seed.js';

describe('Staff Auth Profile Update API (PATCH /api/v1/auth/profile)', () => {
    let server: http.Server;
    let baseUrl: string;
    let staffToken: string;
    let staffUserId: string;

    beforeAll(async () => {
        await seed(true);

        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        // Login as manager
        const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@phoco.vn',
                password: '123456'
            })
        });

        expect(res.status).toBe(200);
        const data: any = await res.json();
        staffToken = data.token;
        staffUserId = data.user.id;
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('rejects unauthenticated requests with 401', async () => {
        const res = await fetch(`${baseUrl}/api/v1/auth/profile`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName: 'New Name' })
        });

        expect(res.status).toBe(401);
    });

    it('rejects empty or whitespace-only fullName with 400', async () => {
        const res = await fetch(`${baseUrl}/api/v1/auth/profile`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${staffToken}`
            },
            body: JSON.stringify({ fullName: '   ' })
        });

        expect(res.status).toBe(400);
        const json: any = await res.json();
        expect(json.error).toBe('INVALID_INPUT');
    });

    it('successfully updates staff fullName and phone', async () => {
        const res = await fetch(`${baseUrl}/api/v1/auth/profile`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${staffToken}`
            },
            body: JSON.stringify({
                fullName: 'Nguyễn Văn Quản Lý Mới',
                phone: '0988776655'
            })
        });

        expect(res.status).toBe(200);
        const json: any = await res.json();
        expect(json.success).toBe(true);
        expect(json.user.fullName).toBe('Nguyễn Văn Quản Lý Mới');
        expect(json.user.phone).toBe('0988776655');

        // Verify in DB directly
        const dbRes = await query('SELECT full_name, phone FROM users WHERE id = $1', [staffUserId]);
        expect(dbRes.rows[0].full_name).toBe('Nguyễn Văn Quản Lý Mới');
        expect(dbRes.rows[0].phone).toBe('0988776655');

        // Verify /api/v1/auth/me returns updated name
        const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
            headers: {
                'Authorization': `Bearer ${staffToken}`
            }
        });

        expect(meRes.status).toBe(200);
        const meJson: any = await meRes.json();
        expect(meJson.user.fullName).toBe('Nguyễn Văn Quản Lý Mới');
    });

    describe('PATCH /api/v1/auth/change-password', () => {
        it('rejects unauthenticated requests with 401', async () => {
            const res = await fetch(`${baseUrl}/api/v1/auth/change-password`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: '123', newPassword: '456' })
            });

            expect(res.status).toBe(401);
        });

        it('rejects wrong current password with 400', async () => {
            const res = await fetch(`${baseUrl}/api/v1/auth/change-password`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({ currentPassword: 'wrong-password', newPassword: 'newPassword123' })
            });

            expect(res.status).toBe(400);
            const json: any = await res.json();
            expect(json.error).toBe('WRONG_PASSWORD');
        });

        it('rejects new password under 6 characters with 400', async () => {
            const res = await fetch(`${baseUrl}/api/v1/auth/change-password`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({ currentPassword: '123456', newPassword: '123' })
            });

            expect(res.status).toBe(400);
            const json: any = await res.json();
            expect(json.error).toBe('INVALID_INPUT');
        });

        it('successfully changes password and allows login with new password', async () => {
            const res = await fetch(`${baseUrl}/api/v1/auth/change-password`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({ currentPassword: '123456', newPassword: 'newPassword123' })
            });

            expect(res.status).toBe(200);
            const json: any = await res.json();
            expect(json.success).toBe(true);

            // Old password should now fail
            const oldLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'admin@phoco.vn',
                    password: '123456'
                })
            });
            expect(oldLoginRes.status).toBe(401);

            // New password should succeed
            const newLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'admin@phoco.vn',
                    password: 'newPassword123'
                })
            });
            expect(newLoginRes.status).toBe(200);
        });
    });
});
