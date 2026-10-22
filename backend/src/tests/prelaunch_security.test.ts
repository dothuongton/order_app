import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express, { Request, Response } from 'express';
import { createServer, Server } from 'http';
import { adminMutationLimiter } from '../middleware/security.js';
import { recordAuditLog, isSensitiveAuditKey, redactAuditDetails } from '../utils/audit.js';
import { query, withTransaction } from '../db/pool.js';
import { app } from '../app.js';
import fs from 'fs';
import path from 'path';

describe('Prelaunch Security & Core Contracts (#36, #83)', () => {
    let testServer: Server;
    let testBaseUrl: string;

    let appServer: Server;
    let appBaseUrl: string;

    beforeAll(async () => {
        // Setup isolated limiter test server
        const limiterApp = express();
        limiterApp.use(express.json());

        limiterApp.use((req: any, _res: Response, next) => {
            const adminId = req.headers['x-test-admin-id'];
            if (adminId) {
                req.superAdmin = { id: adminId, email: `${adminId}@test.vn`, isPlatformAdmin: true };
            }
            next();
        });

        limiterApp.use(adminMutationLimiter);

        limiterApp.get('/test-admin', (_req: Request, res: Response) => {
            res.status(200).json({ ok: true, method: 'GET' });
        });

        limiterApp.post('/test-admin', (_req: Request, res: Response) => {
            res.status(200).json({ ok: true, method: 'POST' });
        });

        testServer = createServer(limiterApp);
        await new Promise<void>((resolve) => {
            testServer.listen(0, () => {
                const addr = testServer.address() as any;
                testBaseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        // Setup main app server for malformed JSON test
        appServer = createServer(app);
        await new Promise<void>((resolve) => {
            appServer.listen(0, () => {
                const addr = appServer.address() as any;
                appBaseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => testServer.close(() => resolve()));
        await new Promise<void>((resolve) => appServer.close(() => resolve()));
    });

    describe('1. adminMutationLimiter Middleware', () => {
        it('does not throttle or consume quota on GET requests', async () => {
            for (let i = 0; i < 70; i++) {
                const res = await fetch(`${testBaseUrl}/test-admin`, {
                    method: 'GET',
                    headers: { 'x-test-admin-id': 'admin-read-tester' }
                });
                expect(res.status).toBe(200);
            }
        });

        it('isolates rate limit by admin user id and returns 429 when limit (60) is exceeded', async () => {
            const adminActorA = `admin-actor-a-${Date.now()}`;
            const adminActorB = `admin-actor-b-${Date.now()}`;

            // Make 60 mutations for actor A
            for (let i = 0; i < 60; i++) {
                const res = await fetch(`${testBaseUrl}/test-admin`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-test-admin-id': adminActorA
                    },
                    body: JSON.stringify({ test: true })
                });
                expect(res.status).toBe(200);
            }

            // 61st mutation for actor A should be blocked with 429
            const resBlocked = await fetch(`${testBaseUrl}/test-admin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-test-admin-id': adminActorA
                },
                body: JSON.stringify({ test: true })
            });
            expect(resBlocked.status).toBe(429);
            const blockedData: any = await resBlocked.json();
            expect(blockedData.error).toBe('RATE_LIMITED');
            expect(resBlocked.headers.get('retry-after')).toBeDefined();

            // Actor B should NOT be blocked
            const resActorB = await fetch(`${testBaseUrl}/test-admin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-test-admin-id': adminActorB
                },
                body: JSON.stringify({ test: true })
            });
            expect(resActorB.status).toBe(200);
        });
    });

    describe('2. recordAuditLog Helper (#83)', () => {
        const testTenantId = '11111111-1111-1111-1111-111111111111';

        afterEach(async () => {
            await query("DELETE FROM audit_logs WHERE action LIKE 'TEST_%'");
        });

        it('redacts sensitive fields in details automatically', () => {
            expect(isSensitiveAuditKey('password')).toBe(true);
            expect(isSensitiveAuditKey('admin_token')).toBe(true);
            expect(isSensitiveAuditKey('apiKey')).toBe(true);
            expect(isSensitiveAuditKey('clientSecret')).toBe(true);
            expect(isSensitiveAuditKey('name')).toBe(false);
            expect(isSensitiveAuditKey('table_number')).toBe(false);

            const redacted = redactAuditDetails({
                shopName: 'Quán Phố Cổ',
                adminPassword: 'super-secret-password',
                authPayload: {
                    token: 'jwt-token-12345',
                    cookie: 'session=abc',
                    nested: {
                        secretKey: 'key_xyz'
                    }
                },
                safeMeta: {
                    tableCount: 10
                }
            });

            expect(redacted.shopName).toBe('Quán Phố Cổ');
            expect(redacted.adminPassword).toBe('[REDACTED]');
            expect(redacted.authPayload.token).toBe('[REDACTED]');
            expect(redacted.authPayload.cookie).toBe('[REDACTED]');
            expect(redacted.authPayload.nested.secretKey).toBe('[REDACTED]');
            expect(redacted.safeMeta.tableCount).toBe(10);
        });

        it('records audit log in database with redacted details', async () => {
            const action = `TEST_AUDIT_${Date.now()}`;
            await recordAuditLog({
                tenantId: testTenantId,
                userId: null,
                action,
                resourceType: 'shop',
                resourceId: testTenantId,
                details: {
                    field: 'status',
                    password: 'raw_pass_should_be_hidden',
                    oldStatus: 'active',
                    newStatus: 'inactive'
                }
            });

            const res = await query('SELECT * FROM audit_logs WHERE action = $1', [action]);
            expect(res.rows.length).toBe(1);
            const row = res.rows[0];
            expect(row.tenant_id).toBe(testTenantId);
            expect(row.action).toBe(action);
            expect(row.details.field).toBe('status');
            expect(row.details.oldStatus).toBe('active');
            expect(row.details.newStatus).toBe('inactive');
            expect(row.details.password).toBe('[REDACTED]');
        });

        it('rolls back audit log cleanly when outer transaction fails', async () => {
            const rollbackAction = `TEST_ROLLBACK_${Date.now()}`;

            await expect(
                withTransaction(async (client) => {
                    await recordAuditLog(
                        {
                            tenantId: testTenantId,
                            userId: null,
                            action: rollbackAction,
                            resourceType: 'transaction_test',
                            resourceId: 'test_123',
                            details: { attempt: 1 }
                        },
                        client
                    );

                    // Force transaction error
                    throw new Error('Simulated transaction failure');
                })
            ).rejects.toThrow('Simulated transaction failure');

            // Audit log must NOT exist due to transaction rollback
            const check = await query('SELECT * FROM audit_logs WHERE action = $1', [rollbackAction]);
            expect(check.rows.length).toBe(0);
        });
    });

    describe('3. Malformed JSON & Error Leakage Prevention (#36)', () => {
        it('returns generic 400 BAD_REQUEST on malformed JSON without leaking stack or raw body', async () => {
            const res = await fetch(`${appBaseUrl}/api/v1/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{"email": "test@example.com", "password":'
            });

            expect(res.status).toBe(400);
            const body: any = await res.json();
            expect(body.error).toBe('BAD_REQUEST');
            expect(body.message).toBe('Dữ liệu định dạng không hợp lệ');
            // Must not contain stack trace or raw broken body
            const bodyStr = JSON.stringify(body);
            expect(bodyStr).not.toContain('SyntaxError');
            expect(bodyStr).not.toContain('at JSON.parse');
        });
    });

    describe('4. AdminLogin UI Safe Defaults (#36)', () => {
        it('ensures AdminLogin.tsx has no pre-filled credentials or sample account note', () => {
            const adminLoginPath = path.resolve(__dirname, '../../../frontend/src/pages/admin/AdminLogin.tsx');
            const fileContent = fs.readFileSync(adminLoginPath, 'utf-8');

            // Check no prefilled state
            expect(fileContent).toContain("const [email, setEmail] = useState('');");
            expect(fileContent).toContain("const [password, setPassword] = useState('');");

            // Check no demo account note or leaked passwords
            expect(fileContent).not.toContain('superadmin@qrorder.vn');
            expect(fileContent).not.toContain('admin123');
            expect(fileContent).not.toContain('Tài khoản mẫu:');
        });
    });
});
