import { describe, it, expect, beforeAll } from 'vitest';
import { query, withTransaction } from '../../db/pool.js';
import { seed } from '../../db/seed.js';
import { PricingService } from '../../modules/pricing/pricing.service.js';

describe('BUS-01: Strict Option Groups & Cardinality Validation (Issue #8)', () => {
    let tenantId: string;
    let itemMilkTeaId: string;
    let itemSnackId: string;
    let sugarGroupId: string;
    let sugarOption50Id: string;
    let sugarOption100Id: string;
    let toppingGroupId: string;
    let toppingPearlId: string;
    let inactiveGroupId: string;
    let inactiveOptionId: string;

    beforeAll(async () => {
        await seed();

        const tenantRes = await query(`SELECT id FROM tenants WHERE slug = 'pho-co'`);
        tenantId = tenantRes.rows[0].id;

        const itemsRes = await query(`SELECT id, name FROM menu_items WHERE tenant_id = $1`, [tenantId]);
        itemMilkTeaId = itemsRes.rows[0].id;
        itemSnackId = itemsRes.rows[1].id;

        // Create option groups for itemMilkTea:
        // 1. Sugar (SINGLE, required: min 1, max 1, FREE)
        const g1 = await query(`
            INSERT INTO item_option_groups (tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, is_active)
            VALUES ($1, $2, 'Độ Ngọt', 'SINGLE', 1, 1, 'FREE', true)
            RETURNING id
        `, [tenantId, itemMilkTeaId]);
        sugarGroupId = g1.rows[0].id;

        const o1 = await query(`
            INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_available)
            VALUES ($1, $2, $3, '50% Đường', 0, true)
            RETURNING id
        `, [tenantId, sugarGroupId, itemMilkTeaId]);
        sugarOption50Id = o1.rows[0].id;

        const o2 = await query(`
            INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_available)
            VALUES ($1, $2, $3, '100% Đường', 0, true)
            RETURNING id
        `, [tenantId, sugarGroupId, itemMilkTeaId]);
        sugarOption100Id = o2.rows[0].id;

        // 2. Topping (MULTIPLE, optional: min 0, max 3, ADDITIVE)
        const g2 = await query(`
            INSERT INTO item_option_groups (tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, is_active)
            VALUES ($1, $2, 'Topping Thêm', 'MULTIPLE', 0, 3, 'ADDITIVE', true)
            RETURNING id
        `, [tenantId, itemMilkTeaId]);
        toppingGroupId = g2.rows[0].id;

        const o3 = await query(`
            INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_available)
            VALUES ($1, $2, $3, 'Trân Châu Hoàng Kim', 10000, true)
            RETURNING id
        `, [tenantId, toppingGroupId, itemMilkTeaId]);
        toppingPearlId = o3.rows[0].id;

        // 3. Inactive Group
        const g3 = await query(`
            INSERT INTO item_option_groups (tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, is_active)
            VALUES ($1, $2, 'Nhóm Tạm Ngưng', 'SINGLE', 0, 1, 'FREE', false)
            RETURNING id
        `, [tenantId, itemMilkTeaId]);
        inactiveGroupId = g3.rows[0].id;

        const o4 = await query(`
            INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_available)
            VALUES ($1, $2, $3, 'Option Đóng', 0, true)
            RETURNING id
        `, [tenantId, inactiveGroupId, itemMilkTeaId]);
        inactiveOptionId = o4.rows[0].id;
    });

    it('Case 1: rejects option belonging to a different menu item', async () => {
        await withTransaction(async (client) => {
            // Attempt to order itemSnack with sugarOption50Id (which belongs to itemMilkTea)
            await expect(PricingService.calculateOrderPricing(client, tenantId, [
                {
                    menuItemId: itemSnackId,
                    quantity: 1,
                    optionIds: [sugarOption50Id]
                }
            ])).rejects.toMatchObject({ code: 'INVALID_OPTION' });
        });
    });

    it('Case 2: rejects order when required option group (min_selections >= 1) is omitted', async () => {
        await withTransaction(async (client) => {
            // Attempt to order itemMilkTea without any sugar option (min_selections = 1)
            await expect(PricingService.calculateOrderPricing(client, tenantId, [
                {
                    menuItemId: itemMilkTeaId,
                    quantity: 1,
                    optionIds: []
                }
            ])).rejects.toMatchObject({ code: 'OPTION_REQUIRED' });
        });
    });

    it('Case 3: rejects order when selecting more than 1 option in a SINGLE group', async () => {
        await withTransaction(async (client) => {
            // Attempt to select both 50% and 100% sugar in SINGLE group
            await expect(PricingService.calculateOrderPricing(client, tenantId, [
                {
                    menuItemId: itemMilkTeaId,
                    quantity: 1,
                    optionIds: [sugarOption50Id, sugarOption100Id]
                }
            ])).rejects.toMatchObject({ code: 'INVALID_OPTION' });
        });
    });

    it('Case 4: rejects non-existent / fake option UUID', async () => {
        await withTransaction(async (client) => {
            const fakeId = '00000000-0000-0000-0000-000000000000';
            await expect(PricingService.calculateOrderPricing(client, tenantId, [
                {
                    menuItemId: itemMilkTeaId,
                    quantity: 1,
                    optionIds: [sugarOption50Id, fakeId]
                }
            ])).rejects.toMatchObject({ code: 'INVALID_OPTION' });
        });
    });

    it('Case 5: rejects option in an inactive group', async () => {
        await withTransaction(async (client) => {
            await expect(PricingService.calculateOrderPricing(client, tenantId, [
                {
                    menuItemId: itemMilkTeaId,
                    quantity: 1,
                    optionIds: [sugarOption50Id, inactiveOptionId]
                }
            ])).rejects.toMatchObject({ code: 'INVALID_OPTION' });
        });
    });

    it('Happy path: accepts valid options and accurately applies price adjustments', async () => {
        await withTransaction(async (client) => {
            const pricing = await PricingService.calculateOrderPricing(client, tenantId, [
                {
                    menuItemId: itemMilkTeaId,
                    quantity: 2,
                    optionIds: [sugarOption50Id, toppingPearlId]
                }
            ]);

            expect(pricing.items).toHaveLength(1);
            expect(pricing.items[0].variantName).toContain('50% Đường');
            expect(pricing.items[0].variantName).toContain('Trân Châu Hoàng Kim');
            // Base price + 10,000đ topping
            expect(pricing.items[0].basePrice).toBeGreaterThan(10000);
        });
    });
});
