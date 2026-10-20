import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../app.js';
import { query } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { GuestService } from '../modules/guest/guest.service.js';
import { StaffService } from '../modules/staff/staff.service.js';

describe('Flexible Option Groups & Product Reordering (OPT-01, PROD-01, PROD-02)', () => {
    let server: http.Server;
    let baseUrl: string;
    let tenantId: string;
    let managerToken: string;
    let waiterId: string;
    let tableA01Id: string;
    let categoryId: string;
    let createdItemId: string;

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

        const tableRes = await query(`SELECT id FROM tables WHERE tenant_id = $1 AND table_number = 'A01'`, [tenantId]);
        tableA01Id = tableRes.rows[0].id;

        const catRes = await query(`SELECT id FROM menu_categories WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        categoryId = catRes.rows[0].id;

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

    it('1. Successfully creates product with 5 option groups including FREE and ADDITIVE pricing', async () => {
        const res = await fetch(`${baseUrl}/api/v1/staff/menu/items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${managerToken}`
            },
            body: JSON.stringify({
                name: 'Trà Sữa Hoàng Gia 5 Tầng',
                category_id: categoryId,
                price: 40000,
                option_groups: [
                    {
                        name: 'Kích cỡ',
                        selection_mode: 'SINGLE',
                        pricing_mode: 'ADDITIVE',
                        min_selections: 1,
                        max_selections: 1,
                        options: [
                            { name: 'Size M', price_delta: 0, is_default: true },
                            { name: 'Size L', price_delta: 8000 }
                        ]
                    },
                    {
                        name: 'Độ ngọt',
                        selection_mode: 'SINGLE',
                        pricing_mode: 'FREE',
                        min_selections: 1,
                        max_selections: 1,
                        options: [
                            { name: '100% đường', price_delta: 5000, is_default: true }, // Should be forced to 0
                            { name: '50% đường', price_delta: 0 },
                            { name: 'Không đường', price_delta: 0 }
                        ]
                    },
                    {
                        name: 'Lượng đá',
                        selection_mode: 'SINGLE',
                        pricing_mode: 'FREE',
                        min_selections: 1,
                        max_selections: 1,
                        options: [
                            { name: 'Đá chung', price_delta: 0, is_default: true },
                            { name: 'Đá riêng', price_delta: 0 },
                            { name: 'Không đá', price_delta: 0 }
                        ]
                    },
                    {
                        name: 'Topping thêm',
                        selection_mode: 'MULTIPLE',
                        pricing_mode: 'ADDITIVE',
                        min_selections: 0,
                        max_selections: 5,
                        options: [
                            { name: 'Trân châu đen', price_delta: 5000 },
                            { name: 'Trân châu trắng', price_delta: 7000 },
                            { name: 'Thạch pudding', price_delta: 6000 }
                        ]
                    },
                    {
                        name: 'Ghi chú đóng gói',
                        selection_mode: 'SINGLE',
                        pricing_mode: 'FREE',
                        min_selections: 0,
                        max_selections: 1,
                        options: [
                            { name: 'Ly giấy', price_delta: 0 },
                            { name: 'Quai xách', price_delta: 0 }
                        ]
                    }
                ]
            })
        });

        expect(res.status).toBe(201);
        const data: any = await res.json();
        expect(data.item).toBeDefined();
        createdItemId = data.item.id;
        expect(data.item.option_groups.length).toBe(5);

        // Check FREE pricing mode forced price_delta = 0
        const sugarGroup = data.item.option_groups.find((g: any) => g.name === 'Độ ngọt');
        expect(sugarGroup.pricing_mode).toBe('FREE');
        expect(sugarGroup.options[0].price_delta).toBe(0);
    });

    it('2. Fetching item details via GET /menu/items/:id returns full option groups', async () => {
        const res = await fetch(`${baseUrl}/api/v1/staff/menu/items/${createdItemId}`, {
            headers: { 'Authorization': `Bearer ${managerToken}` }
        });
        expect(res.status).toBe(200);
        const data: any = await res.json();
        expect(data.item.id).toBe(createdItemId);
        expect(data.item.option_groups.length).toBe(5);
        expect(data.item.variant_groups.length).toBe(5); // Backward compatible mapping
    });

    it('3. Guest menu returns option_groups with sorted order', async () => {
        const publicData = await GuestService.getPublicTableMenu('qr-phoco-a01');
        const item = publicData!.menuItems.find((i: any) => i.id === createdItemId);
        expect(item).toBeDefined();
        expect(item.option_groups.length).toBe(5);
        expect(item.sort_order).toBeDefined();
    });

    it('4. Reordering items in a category via POST /menu/reorder updates sort_order', async () => {
        const getRes = await fetch(`${baseUrl}/api/v1/staff/menu/items`, {
            headers: { 'Authorization': `Bearer ${managerToken}` }
        });
        const getData: any = await getRes.json();
        const catItems = getData.items.filter((i: any) => i.category_id === categoryId);
        expect(catItems.length).toBeGreaterThan(1);

        const reversedIds = catItems.map((i: any) => i.id).reverse();
        const reorderRes = await fetch(`${baseUrl}/api/v1/staff/menu/reorder`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${managerToken}`
            },
            body: JSON.stringify({
                categoryId,
                itemIds: reversedIds
            })
        });

        expect(reorderRes.status).toBe(200);

        // Fetch again and verify order
        const getRes2 = await fetch(`${baseUrl}/api/v1/staff/menu/items`, {
            headers: { 'Authorization': `Bearer ${managerToken}` }
        });
        const getData2: any = await getRes2.json();
        const catItems2 = getData2.items.filter((i: any) => i.category_id === categoryId);
        expect(catItems2[0].id).toBe(reversedIds[0]);
    });

    it('5. Guest can order item with multiple options and pricing is calculated accurately', async () => {
        await StaffService.openSession(tenantId, tableA01Id, waiterId);
        const joinRes = await GuestService.joinSession('qr-phoco-a01');
        const sessionId = joinRes.sessionId;

        // Fetch item options
        const item = (await GuestService.getPublicTableMenu('qr-phoco-a01'))!.menuItems.find((i: any) => i.id === createdItemId);
        const sizeL = item.option_groups.find((g: any) => g.name === 'Kích cỡ').options.find((o: any) => o.name === 'Size L'); // +8000
        const noSugar = item.option_groups.find((g: any) => g.name === 'Độ ngọt').options.find((o: any) => o.name === 'Không đường'); // +0 (FREE)
        const boba = item.option_groups.find((g: any) => g.name === 'Topping thêm').options.find((o: any) => o.name === 'Trân châu đen'); // +5000
        const pudding = item.option_groups.find((g: any) => g.name === 'Topping thêm').options.find((o: any) => o.name === 'Thạch pudding'); // +6000

        // Base 40,000 + 8,000 (Size L) + 0 (No sugar) + 5,000 (Boba) + 6,000 (Pudding) = 59,000đ each
        const orderRes = await GuestService.createOrder(tenantId, sessionId, tableA01Id, {
            idempotencyKey: 'test-multi-option-order-1',
            items: [
                {
                    menuItemId: createdItemId,
                    optionIds: [sizeL.id, noSugar.id, boba.id, pudding.id],
                    quantity: 2,
                    note: 'Ít đá'
                }
            ]
        });

        expect(orderRes.orderId).toBeDefined();
        expect(orderRes.items[0].price).toBe(59000);
        expect(orderRes.items[0].variantName).toContain('Size L');
        expect(orderRes.items[0].variantName).toContain('Trân châu đen');

        const billSummary = await GuestService.getBillSummary(tenantId, sessionId);
        const line = billSummary.rounds[0].items[0];
        expect(line.price).toBe(59000);
        expect(line.subtotal).toBe(118000); // 59,000 * 2
    });

    it('6. Applies promotion to total bill across multiple small order rounds', async () => {
        // Create a promotion with min_order_amount = 200,000đ (10% off, max 50k)
        const promoRes = await query(`
            INSERT INTO promotions (tenant_id, title, code, discount_type, discount_value, min_order_amount, max_discount_amount, is_active, priority)
            VALUES ($1, 'Giảm 10% đơn từ 200k', 'GIAM10', 'PERCENT', 10, 200000, 50000, true, 100)
            RETURNING id
        `, [tenantId]);
        const promoId = promoRes.rows[0].id;

        const tableB01Res = await query(`SELECT id FROM tables WHERE tenant_id = $1 AND table_number = 'A02'`, [tenantId]);
        const tableA02Id = tableB01Res.rows[0].id;

        const openRes = await StaffService.openSession(tenantId, tableA02Id, waiterId);
        const sessId = openRes.sessionId;

        // Round 1: 120,000đ (< 200,000đ)
        const round1 = await GuestService.createOrder(tenantId, sessId, tableA02Id, {
            idempotencyKey: 'test-session-promo-round-1',
            items: [{ menuItemId: createdItemId, quantity: 3 }] // 3 * 40,000 = 120,000đ
        });
        await StaffService.acceptOrderItem(tenantId, round1.items[0].id, 3, waiterId);

        // Bill summary after round 1: total = 120,000 (< 200k), no discount yet
        const summary1 = await GuestService.getBillSummary(tenantId, sessId);
        expect(summary1.rawBillTotal).toBe(120000);
        expect(summary1.totalDiscount).toBe(0);
        expect(summary1.validBillTotal).toBe(120000);

        // Round 2: 120,000đ (< 200,000đ by itself, but total becomes 240,000đ >= 200,000đ!)
        const round2 = await GuestService.createOrder(tenantId, sessId, tableA02Id, {
            idempotencyKey: 'test-session-promo-round-2',
            items: [{ menuItemId: createdItemId, quantity: 3 }] // 3 * 40,000 = 120,000đ
        });
        await StaffService.acceptOrderItem(tenantId, round2.items[0].id, 3, waiterId);

        // Bill summary after round 2: total (240,000đ) >= 200,000đ => 10% promo applies on total bill!
        const totalRaw = 240000;
        const expectedDiscount = Math.floor(totalRaw * 10 / 100); // 24,000đ
        const expectedValid = totalRaw - expectedDiscount; // 216,000đ

        const summary2 = await GuestService.getBillSummary(tenantId, sessId);
        expect(summary2.rawBillTotal).toBe(totalRaw);
        expect(summary2.totalDiscount).toBe(expectedDiscount);
        expect(summary2.validBillTotal).toBe(expectedValid);
        expect(summary2.appliedPromotions[0].title).toBe('Giảm 10% đơn từ 200k');

        // Staff serves all items and settles payment
        await StaffService.serveOrderItem(tenantId, round1.items[0].id, 3, waiterId);
        await StaffService.serveOrderItem(tenantId, round2.items[0].id, 3, waiterId);

        const summaryFinal = await GuestService.getBillSummary(tenantId, sessId);
        expect(summaryFinal.validBillTotal).toBe(expectedValid);
        expect(summaryFinal.totalDiscount).toBe(expectedDiscount);

        const settlement = await StaffService.confirmPaymentAndCloseSession(tenantId, sessId, summaryFinal.settlementVersion, waiterId);
        expect(settlement.totalAmount).toBe(expectedValid);

        // Cleanup
        await query('UPDATE promotions SET is_active = false WHERE id = $1', [promoId]);
    });
});
