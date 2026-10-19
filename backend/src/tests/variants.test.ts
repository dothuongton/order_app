import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../app.js';
import { query } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { StaffService } from '../modules/staff/staff.service.js';
import { GuestService } from '../modules/guest/guest.service.js';

describe('Product Variants Management and Ordering (Max 3 Variants)', () => {
    let server: http.Server;
    let baseUrl: string;
    let tenantId: string;
    let managerToken: string;
    let categoryId: string;
    let tableA01Id: string;
    let waiterId: string;
    let createdItemId: string;
    let variantSizeLId: string;
    let variantNoSugarId: string;

    beforeAll(async () => {
        await seed();
        await query('UPDATE promotions SET is_active = false');

        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        const tenantRes = await query(`SELECT id FROM tenants WHERE slug = 'pho-co'`);
        tenantId = tenantRes.rows[0].id;

        const catRes = await query(`SELECT id FROM menu_categories WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        categoryId = catRes.rows[0].id;

        const tableRes = await query(`SELECT id FROM tables WHERE tenant_id = $1 AND table_number = 'A01'`, [tenantId]);
        tableA01Id = tableRes.rows[0].id;

        const usersRes = await query(`SELECT id, email FROM users`);
        waiterId = usersRes.rows.find(u => u.email === 'phucvu@phoco.vn')!.id;

        // Login as manager
        const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@phoco.vn', password: '123456' })
        });
        const loginData: any = await loginRes.json();
        managerToken = loginData.token;
    });

    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('1. Rejects creating a product with more than 3 variants', async () => {
        const res = await fetch(`${baseUrl}/api/v1/staff/menu/items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${managerToken}`
            },
            body: JSON.stringify({
                name: 'Trà Sữa Trân Châu',
                category_id: categoryId,
                price: 30000,
                variants: [
                    { name: 'Size M', price_adjustment: 0 },
                    { name: 'Size L', price_adjustment: 5000 },
                    { name: 'Không đường', price_adjustment: 0 },
                    { name: 'Nhiều đá', price_adjustment: 0 } // 4th variant
                ]
            })
        });

        const data: any = await res.json();
        expect(res.status).toBe(400);
        expect(data.message).toContain('tối đa 3');
    });

    it('2. Successfully creates a product with up to 3 variants', async () => {
        const res = await fetch(`${baseUrl}/api/v1/staff/menu/items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${managerToken}`
            },
            body: JSON.stringify({
                name: 'Trà Sữa Đặc Biệt',
                category_id: categoryId,
                price: 35000,
                variants: [
                    { name: 'Size L (+10k)', price_adjustment: 10000, is_available: true },
                    { name: 'Không đường', price_adjustment: 0, is_available: true },
                    { name: 'Ít đá', price_adjustment: 0, is_available: true }
                ]
            })
        });

        const data: any = await res.json();
        expect(res.status).toBe(201);
        expect(data.item).toBeDefined();
        createdItemId = data.item.id;

        // Verify variants are returned in GET /menu/items
        const getRes = await fetch(`${baseUrl}/api/v1/staff/menu/items`, {
            headers: { 'Authorization': `Bearer ${managerToken}` }
        });

        const getData: any = await getRes.json();
        expect(getRes.status).toBe(200);
        const item = getData.items.find((i: any) => i.id === createdItemId);
        expect(item).toBeDefined();
        expect(item.variants.length).toBe(3);
        const sizeL = item.variants.find((v: any) => v.name.includes('Size L'));
        expect(sizeL).toBeDefined();
        expect(Number(sizeL.price_adjustment)).toBe(10000);
        variantSizeLId = sizeL.id;

        const noSugar = item.variants.find((v: any) => v.name === 'Không đường');
        expect(noSugar).toBeDefined();
        variantNoSugarId = noSugar.id;
    });

    it('3. Public guest menu fetches active variants for items', async () => {
        const publicData = await GuestService.getPublicTableMenu('qr-phoco-a01');
        expect(publicData).not.toBeNull();
        const item = publicData!.menuItems.find((i: any) => i.id === createdItemId);
        expect(item).toBeDefined();
        expect(item.variants).toBeDefined();
        expect(item.variants.length).toBe(3);
    });

    it('4. Guest orders item with variant and price includes variant price adjustment', async () => {
        // Open session for table A01
        await StaffService.openSession(tenantId, tableA01Id, waiterId);
        const joinRes = await GuestService.joinSession('qr-phoco-a01');
        const sessionId = joinRes.sessionId;

        // Order 2x 'Trà Sữa Đặc Biệt' with Size L (+10.000đ per cup => 35.000 + 10.000 = 45.000đ each)
        const orderRes = await GuestService.createOrder(tenantId, sessionId, tableA01Id, {
            idempotencyKey: 'test-variant-order-key-1',
            items: [
                {
                    menuItemId: createdItemId,
                    variantId: variantSizeLId,
                    quantity: 2,
                    note: 'Giao sớm'
                }
            ]
        });

        expect(orderRes.orderId).toBeDefined();
        expect(orderRes.items.length).toBe(1);
        expect(orderRes.items[0].variantName).toContain('Size L');
        expect(orderRes.items[0].price).toBe(45000); // 35k base + 10k adjustment

        // Check Bill Summary
        const billSummary = await GuestService.getBillSummary(tenantId, sessionId);
        expect(billSummary.rounds.length).toBe(1);
        const billItem = billSummary.rounds[0].items[0];
        expect(billItem.variantName).toContain('Size L');
        expect(billItem.price).toBe(45000);
        expect(billItem.subtotal).toBe(90000); // 45.000 * 2
    });

    it('5. Updating variants modifies existing variants up to 3', async () => {
        const updateRes = await fetch(`${baseUrl}/api/v1/staff/menu/items/${createdItemId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${managerToken}`
            },
            body: JSON.stringify({
                name: 'Trà Sữa Đặc Biệt (Cập nhật)',
                variants: [
                    { name: 'Size Khổng Lồ', price_adjustment: 15000, is_available: true }
                ]
            })
        });

        expect(updateRes.status).toBe(200);

        // Verify updated variants
        const getRes = await fetch(`${baseUrl}/api/v1/staff/menu/items`, {
            headers: { 'Authorization': `Bearer ${managerToken}` }
        });

        const getData: any = await getRes.json();
        const item = getData.items.find((i: any) => i.id === createdItemId);
        expect(item.name).toBe('Trà Sữa Đặc Biệt (Cập nhật)');
        expect(item.variants.length).toBe(1);
        expect(item.variants[0].name).toBe('Size Khổng Lồ');
        expect(Number(item.variants[0].price_adjustment)).toBe(15000);
    });
});
