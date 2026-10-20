import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from '../app.js';
import { query, pool } from '../db/pool.js';
import { seed } from '../db/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    describe('6. R1 Migration Regressions: Dynamic Discovery, Postconditions, Idempotence', () => {
        it('migration 009 cleanly discovers and drops custom-named CASCADE foreign keys and applies RESTRICT', async () => {
            // Setup: Create a custom-named FK with CASCADE
            await query(`
                ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_category_id_fkey;
                ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS legacy_category_fk;
                ALTER TABLE menu_items ADD CONSTRAINT legacy_category_fk FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE;
            `);

            // Read migration 009 SQL and execute
            const migrationSql = fs.readFileSync(path.resolve(__dirname, '../db/migrations/009_protect_menu_category_cascade.sql'), 'utf-8');
            await query(migrationSql);

            // Assert: legacy_category_fk is dropped, only menu_items_category_id_fkey exists with confdeltype = 'r'
            const checkRes = await query(`
                SELECT c.conname, c.confdeltype
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_class ref_t ON c.confrelid = ref_t.oid
                WHERE t.relname = 'menu_items' AND ref_t.relname = 'menu_categories' AND c.contype = 'f';
            `);
            expect(checkRes.rows.length).toBe(1);
            expect(checkRes.rows[0].conname).toBe('menu_items_category_id_fkey');
            expect(checkRes.rows[0].confdeltype).toBe('r');
        });

        it('migration 009 preflight raises error if normalized duplicate category names exist within tenant', async () => {
            // Setup: Create a temporary duplicate category name (normalized)
            const tempCatRes = await query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order)
                VALUES ($1, 'Trùng Lặp Tiền Khởi Động', 888)
                RETURNING id;
            `, [tenantSakuraId]);

            // Temporarily drop unique index so duplicate insert is possible
            await query(`DROP INDEX IF EXISTS idx_menu_categories_tenant_name;`);
            await query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order)
                VALUES ($1, '   trùng lặp tiền khởi động   ', 889);
            `, [tenantSakuraId]);

            const migrationSql = fs.readFileSync(path.resolve(__dirname, '../db/migrations/009_protect_menu_category_cascade.sql'), 'utf-8');
            let caught: any = null;
            try {
                await query(migrationSql);
            } catch (err: any) {
                caught = err;
            }

            expect(caught).toBeDefined();
            expect(caught.message).toContain('Operator intervention required');

            // Clean up duplicates and re-run migration to restore healthy state
            await query(`DELETE FROM menu_categories WHERE id = $1`, [tempCatRes.rows[0].id]);
            await query(`DELETE FROM menu_categories WHERE tenant_id = $1 AND sort_order = 889`, [tenantSakuraId]);
            await query(migrationSql);
        });

        it('migration 009 is idempotent across repeated runs', async () => {
            const migrationSql = fs.readFileSync(path.resolve(__dirname, '../db/migrations/009_protect_menu_category_cascade.sql'), 'utf-8');
            await query(migrationSql);
            await query(migrationSql);
        });

        it('migration 009 rollback script restores ON DELETE CASCADE', async () => {
            const downSql = fs.readFileSync(path.resolve(__dirname, '../db/migrations/009_protect_menu_category_cascade_down.sql'), 'utf-8');
            await query(downSql);

            const checkRes = await query(`
                SELECT c.conname, c.confdeltype
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_class ref_t ON c.confrelid = ref_t.oid
                WHERE t.relname = 'menu_items' AND ref_t.relname = 'menu_categories' AND c.contype = 'f';
            `);
            expect(checkRes.rows.length).toBe(1);
            expect(checkRes.rows[0].confdeltype).toBe('c'); // 'c' = CASCADE

            // Restore forward migration
            const upSql = fs.readFileSync(path.resolve(__dirname, '../db/migrations/009_protect_menu_category_cascade.sql'), 'utf-8');
            await query(upSql);
        });
    });

    describe('7. R3 Concurrency Regressions: Duplicate Name Unique Index Race', () => {
        it('concurrent category creation with same normalized name returns 201 for one and 409 CATEGORY_NAME_EXISTS for the other (never 500)', async () => {
            const catName = 'Sinh Tố Bơ Đậu Phộng ' + Date.now();
            const [res1, res2] = await Promise.all([
                fetch(`${baseUrl}/api/v1/staff/menu/categories`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` },
                    body: JSON.stringify({ name: catName })
                }),
                fetch(`${baseUrl}/api/v1/staff/menu/categories`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` },
                    body: JSON.stringify({ name: `   ${catName.toLowerCase()}   ` })
                })
            ]);

            const statuses = [res1.status, res2.status].sort();
            expect(statuses).toEqual([201, 409]);

            const failedRes = res1.status === 409 ? res1 : res2;
            const failedData: any = await failedRes.json();
            expect(failedData.code || failedData.error).toBe('CATEGORY_NAME_EXISTS');

            // Verify audit logs has exactly 1 category_create (no orphan audit log on failed transaction)
            const auditCheck = await query(`
                SELECT COUNT(*)::int as count FROM audit_logs
                WHERE details->>'name' ILIKE $1 AND action = 'category_create'
            `, [`%${catName}%`]);
            expect(auditCheck.rows[0].count).toBe(1);
        });

        it('concurrent category rename with same normalized name returns 200 for one and 409 CATEGORY_NAME_EXISTS for the other (never 500)', async () => {
            // Create 2 categories
            const c1 = await query(`INSERT INTO menu_categories (tenant_id, name, sort_order) VALUES ($1, 'Rename Target 1 ' || gen_random_uuid(), 301) RETURNING id`, [tenantPhoCoId]);
            const c2 = await query(`INSERT INTO menu_categories (tenant_id, name, sort_order) VALUES ($1, 'Rename Target 2 ' || gen_random_uuid(), 302) RETURNING id`, [tenantPhoCoId]);

            const commonName = 'Tên Chung Sau Đổi ' + Date.now();
            const [res1, res2] = await Promise.all([
                fetch(`${baseUrl}/api/v1/staff/menu/categories/${c1.rows[0].id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` },
                    body: JSON.stringify({ name: commonName })
                }),
                fetch(`${baseUrl}/api/v1/staff/menu/categories/${c2.rows[0].id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` },
                    body: JSON.stringify({ name: commonName.toLowerCase() })
                })
            ]);

            const statuses = [res1.status, res2.status].sort();
            expect(statuses).toEqual([200, 409]);

            const failedRes = res1.status === 409 ? res1 : res2;
            const failedData: any = await failedRes.json();
            expect(failedData.code || failedData.error).toBe('CATEGORY_NAME_EXISTS');
        });
    });

    describe('8. R4 Concurrency Regressions: True Overlapping Concurrency via Two Connections & Barriers', () => {
        it('Schedule 1: Item creation transaction holds lock, concurrent category delete waits then returns 409 CATEGORY_NOT_EMPTY', async () => {
            const catRes = await query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order)
                VALUES ($1, 'Danh Mục Test Concurrency Schedule 1', 501)
                RETURNING id;
            `, [tenantPhoCoId]);
            const catId = catRes.rows[0].id;

            // Connection A starts transaction and inserts item into catId
            const clientA = await pool.connect();
            await clientA.query('BEGIN');
            await clientA.query('SELECT id FROM menu_categories WHERE id = $1 AND tenant_id = $2 FOR SHARE', [catId, tenantPhoCoId]);
            await clientA.query(`
                INSERT INTO menu_items (tenant_id, category_id, name, price)
                VALUES ($1, $2, 'Món Giữ Transaction A', 60000);
            `, [tenantPhoCoId, catId]);

            // Concurrently, Client B calls DELETE /menu/categories/:catId
            let deleteCompleted = false;
            let deleteStatus: number | null = null;
            let deleteData: any = null;

            const deletePromise = fetch(`${baseUrl}/api/v1/staff/menu/categories/${catId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${managerToken}` }
            }).then(async (res) => {
                deleteCompleted = true;
                deleteStatus = res.status;
                deleteData = await res.json();
            });

            // Allow delete request to execute and verify it is blocked by Client A's transaction
            await new Promise(r => setTimeout(r, 200));
            expect(deleteCompleted).toBe(false); // Proves real concurrency & barrier

            // Client A commits
            await clientA.query('COMMIT');
            clientA.release();

            // Client B unblocks, re-evaluates item_count > 0, returns 409
            await deletePromise;
            expect(deleteStatus).toBe(409);
            expect(deleteData.code || deleteData.error).toBe('CATEGORY_NOT_EMPTY');

            // Verify item is 100% preserved and category is intact
            const itemCheck = await query(`SELECT name FROM menu_items WHERE category_id = $1`, [catId]);
            expect(itemCheck.rows.length).toBe(1);
            expect(itemCheck.rows[0].name).toBe('Món Giữ Transaction A');
        });

        it('Schedule 2: Category delete transaction holds lock and deletes category, concurrent item creation waits then returns 400 CATEGORY_NOT_FOUND (never 500)', async () => {
            const catRes = await query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order)
                VALUES ($1, 'Danh Mục Test Concurrency Schedule 2', 502)
                RETURNING id;
            `, [tenantPhoCoId]);
            const catId = catRes.rows[0].id;

            // Connection B starts transaction, locks category row FOR UPDATE, and deletes it
            const clientB = await pool.connect();
            await clientB.query('BEGIN');
            await clientB.query('SELECT id FROM menu_categories WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [catId, tenantPhoCoId]);
            await clientB.query('DELETE FROM menu_categories WHERE id = $1 AND tenant_id = $2', [catId, tenantPhoCoId]);

            // Concurrently, Client A calls POST /menu/items targeting catId
            let itemCreateCompleted = false;
            let itemCreateStatus: number | null = null;
            let itemCreateData: any = null;

            const createPromise = fetch(`${baseUrl}/api/v1/staff/menu/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` },
                body: JSON.stringify({
                    name: 'Món Chờ Xóa Hoàn Tất',
                    category_id: catId,
                    price: 35000
                })
            }).then(async (res) => {
                itemCreateCompleted = true;
                itemCreateStatus = res.status;
                itemCreateData = await res.json();
            });

            // Allow create request to execute and verify it is blocked waiting for Client B
            await new Promise(r => setTimeout(r, 200));
            expect(itemCreateCompleted).toBe(false); // Proves real concurrency & barrier

            // Client B commits deletion
            await clientB.query('COMMIT');
            clientB.release();

            // Client A unblocks and gets controlled business error
            await createPromise;
            expect(itemCreateStatus).toBe(400);
            expect(itemCreateData.code || itemCreateData.error).toBe('CATEGORY_NOT_FOUND');

            // Verify category is gone and NO orphan item was created
            const catCheck = await query(`SELECT id FROM menu_categories WHERE id = $1`, [catId]);
            expect(catCheck.rows.length).toBe(0);
            const itemCheck = await query(`SELECT id FROM menu_items WHERE category_id = $1`, [catId]);
            expect(itemCheck.rows.length).toBe(0);
        });

        it('Schedule 3: Category delete transaction holds lock, concurrent item MOVE waits then returns 400 CATEGORY_NOT_FOUND (never 500)', async () => {
            // Create item in category A
            const catARes = await query(`INSERT INTO menu_categories (tenant_id, name, sort_order) VALUES ($1, 'Cat A ' || gen_random_uuid(), 601) RETURNING id`, [tenantPhoCoId]);
            const catAId = catARes.rows[0].id;
            const itemRes = await query(`INSERT INTO menu_items (tenant_id, category_id, name, price) VALUES ($1, $2, 'Món Chuyển Nhượng', 50000) RETURNING id`, [tenantPhoCoId, catAId]);
            const itemId = itemRes.rows[0].id;

            // Target empty category B
            const catBRes = await query(`INSERT INTO menu_categories (tenant_id, name, sort_order) VALUES ($1, 'Cat B ' || gen_random_uuid(), 602) RETURNING id`, [tenantPhoCoId]);
            const catBId = catBRes.rows[0].id;

            // Connection B starts transaction and deletes category B
            const clientB = await pool.connect();
            await clientB.query('BEGIN');
            await clientB.query('SELECT id FROM menu_categories WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [catBId, tenantPhoCoId]);
            await clientB.query('DELETE FROM menu_categories WHERE id = $1 AND tenant_id = $2', [catBId, tenantPhoCoId]);

            // Client A tries to move item to category B via PUT /menu/items/:id
            let itemMoveCompleted = false;
            let itemMoveStatus: number | null = null;
            let itemMoveData: any = null;

            const movePromise = fetch(`${baseUrl}/api/v1/staff/menu/items/${itemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` },
                body: JSON.stringify({ category_id: catBId })
            }).then(async (res) => {
                itemMoveCompleted = true;
                itemMoveStatus = res.status;
                itemMoveData = await res.json();
            });

            await new Promise(r => setTimeout(r, 200));
            expect(itemMoveCompleted).toBe(false);

            // Client B commits deletion of category B
            await clientB.query('COMMIT');
            clientB.release();

            // Client A unblocks and gets 400 CATEGORY_NOT_FOUND
            await movePromise;
            expect(itemMoveStatus).toBe(400);
            expect(itemMoveData.code || itemMoveData.error).toBe('CATEGORY_NOT_FOUND');

            // Verify item remains safely in category A
            const itemCheck = await query(`SELECT category_id FROM menu_items WHERE id = $1`, [itemId]);
            expect(itemCheck.rows[0].category_id).toBe(catAId);
        });
    });
});
