import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../app.js';
import { query, pool } from '../db/pool.js';
import { seed } from '../db/seed.js';

describe('Safe Menu Category CRUD (Issue #100)', () => {
    let server: http.Server;
    let baseUrl: string;
    let tenantPhoCoId: string;
    let tenantSakuraId: string;
    let managerToken: string;
    let waiterToken: string;
    let sakuraManagerToken: string;

    beforeAll(async () => {
        await seed();
        await query('UPDATE promotions SET is_active = false');

        // Create a manager for sakura tenant to test multi-tenant isolation
        const phocoUserRes = await query(`SELECT password_hash FROM users WHERE email = 'admin@phoco.vn'`);
        const validHash = phocoUserRes.rows[0].password_hash;

        const sakuraUserRes = await query(`
            INSERT INTO users (id, email, password_hash, full_name, phone, is_platform_admin)
            VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin@sakura.vn', $1, 'Sakura Manager', '0909999999', false)
            ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash
            RETURNING id;
        `, [validHash]);
        const sakuraUserId = sakuraUserRes.rows[0].id;

        await query(`
            INSERT INTO memberships (tenant_id, user_id, role, permissions)
            VALUES ('22222222-2222-2222-2222-222222222222', $1, 'manager', ARRAY['menu.manage', 'order.manage', 'session.open'])
            ON CONFLICT (tenant_id, user_id) DO UPDATE SET permissions = EXCLUDED.permissions;
        `, [sakuraUserId]);

        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        const tenantRes = await query(`SELECT id, slug FROM tenants WHERE slug IN ('pho-co', 'sakura')`);
        tenantPhoCoId = tenantRes.rows.find(t => t.slug === 'pho-co')!.id;
        tenantSakuraId = tenantRes.rows.find(t => t.slug === 'sakura')!.id;

        // Login as Pho Co Manager (has menu.manage)
        const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@phoco.vn', password: '123456' })
        });
        const loginData: any = await loginRes.json();
        managerToken = loginData.token;

        // Login as Pho Co Waiter (NO menu.manage)
        const waiterLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'phucvu@phoco.vn', password: '123456' })
        });
        const waiterData: any = await waiterLoginRes.json();
        waiterToken = waiterData.token;

        // Login as Sakura Manager
        const sakuraLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@sakura.vn', password: '123456' })
        });
        const sakuraData: any = await sakuraLoginRes.json();
        sakuraManagerToken = sakuraData.token;
    });

    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    describe('1. Permissions & Access Control', () => {
        it('rejects unauthenticated requests with 401', async () => {
            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Khai vị mới' })
            });
            expect(res.status).toBe(401);
        });

        it('rejects staff without menu.manage permission with 403', async () => {
            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${waiterToken}`
                },
                body: JSON.stringify({ name: 'Khai vị mới' })
            });
            expect(res.status).toBe(403);
            const data: any = await res.json();
            expect(data.error || data.code).toBe('PERMISSION_DENIED');
        });

        it('allows staff without menu.manage to read categories', async () => {
            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories`, {
                headers: {
                    'Authorization': `Bearer ${waiterToken}`
                }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(Array.isArray(data.categories)).toBe(true);
        });
    });

    describe('2. Category Creation & Validation', () => {
        let createdCatId: string;

        it('successfully creates category with valid name and assigns item_count = 0', async () => {
            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${managerToken}`
                },
                body: JSON.stringify({ name: '  Món Nướng Đặc Biệt  ' })
            });
            expect(res.status).toBe(201);
            const data: any = await res.json();
            expect(data.category).toBeDefined();
            expect(data.category.name).toBe('Món Nướng Đặc Biệt'); // trimmed
            expect(data.category.item_count).toBe(0);
            expect(data.category.is_active).toBe(true);
            createdCatId = data.category.id;
        });

        it('rejects empty or whitespace category name with 400', async () => {
            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${managerToken}`
                },
                body: JSON.stringify({ name: '   ' })
            });
            expect(res.status).toBe(400);
            const data: any = await res.json();
            expect(data.code || data.error).toBe('INVALID_CATEGORY_NAME');
        });

        it('rejects duplicate category name within same tenant (case-insensitive) with 409', async () => {
            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${managerToken}`
                },
                body: JSON.stringify({ name: 'món nướng đặc biệt' })
            });
            expect(res.status).toBe(409);
            const data: any = await res.json();
            expect(data.code || data.error).toBe('CATEGORY_NAME_EXISTS');
        });

        it('records category_create in audit_logs', async () => {
            const logRes = await query(`
                SELECT action, resource_type, resource_id, details
                FROM audit_logs
                WHERE resource_id = $1 AND action = 'category_create'
            `, [createdCatId]);
            expect(logRes.rows.length).toBe(1);
            expect(logRes.rows[0].resource_type).toBe('menu_category');
            expect(logRes.rows[0].details.name).toBe('Món Nướng Đặc Biệt');
        });
    });

    describe('3. Multi-tenant Isolation', () => {
        it('allows another tenant to create category with the same name', async () => {
            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sakuraManagerToken}`
                },
                body: JSON.stringify({ name: 'Món Nướng Đặc Biệt' })
            });
            expect(res.status).toBe(201);
            const data: any = await res.json();
            expect(data.category.tenant_id).toBe(tenantSakuraId);
        });

        it('prevents Tenant A from updating Tenant B category (returns 404)', async () => {
            const sakuraCatRes = await query(`SELECT id FROM menu_categories WHERE tenant_id = $1 LIMIT 1`, [tenantSakuraId]);
            const sakuraCatId = sakuraCatRes.rows[0].id;

            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories/${sakuraCatId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${managerToken}` // Pho Co manager
                },
                body: JSON.stringify({ name: 'Tên Độc Quyền' })
            });
            expect(res.status).toBe(404);
        });

        it('prevents Tenant A from deleting Tenant B category (returns 404)', async () => {
            const sakuraCatRes = await query(`SELECT id FROM menu_categories WHERE tenant_id = $1 LIMIT 1`, [tenantSakuraId]);
            const sakuraCatId = sakuraCatRes.rows[0].id;

            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories/${sakuraCatId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${managerToken}` // Pho Co manager
                }
            });
            expect(res.status).toBe(404);
        });
    });

    describe('4. Category Update (PUT / PATCH)', () => {
        let testCatId: string;

        beforeAll(async () => {
            const res = await query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order)
                VALUES ($1, 'Danh Mục Test Sửa', 99)
                RETURNING id;
            `, [tenantPhoCoId]);
            testCatId = res.rows[0].id;
        });

        it('successfully renames category via PATCH', async () => {
            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories/${testCatId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${managerToken}`
                },
                body: JSON.stringify({ name: 'Danh Mục Đã Sửa Tên' })
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.category.name).toBe('Danh Mục Đã Sửa Tên');
        });

        it('rejects rename if new name conflicts with existing category in same tenant', async () => {
            // First get another existing category in Pho Co
            const otherRes = await query(`SELECT name FROM menu_categories WHERE tenant_id = $1 AND id != $2 LIMIT 1`, [tenantPhoCoId, testCatId]);
            const otherName = otherRes.rows[0].name;

            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories/${testCatId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${managerToken}`
                },
                body: JSON.stringify({ name: otherName.toUpperCase() })
            });
            expect(res.status).toBe(409);
            const data: any = await res.json();
            expect(data.code || data.error).toBe('CATEGORY_NAME_EXISTS');
        });
    });

    describe('5. Safe Deletion & Non-empty Category Protection', () => {
        let nonEmptyCatId: string;
        let emptyCatId: string;
        let itemId: string;

        beforeAll(async () => {
            // Create a non-empty category
            const cat1 = await query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order)
                VALUES ($1, 'Danh Mục Có Món', 101)
                RETURNING id;
            `, [tenantPhoCoId]);
            nonEmptyCatId = cat1.rows[0].id;

            // Insert an item in it
            const item = await query(`
                INSERT INTO menu_items (tenant_id, category_id, name, price, is_available)
                VALUES ($1, $2, 'Bò Cuộn Nấm Kim Châm', 55000, true)
                RETURNING id;
            `, [tenantPhoCoId, nonEmptyCatId]);
            itemId = item.rows[0].id;

            // Create an empty category
            const cat2 = await query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order)
                VALUES ($1, 'Danh Mục Hoàn Toàn Rỗng', 102)
                RETURNING id;
            `, [tenantPhoCoId]);
            emptyCatId = cat2.rows[0].id;
        });

        it('rejects deletion of category containing items with 409 CATEGORY_NOT_EMPTY', async () => {
            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories/${nonEmptyCatId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${managerToken}`
                }
            });
            expect(res.status).toBe(409);
            const data: any = await res.json();
            expect(data.code || data.error).toBe('CATEGORY_NOT_EMPTY');
            expect(data.itemCount).toBe(1);

            // Assert item is still intact and not cascaded!
            const itemCheck = await query(`SELECT id FROM menu_items WHERE id = $1`, [itemId]);
            expect(itemCheck.rows.length).toBe(1);

            // Assert category is still intact
            const catCheck = await query(`SELECT id FROM menu_categories WHERE id = $1`, [nonEmptyCatId]);
            expect(catCheck.rows.length).toBe(1);
        });

        it('also rejects deletion when items in the category are is_available = false', async () => {
            // Set item to unavailable
            await query(`UPDATE menu_items SET is_available = false WHERE id = $1`, [itemId]);

            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories/${nonEmptyCatId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${managerToken}`
                }
            });
            expect(res.status).toBe(409);
            const data: any = await res.json();
            expect(data.code || data.error).toBe('CATEGORY_NOT_EMPTY');
        });

        it('allows deletion of empty category and returns 200 CATEGORY_DELETED', async () => {
            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories/${emptyCatId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${managerToken}`
                }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.code).toBe('CATEGORY_DELETED');

            // Assert category is removed from DB
            const check = await query(`SELECT id FROM menu_categories WHERE id = $1`, [emptyCatId]);
            expect(check.rows.length).toBe(0);

            // Assert audit log was recorded
            const logCheck = await query(`
                SELECT action, resource_id, details
                FROM audit_logs
                WHERE resource_id = $1 AND action = 'category_delete'
            `, [emptyCatId]);
            expect(logCheck.rows.length).toBe(1);
        });

        it('returns 404 when trying to delete already deleted or non-existent category', async () => {
            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories/${emptyCatId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${managerToken}`
                }
            });
            expect(res.status).toBe(404);
            const data: any = await res.json();
            expect(data.code || data.error).toBe('CATEGORY_NOT_FOUND');
        });
    });

    describe('6. PostgreSQL Foreign Key & Concurrency Safety', () => {
        it('PostgreSQL engine blocks direct DELETE on menu_categories with ON DELETE RESTRICT (error 23503)', async () => {
            const catRes = await query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order)
                VALUES ($1, 'Danh Mục Test FK Engine', 103)
                RETURNING id;
            `, [tenantPhoCoId]);
            const catId = catRes.rows[0].id;

            await query(`
                INSERT INTO menu_items (tenant_id, category_id, name, price)
                VALUES ($1, $2, 'Món Giữ FK', 30000);
            `, [tenantPhoCoId, catId]);

            // Attempt raw SQL DELETE on menu_categories bypassing route logic
            let errorCaught: any = null;
            try {
                await query(`DELETE FROM menu_categories WHERE id = $1`, [catId]);
            } catch (err: any) {
                errorCaught = err;
            }

            expect(errorCaught).toBeDefined();
            expect(errorCaught.code).toBe('23503'); // foreign_key_violation
        });

        it('race condition simulation: item created concurrently during delete check', async () => {
            const catRes = await query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order)
                VALUES ($1, 'Danh Mục Test Race Condition', 104)
                RETURNING id;
            `, [tenantPhoCoId]);
            const catId = catRes.rows[0].id;

            // Scenario:
            // Client A starts a transaction to insert an item into catId
            const clientA = await pool.connect();
            await clientA.query('BEGIN');
            await clientA.query(`
                INSERT INTO menu_items (tenant_id, category_id, name, price)
                VALUES ($1, $2, 'Món Tạo Đồng Thời', 45000);
            `, [tenantPhoCoId, catId]);
            await clientA.query('COMMIT');
            clientA.release();

            // Client B (delete request) attempts to delete catId
            const res = await fetch(`${baseUrl}/api/v1/staff/menu/categories/${catId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${managerToken}`
                }
            });

            expect(res.status).toBe(409);
            const data: any = await res.json();
            expect(data.code || data.error).toBe('CATEGORY_NOT_EMPTY');

            // The concurrently added item is guaranteed preserved
            const check = await query(`SELECT name FROM menu_items WHERE category_id = $1`, [catId]);
            expect(check.rows.length).toBe(1);
            expect(check.rows[0].name).toBe('Món Tạo Đồng Thời');
        });
    });
});

