import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../../app.js';
import { query } from '../../db/pool.js';
import { seed } from '../../db/seed.js';

describe('Admin CMS Management API Suite (Issue #16 [CMS-02])', () => {
    let server: http.Server;
    let baseUrl: string;
    let superAdminToken: string;
    let staffToken: string;
    let seedTenantId: string;

    beforeAll(async () => {
        await seed(true);

        // Start server on an ephemeral port
        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        // 1. Super Admin Login
        const superRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'superadmin@qrorder.vn', password: 'admin123' })
        });
        expect(superRes.status).toBe(200);
        const superData: any = await superRes.json();
        superAdminToken = superData.token;

        // 2. Staff (Pho Co) Login for RBAC negative tests
        const staffRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@phoco.vn', password: '123456' })
        });
        expect(staffRes.status).toBe(200);
        const staffData: any = await staffRes.json();
        staffToken = staffData.token;
        seedTenantId = staffData.currentTenant.id;
    });

    afterAll(async () => {
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    // =========================================================================
    // 1. RBAC & AUTHENTICATION
    // =========================================================================
    describe('Authentication & RBAC Enforcement', () => {
        it('denies requests without Authorization header with 401', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/stats`);
            expect(res.status).toBe(401);
            const data: any = await res.json();
            expect(data.error).toBe('UNAUTHORIZED');
        });

        it('denies requests with forged or invalid token with 401', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/stats`, {
                headers: { 'Authorization': 'Bearer invalid.token.value' }
            });
            expect(res.status).toBe(401);
            const data: any = await res.json();
            expect(data.error).toBe('INVALID_TOKEN');
        });

        it('denies non-platform admin staff from accessing super admin endpoints with 403', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/stats`, {
                headers: { 'Authorization': `Bearer ${staffToken}` }
            });
            expect(res.status).toBe(403);
            const data: any = await res.json();
            expect(data.error).toBe('FORBIDDEN');
        });
    });

    // =========================================================================
    // 2. PLATFORM STATS
    // =========================================================================
    describe('GET /api/v1/admin/stats', () => {
        it('returns platform overview metrics', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/stats`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();

            expect(data).toHaveProperty('totalShops');
            expect(data).toHaveProperty('activeShops');
            expect(data).toHaveProperty('suspendedShops');
            expect(data).toHaveProperty('archivedShops');
            expect(data).toHaveProperty('totalRevenue');
            expect(data).toHaveProperty('totalSettlements');
            expect(data).toHaveProperty('totalOrders');
            expect(typeof data.totalShops).toBe('number');
            expect(data.totalShops).toBeGreaterThanOrEqual(1);
        });
    });

    // =========================================================================
    // 3. SHOPS LISTING, SEARCH, FILTER & PAGINATION
    // =========================================================================
    describe('GET /api/v1/admin/shops', () => {
        it('returns paginated shops with metadata and pagination envelope', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops?page=1&limit=10`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();

            expect(Array.isArray(data.shops)).toBe(true);
            expect(data.shops.length).toBeGreaterThanOrEqual(1);
            expect(data.pagination).toBeDefined();
            expect(data.pagination.page).toBe(1);
            expect(data.pagination.limit).toBe(10);
            expect(data.pagination.total).toBeGreaterThanOrEqual(1);
            expect(data.pagination.totalPages).toBeGreaterThanOrEqual(1);

            const firstShop = data.shops[0];
            expect(firstShop).toHaveProperty('id');
            expect(firstShop).toHaveProperty('name');
            expect(firstShop).toHaveProperty('slug');
            expect(firstShop).toHaveProperty('status');
            expect(firstShop).toHaveProperty('tableCount');
            expect(firstShop).toHaveProperty('orderCount');
            expect(firstShop).toHaveProperty('totalRevenue');
        });

        it('filters shops by status', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops?status=active`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();

            expect(Array.isArray(data.shops)).toBe(true);
            data.shops.forEach((shop: any) => {
                expect(shop.status).toBe('active');
            });
        });

        it('filters shops by search keyword matching name or slug', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops?search=pho-co`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();

            expect(data.shops.length).toBeGreaterThanOrEqual(1);
            expect(data.shops.some((s: any) => s.slug.includes('pho-co'))).toBe(true);
        });

        it('safely handles special characters in search without SQL injection', async () => {
            const maliciousSearch = encodeURIComponent("'; DROP TABLE test_injection; --");
            const res = await fetch(`${baseUrl}/api/v1/admin/shops?search=${maliciousSearch}`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(Array.isArray(data.shops)).toBe(true);
        });

        it('rejects invalid query parameters with 400', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops?limit=-5`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(400);
            const data: any = await res.json();
            expect(data.error).toBe('BAD_REQUEST');
        });
    });

    // =========================================================================
    // 4. GET SHOP DETAIL
    // =========================================================================
    describe('GET /api/v1/admin/shops/:id', () => {
        it('rejects malformed non-UUID id with 400 INVALID_ID', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops/invalid-not-uuid`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(400);
            const data: any = await res.json();
            expect(data.error).toBe('INVALID_ID');
        });

        it('returns 404 for non-existent shop UUID', async () => {
            const randomUuid = '00000000-0000-0000-0000-000000000000';
            const res = await fetch(`${baseUrl}/api/v1/admin/shops/${randomUuid}`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(404);
            const data: any = await res.json();
            expect(data.error).toBe('NOT_FOUND');
        });

        it('returns full shop details with metrics for existing shop', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops/${seedTenantId}`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();

            expect(data.shop).toBeDefined();
            expect(data.shop.id).toBe(seedTenantId);
            expect(data.shop.name).toBe('Quán Ăn Vặt & Trà Sữa Phố Cổ');
            expect(data.shop.slug).toBe('pho-co');
            expect(data.shop.metrics).toBeDefined();
            expect(data.shop.metrics.tableCount).toBeGreaterThanOrEqual(1);
        });
    });

    // =========================================================================
    // 5. CREATE SHOP TRANSACTIONAL
    // =========================================================================
    describe('POST /api/v1/admin/shops', () => {
        let createdShopId: string;
        const testSlug = `shop-test-${Date.now()}`;

        it('rejects payload with missing required fields with 400', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({ name: 'Chưa Đủ Trường' })
            });
            expect(res.status).toBe(400);
            const data: any = await res.json();
            expect(data.error).toBe('BAD_REQUEST');
        });

        it('rejects password shorter than 8 characters with 400', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({
                    name: 'Quán Test Pass Ngắn',
                    slug: `short-pass-${Date.now()}`,
                    ownerFullName: 'Tester',
                    ownerEmail: 'shortpass@test.vn',
                    ownerPassword: 'short'
                })
            });
            expect(res.status).toBe(400);
            const data: any = await res.json();
            expect(data.error).toBe('BAD_REQUEST');
        });

        it('rejects mass assignment payload containing forbidden fields', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({
                    name: 'Quán Mass Assignment',
                    slug: `mass-assign-${Date.now()}`,
                    ownerFullName: 'Tester',
                    ownerEmail: 'mass@test.vn',
                    ownerPassword: 'validPassword123',
                    is_platform_admin: true, // FORBIDDEN FIELD
                    role: 'superadmin'       // FORBIDDEN FIELD
                })
            });
            expect(res.status).toBe(400);
            const data: any = await res.json();
            expect(data.error).toBe('BAD_REQUEST');
        });

        it('successfully creates new shop, owner, tables and categories transactionally', async () => {
            const payload = {
                name: 'Bún Chả Nem Cua Bể',
                slug: testSlug,
                phone: '0912345678',
                address: '88 Hàng Than, Ba Đình, Hà Nội',
                ownerFullName: 'Lê Hoàng Nam',
                ownerEmail: `nam.${Date.now()}@buncha.vn`,
                ownerPassword: 'SecurePassword123!'
            };

            const res = await fetch(`${baseUrl}/api/v1/admin/shops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify(payload)
            });

            expect(res.status).toBe(201);
            const data: any = await res.json();
            expect(data.shop).toBeDefined();
            expect(data.shop.slug).toBe(testSlug);
            expect(data.shop.status).toBe('active');
            expect(data.shop.owner).toBeDefined();
            expect(data.shop.owner.email).toBe(payload.ownerEmail.toLowerCase());

            createdShopId = data.shop.id;

            // Verify tables and categories were created
            const tablesCheck = await query('SELECT COUNT(*) as count FROM tables WHERE tenant_id = $1', [createdShopId]);
            expect(parseInt(tablesCheck.rows[0].count, 10)).toBe(5);

            const catCheck = await query('SELECT COUNT(*) as count FROM menu_categories WHERE tenant_id = $1', [createdShopId]);
            expect(parseInt(catCheck.rows[0].count, 10)).toBe(2);

            // Verify audit log was recorded without password
            const auditCheck = await query(
                'SELECT details FROM audit_logs WHERE tenant_id = $1 AND action = $2',
                [createdShopId, 'SUPER_ADMIN_CREATE_SHOP']
            );
            expect(auditCheck.rows.length).toBe(1);
            const detailsStr = JSON.stringify(auditCheck.rows[0].details);
            expect(detailsStr).not.toContain('SecurePassword123!');
            expect(detailsStr).not.toContain('password_hash');
        });

        it('rejects duplicate shop slug and rolls back transaction', async () => {
            const dupPayload = {
                name: 'Quán Trùng Slug',
                slug: testSlug,
                ownerFullName: 'Người Khác',
                ownerEmail: `other.${Date.now()}@test.vn`,
                ownerPassword: 'AnotherPassword123!'
            };

            const res = await fetch(`${baseUrl}/api/v1/admin/shops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify(dupPayload)
            });

            expect(res.status).toBe(400);
            const data: any = await res.json();
            expect(data.error).toBe('BAD_REQUEST');
        });
    });

    // =========================================================================
    // 6. UPDATE SHOP METADATA & STATUS
    // =========================================================================
    describe('PATCH /api/v1/admin/shops/:id', () => {
        it('successfully updates shop metadata', async () => {
            const updatePayload = {
                name: 'Phở Cổ Hà Nội - Chi Nhánh 1',
                phone: '0988112233',
                address: 'Số 10 Hàng Buồm, Hoàn Kiếm, Hà Nội',
                description: 'Thương hiệu phở gia truyền từ năm 1986'
            };

            const res = await fetch(`${baseUrl}/api/v1/admin/shops/${seedTenantId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify(updatePayload)
            });

            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.shop.name).toBe(updatePayload.name);
            expect(data.shop.phone).toBe(updatePayload.phone);
            expect(data.shop.address).toBe(updatePayload.address);
            expect(data.shop.description).toBe(updatePayload.description);
        });

        it('transitions shop lifecycle status to suspended and records audit log', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops/${seedTenantId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({ status: 'suspended' })
            });

            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.shop.status).toBe('suspended');

            // Verify audit log has structured before/after diff
            const auditRes = await query(
                `SELECT details FROM audit_logs WHERE tenant_id = $1 AND action = 'SUPER_ADMIN_STATUS_CHANGE' ORDER BY created_at DESC LIMIT 1`,
                [seedTenantId]
            );
            expect(auditRes.rows.length).toBe(1);
            expect(auditRes.rows[0].details.updated.status).toBe('suspended');

            // Revert back to active so other tests don't break
            await fetch(`${baseUrl}/api/v1/admin/shops/${seedTenantId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({ status: 'active' })
            });
        });
    });

    // =========================================================================
    // 7. AUDIT LOGS
    // =========================================================================
    describe('GET /api/v1/admin/audit-logs', () => {
        it('returns paginated audit logs with actor and details', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/audit-logs?page=1&limit=20`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();

            expect(Array.isArray(data.logs)).toBe(true);
            expect(data.logs.length).toBeGreaterThanOrEqual(1);
            expect(data.pagination).toBeDefined();
            expect(data.pagination.page).toBe(1);

            const firstLog = data.logs[0];
            expect(firstLog).toHaveProperty('id');
            expect(firstLog).toHaveProperty('action');
            expect(firstLog).toHaveProperty('resourceType');
            expect(firstLog).toHaveProperty('details');
        });

        it('filters audit logs by action', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/audit-logs?action=SUPER_ADMIN_CREATE_SHOP`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();

            expect(Array.isArray(data.logs)).toBe(true);
            data.logs.forEach((log: any) => {
                expect(log.action).toBe('SUPER_ADMIN_CREATE_SHOP');
            });
        });
    });
});
