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
    let superAdminUserId: string;

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
        superAdminUserId = superData.user.id;

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
            expect(firstShop).toHaveProperty('metrics');
            expect(firstShop.metrics).toEqual({
                tableCount: firstShop.tableCount,
                orderCount: firstShop.orderCount,
                totalRevenue: firstShop.totalRevenue
            });
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

        it('supports sorting by allowlisted fields (name, revenue, orders, created_at) (Issue #86)', async () => {
            // Sort by name ASC
            const resNameAsc = await fetch(`${baseUrl}/api/v1/admin/shops?sortBy=name&order=asc&limit=10`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(resNameAsc.status).toBe(200);
            const dataNameAsc: any = await resNameAsc.json();
            expect(Array.isArray(dataNameAsc.shops)).toBe(true);

            // Sort by revenue DESC
            const resRevDesc = await fetch(`${baseUrl}/api/v1/admin/shops?sortBy=revenue&order=desc&limit=10`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(resRevDesc.status).toBe(200);
            const dataRevDesc: any = await resRevDesc.json();
            expect(Array.isArray(dataRevDesc.shops)).toBe(true);
            for (let i = 1; i < dataRevDesc.shops.length; i++) {
                expect(dataRevDesc.shops[i - 1].totalRevenue).toBeGreaterThanOrEqual(dataRevDesc.shops[i].totalRevenue);
            }

            // Reject invalid sortBy field
            const resInvalidSort = await fetch(`${baseUrl}/api/v1/admin/shops?sortBy=unauthorized_column`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(resInvalidSort.status).toBe(400);

            // Reject invalid order direction
            const resInvalidOrder = await fetch(`${baseUrl}/api/v1/admin/shops?order=diagonal`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(resInvalidOrder.status).toBe(400);
        });

        it('guarantees stable multi-page pagination consistency without duplicate shops (Issue #86)', async () => {
            const resP1 = await fetch(`${baseUrl}/api/v1/admin/shops?page=1&limit=1`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(resP1.status).toBe(200);
            const dataP1: any = await resP1.json();

            if (dataP1.pagination.total > 1) {
                const resP2 = await fetch(`${baseUrl}/api/v1/admin/shops?page=2&limit=1`, {
                    headers: { 'Authorization': `Bearer ${superAdminToken}` }
                });
                expect(resP2.status).toBe(200);
                const dataP2: any = await resP2.json();

                expect(dataP1.shops[0].id).not.toBe(dataP2.shops[0].id);
                expect(dataP1.pagination.total).toBe(dataP2.pagination.total);
            }
        });

        it('handles non-matching search cleanly with empty array and 0 total (Issue #86)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops?search=xyz-non-existent-unique-slug-999`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.shops).toEqual([]);
            expect(data.pagination.total).toBe(0);
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
            expect(typeof data.shop.metrics.orderCount).toBe('number');
            expect(typeof data.shop.metrics.totalRevenue).toBe('number');
            expect(data.shop.tableCount).toBe(data.shop.metrics.tableCount);
            expect(data.shop.orderCount).toBe(data.shop.metrics.orderCount);
            expect(data.shop.totalRevenue).toBe(data.shop.metrics.totalRevenue);
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

        it('rejects duplicate owner email without linkExistingOwner flag with 409', async () => {
            const conflictPayload = {
                name: 'Quán Trùng Email Owner',
                slug: `conflict-email-${Date.now()}`,
                ownerFullName: 'Lê Hoàng Nam',
                ownerEmail: `nam.${Date.now()}@buncha.vn`,
                ownerPassword: 'AnotherPassword123!'
            };

            // First create shop
            const res1 = await fetch(`${baseUrl}/api/v1/admin/shops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify(conflictPayload)
            });
            expect(res1.status).toBe(201);

            // Attempt to create another shop with same email without linking flag
            const res2 = await fetch(`${baseUrl}/api/v1/admin/shops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({
                    ...conflictPayload,
                    name: 'Quán Thứ Hai',
                    slug: `second-shop-${Date.now()}`
                })
            });
            expect(res2.status).toBe(409);
            const data2: any = await res2.json();
            expect(data2.error).toBe('OWNER_EMAIL_EXISTS');
        });

        it('successfully links existing owner without altering password when linkExistingOwner is true', async () => {
            const existingEmail = `nam.${Date.now()}@buncha.vn`;
            const initPayload = {
                name: 'Quán Gốc',
                slug: `orig-shop-${Date.now()}`,
                ownerFullName: 'Chủ Quán Cũ',
                ownerEmail: existingEmail,
                ownerPassword: 'OriginalSecretPassword123!'
            };

            const res1 = await fetch(`${baseUrl}/api/v1/admin/shops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify(initPayload)
            });
            expect(res1.status).toBe(201);

            // Check original password hash
            const userBefore = await query('SELECT password_hash FROM users WHERE email = $1', [existingEmail]);
            const origHash = userBefore.rows[0].password_hash;

            // Link existing owner to second shop
            const res2 = await fetch(`${baseUrl}/api/v1/admin/shops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({
                    name: 'Quán Chi Nhánh',
                    slug: `branch-shop-${Date.now()}`,
                    ownerFullName: 'Chủ Quán Cũ',
                    ownerEmail: existingEmail,
                    linkExistingOwner: true
                })
            });
            expect(res2.status).toBe(201);

            // Verify password hash was NOT altered
            const userAfter = await query('SELECT password_hash FROM users WHERE email = $1', [existingEmail]);
            expect(userAfter.rows[0].password_hash).toBe(origHash);
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

        it('blocks transition to archived with 409 SHOP_HAS_OPEN_SESSIONS if tenant has open table sessions (Issue #90)', async () => {
            // Find a table for seed tenant
            const tableRes = await query('SELECT id FROM tables WHERE tenant_id = $1 LIMIT 1', [seedTenantId]);
            const tableId = tableRes.rows[0].id;

            // Create an OPEN session
            const sessionRes = await query(
                `INSERT INTO table_sessions (tenant_id, table_id, status, opened_at)
                 VALUES ($1, $2, 'OPEN', NOW()) RETURNING id`,
                [seedTenantId, tableId]
            );
            const sessionId = sessionRes.rows[0].id;

            try {
                // Attempt to archive seed tenant
                const res = await fetch(`${baseUrl}/api/v1/admin/shops/${seedTenantId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${superAdminToken}`
                    },
                    body: JSON.stringify({ status: 'archived' })
                });

                expect(res.status).toBe(409);
                const data: any = await res.json();
                expect(data.error).toBe('SHOP_HAS_OPEN_SESSIONS');
                expect(data.message).toContain('phiên bàn đang mở');
            } finally {
                // Clean up session: mark CLOSED so seed tenant remains clean
                await query(`UPDATE table_sessions SET status = 'CLOSED' WHERE id = $1`, [sessionId]);
            }
        });

        it('returns 404 NOT_FOUND when updating non-existent tenant id (Issue #90)', async () => {
            const fakeId = '00000000-0000-0000-0000-000000000000';
            const res = await fetch(`${baseUrl}/api/v1/admin/shops/${fakeId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({ status: 'suspended' })
            });

            expect(res.status).toBe(404);
            const data: any = await res.json();
            expect(data.error).toBe('NOT_FOUND');
        });

        it('successfully transitions to archived when tenant has 0 open sessions without hard delete (Issue #90)', async () => {
            // Create a test tenant without open sessions
            const tempSlug = `test-lifecycle-${Date.now()}`;
            const createRes = await query(`
                INSERT INTO tenants (name, slug, status)
                VALUES ('Lifecycle Test Shop', $1, 'active')
                RETURNING id
            `, [tempSlug]);
            const tempTenantId = createRes.rows[0].id;

            try {
                const res = await fetch(`${baseUrl}/api/v1/admin/shops/${tempTenantId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${superAdminToken}`
                    },
                    body: JSON.stringify({ status: 'archived' })
                });

                expect(res.status).toBe(200);
                const data: any = await res.json();
                expect(data.shop.status).toBe('archived');

                // Verify row still exists in DB (zero hard delete)
                const dbRes = await query('SELECT id, status FROM tenants WHERE id = $1', [tempTenantId]);
                expect(dbRes.rows.length).toBe(1);
                expect(dbRes.rows[0].status).toBe('archived');

                // Verify audit log exists
                const auditRes = await query(
                    "SELECT action, details FROM audit_logs WHERE tenant_id = $1 AND action = 'SUPER_ADMIN_STATUS_CHANGE'",
                    [tempTenantId]
                );
                expect(auditRes.rows.length).toBe(1);
                expect(auditRes.rows[0].details.updated.status).toBe('archived');
            } finally {
                await query('DELETE FROM audit_logs WHERE tenant_id = $1', [tempTenantId]);
                await query('DELETE FROM tenants WHERE id = $1', [tempTenantId]);
            }
        });
    });

    // =========================================================================
    // 7. AUDIT LOGS (Issue #84 [Admin audit])
    // =========================================================================
    describe('GET /api/v1/admin/audit-logs', () => {
        it('returns paginated audit logs with mapped actor (userId, email, name)', async () => {
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
            expect(firstLog).toHaveProperty('userId');
            expect(firstLog).toHaveProperty('userEmail');
            expect(firstLog).toHaveProperty('userName');
            expect(firstLog).toHaveProperty('createdAt');
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

        it('handles actor variants: deleted user and legacy null user (Issue #84)', async () => {
            const dummyDeletedUserId = '00000000-0000-0000-0000-000000000099';
            // 1. Insert audit log with deleted user ID not in users table
            await query(
                `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
                 VALUES ($1::uuid, $2::uuid, 'SUPER_ADMIN_TEST_DELETED_USER', 'tenant', $3, '{"change":"test_deleted"}')`,
                [seedTenantId, dummyDeletedUserId, String(seedTenantId)]
            );

            // 2. Insert audit log with NULL user_id (system/legacy action)
            await query(
                `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
                 VALUES ($1::uuid, NULL, 'SUPER_ADMIN_TEST_NULL_USER', 'tenant', $2, '{"change":"test_null"}')`,
                [seedTenantId, String(seedTenantId)]
            );

            const resDeleted = await fetch(`${baseUrl}/api/v1/admin/audit-logs?action=SUPER_ADMIN_TEST_DELETED_USER`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(resDeleted.status).toBe(200);
            const dataDeleted: any = await resDeleted.json();
            expect(dataDeleted.logs.length).toBeGreaterThanOrEqual(1);
            expect(dataDeleted.logs[0].userId).toBe(dummyDeletedUserId);
            expect(dataDeleted.logs[0].userEmail).toBeNull();
            expect(dataDeleted.logs[0].userName).toBeNull();

            const resNull = await fetch(`${baseUrl}/api/v1/admin/audit-logs?action=SUPER_ADMIN_TEST_NULL_USER`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(resNull.status).toBe(200);
            const dataNull: any = await resNull.json();
            expect(dataNull.logs.length).toBeGreaterThanOrEqual(1);
            expect(dataNull.logs[0].userId).toBeNull();
            expect(dataNull.logs[0].userEmail).toBeNull();
            expect(dataNull.logs[0].userName).toBeNull();
        });

        it('filters audit logs by userId', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/audit-logs?userId=${superAdminUserId}`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(Array.isArray(data.logs)).toBe(true);
            data.logs.forEach((log: any) => {
                expect(log.userId).toBe(superAdminUserId);
            });
        });

        it('filters audit logs by date range and rejects invalid dates', async () => {
            // Future date returns empty
            const resFuture = await fetch(`${baseUrl}/api/v1/admin/audit-logs?startDate=2099-01-01`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(resFuture.status).toBe(200);
            const dataFuture: any = await resFuture.json();
            expect(dataFuture.logs).toEqual([]);
            expect(dataFuture.pagination.total).toBe(0);

            // Invalid date format returns 400
            const resInvalid = await fetch(`${baseUrl}/api/v1/admin/audit-logs?startDate=not-a-valid-date`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(resInvalid.status).toBe(400);
            const errorData: any = await resInvalid.json();
            expect(errorData.error).toBe('BAD_REQUEST');
        });

        it('guarantees stable pagination with identical timestamps (Issue #84 deterministic order)', async () => {
            const fixedTime = new Date('2026-10-20T12:00:00.000Z');
            const tieBreakerAction = 'SUPER_ADMIN_TIE_BREAKER';

            // Insert 3 logs with exact same created_at
            for (let i = 0; i < 3; i++) {
                await query(
                    `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, created_at)
                     VALUES ($1::uuid, $2::uuid, $3, 'tenant', $4, $5, $6)`,
                    [seedTenantId, superAdminUserId, tieBreakerAction, String(seedTenantId), JSON.stringify({ index: i }), fixedTime]
                );
            }

            // Fetch page 1 (limit 2)
            const resP1 = await fetch(`${baseUrl}/api/v1/admin/audit-logs?action=${tieBreakerAction}&limit=2&page=1`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(resP1.status).toBe(200);
            const dataP1: any = await resP1.json();
            expect(dataP1.logs.length).toBe(2);

            // Fetch page 2 (limit 2)
            const resP2 = await fetch(`${baseUrl}/api/v1/admin/audit-logs?action=${tieBreakerAction}&limit=2&page=2`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(resP2.status).toBe(200);
            const dataP2: any = await resP2.json();
            expect(dataP2.logs.length).toBe(1);

            // Verify no overlaps across pages (stable sort ORDER BY created_at DESC, id DESC)
            const page1Ids = dataP1.logs.map((l: any) => l.id);
            const page2Ids = dataP2.logs.map((l: any) => l.id);
            expect(page1Ids).not.toContain(page2Ids[0]);
        });

        it('verifies deterministic UTC+7 clock calculations without timezone jumps (Issue #84)', async () => {
            const testUtcDate = new Date('2026-10-20T08:00:00.000Z');
            // Asia/Ho_Chi_Minh is UTC+7 -> 15:00:00
            const vnTime = testUtcDate.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
            expect(vnTime).toContain('3:00:00 PM');

            // Verify difference between UTC and ICT hours is exactly 7 hours
            const utcHours = testUtcDate.getUTCHours(); // 8
            const formattedVnHour = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Ho_Chi_Minh',
                hour: 'numeric',
                hour12: false
            }).format(testUtcDate);
            const vnHours = parseInt(formattedVnHour, 10); // 15
            expect((vnHours - utcHours + 24) % 24).toBe(7);
        });
    });

    // =========================================================================
    // 8. TEMPLATES REGISTRY
    // =========================================================================
    describe('GET /api/v1/admin/templates', () => {
        it('returns available layout templates', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/templates`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();

            expect(Array.isArray(data.templates)).toBe(true);
            expect(data.templates.length).toBeGreaterThanOrEqual(1);
            const tpl = data.templates[0];
            expect(tpl).toHaveProperty('id');
            expect(tpl).toHaveProperty('name');
            expect(tpl).toHaveProperty('defaultBlocks');
        });
    });

    // =========================================================================
    // 9. E2E FULL SHOP LIFECYCLE & LEDGER PRESERVATION
    // =========================================================================
    describe('E2E Full Shop Lifecycle & Zero Hard-Delete Ledger Preservation', () => {
        it('executes full flow: create -> list -> detail -> update -> suspend -> reactivate -> archive and preserves ledger', async () => {
            const flowSlug = `flow-shop-${Date.now()}`;

            // Step 1: Create
            const createRes = await fetch(`${baseUrl}/api/v1/admin/shops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({
                    name: 'Quán E2E Flow',
                    slug: flowSlug,
                    phone: '0933445566',
                    address: '777 Đường Láng, Hà Nội',
                    ownerFullName: 'Chủ Quán E2E',
                    ownerEmail: `flow.${Date.now()}@e2e.vn`,
                    ownerPassword: 'FlowPassword123!'
                })
            });
            expect(createRes.status).toBe(201);
            const createData: any = await createRes.json();
            const shopId = createData.shop.id;
            expect(shopId).toBeDefined();

            // Step 2: List with search
            const listRes = await fetch(`${baseUrl}/api/v1/admin/shops?search=${flowSlug}`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(listRes.status).toBe(200);
            const listData: any = await listRes.json();
            expect(listData.shops.some((s: any) => s.id === shopId)).toBe(true);

            // Step 3: Get Detail
            const detailRes = await fetch(`${baseUrl}/api/v1/admin/shops/${shopId}`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(detailRes.status).toBe(200);
            const detailData: any = await detailRes.json();
            expect(detailData.shop.id).toBe(shopId);
            expect(detailData.shop.status).toBe('active');

            // Step 4: Update metadata
            const updateRes = await fetch(`${baseUrl}/api/v1/admin/shops/${shopId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({
                    name: 'Quán E2E Flow Đã Đổi Tên',
                    description: 'Mô tả mới được cập nhật'
                })
            });
            expect(updateRes.status).toBe(200);
            const updateData: any = await updateRes.json();
            expect(updateData.shop.name).toBe('Quán E2E Flow Đã Đổi Tên');

            // Step 5: Transition to Suspended
            const suspendRes = await fetch(`${baseUrl}/api/v1/admin/shops/${shopId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({ status: 'suspended' })
            });
            expect(suspendRes.status).toBe(200);
            const suspendData: any = await suspendRes.json();
            expect(suspendData.shop.status).toBe('suspended');

            // Step 6: Transition back to Active
            const activateRes = await fetch(`${baseUrl}/api/v1/admin/shops/${shopId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({ status: 'active' })
            });
            expect(activateRes.status).toBe(200);
            const activateData: any = await activateRes.json();
            expect(activateData.shop.status).toBe('active');

            // Step 7: Transition to Archived (Zero Hard-Delete)
            const archiveRes = await fetch(`${baseUrl}/api/v1/admin/shops/${shopId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({ status: 'archived' })
            });
            expect(archiveRes.status).toBe(200);
            const archiveData: any = await archiveRes.json();
            expect(archiveData.shop.status).toBe('archived');

            // Step 8: Verify Zero Hard-Delete in DB
            const tenantInDb = await query('SELECT id, status FROM tenants WHERE id = $1', [shopId]);
            expect(tenantInDb.rows.length).toBe(1);
            expect(tenantInDb.rows[0].status).toBe('archived');

            const tablesInDb = await query('SELECT COUNT(*) as count FROM tables WHERE tenant_id = $1', [shopId]);
            expect(parseInt(tablesInDb.rows[0].count, 10)).toBe(5);

            // Step 9: Verify audit trail
            const auditTrail = await query(
                'SELECT action FROM audit_logs WHERE tenant_id = $1 ORDER BY created_at ASC',
                [shopId]
            );
            expect(auditTrail.rows.length).toBeGreaterThanOrEqual(4);
            const actions = auditTrail.rows.map(r => r.action);
            expect(actions).toContain('SUPER_ADMIN_CREATE_SHOP');
            expect(actions).toContain('SUPER_ADMIN_UPDATE_SHOP');
            expect(actions).toContain('SUPER_ADMIN_STATUS_CHANGE');
        });
    });
});
