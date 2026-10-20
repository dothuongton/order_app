import { describe, it, expect } from 'vitest';
import { app } from '../../app.js';
import { query } from '../../db/pool.js';
import http from 'http';

describe('SEC-22: CSP Report-Only, Tenant Upload Quota & Rate Limit Hardening (Issue #22)', () => {
    let server: http.Server;
    let baseUrl: string;

    it('sets Content-Security-Policy-Report-Only header on requests', async () => {
        server = http.createServer(app);
        await new Promise<void>((resolve) => {
            server.listen(0, () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        try {
            const res = await fetch(`${baseUrl}/health/liveness`);
            const csp = res.headers.get('content-security-policy-report-only');
            expect(csp).toBeTruthy();
            expect(csp).toContain("default-src 'self'");
            expect(csp).toContain("frame-ancestors 'none'");
        } finally {
            await new Promise((r) => server.close(r));
        }
    });

    it('enforces 50MB tenant upload storage quota with 413 STORAGE_QUOTA_EXCEEDED', async () => {
        const tenant = '11111111-1111-1111-1111-111111111111';
        
        // Temporarily insert a row simulating 50MB of uploaded images
        const dummyRes = await query(`
            INSERT INTO uploaded_images (tenant_id, filename, mime_type, size_bytes, data_base64)
            VALUES ($1, 'large.jpg', 'image/jpeg', 52428800, 'dummydata')
            RETURNING id
        `, [tenant]);
        const dummyId = dummyRes.rows[0].id;

        try {
            server = http.createServer(app);
            await new Promise<void>((resolve) => {
                server.listen(0, () => {
                    const addr = server.address() as any;
                    baseUrl = `http://127.0.0.1:${addr.port}`;
                    resolve();
                });
            });

            // Login as manager
            const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'admin@phoco.vn', password: '123456' })
            });
            const { token } = await loginRes.json() as any;

            // Attempt to upload another image
            const uploadRes = await fetch(`${baseUrl}/api/v1/cms/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
                    filename: 'test.jpg'
                })
            });

            expect(uploadRes.status).toBe(413);
            const body = await uploadRes.json() as any;
            expect(body.error).toBe('STORAGE_QUOTA_EXCEEDED');
        } finally {
            await query(`DELETE FROM uploaded_images WHERE id = $1`, [dummyId]);
            await new Promise((r) => server.close(r));
        }
    });
});
