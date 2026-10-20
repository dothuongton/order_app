import { PoolClient } from 'pg';

export interface OrderItemInput {
    menuItemId: string;
    variantId?: string;
    variantIds?: string[];
    optionIds?: string[];
    quantity: number;
    note?: string;
}

export interface CalculatedOrderItem {
    menuItemId: string;
    variantId?: string;
    variantName?: string;
    name: string;
    basePrice: number;
    quantity: number;
    subtotal: number;
    discountAmount: number;
    finalPrice: number;
    appliedPromotionId: string | null;
    note?: string;
}

export interface CalculatedOrderPricing {
    items: CalculatedOrderItem[];
    subtotal: number;
    discountTotal: number;
    finalTotal: number;
    appliedPromotion: {
        id: string;
        title: string;
        code: string | null;
        discountType: string;
        discountValue: number;
        discountAmount: number;
    } | null;
}

export class PricingService {
    /**
     * Calculate order prices and promotions safely on server-side.
     * Uses single best-deal policy (non-stacking).
     */
    static async calculateOrderPricing(
        client: PoolClient,
        tenantId: string,
        items: OrderItemInput[]
    ): Promise<CalculatedOrderPricing> {
        if (!items || items.length === 0) {
            throw new Error('Đơn hàng không có món nào');
        }

        // 1. Fetch real menu item data from database
        const itemIds = Array.from(new Set(items.map(i => i.menuItemId)));
        const itemsRes = await client.query(`
            SELECT id, name, price, is_available
            FROM menu_items
            WHERE tenant_id = $1 AND id = ANY($2::uuid[])
        `, [tenantId, itemIds]);

        const dbItemMap = new Map<string, { name: string; price: number; isAvailable: boolean }>();
        for (const row of itemsRes.rows) {
            dbItemMap.set(row.id, {
                name: row.name,
                price: parseInt(row.price, 10),
                isAvailable: row.is_available
            });
        }

        // 2. Fetch option groups for requested items
        const groupsRes = await client.query(`
            SELECT id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, is_active
            FROM item_option_groups
            WHERE tenant_id = $1 AND menu_item_id = ANY($2::uuid[])
            ORDER BY sort_order ASC
        `, [tenantId, itemIds]);

        const itemGroupsMap = new Map<string, any[]>();
        const groupByIdMap = new Map<string, any>();
        for (const g of groupsRes.rows) {
            if (!itemGroupsMap.has(g.menu_item_id)) {
                itemGroupsMap.set(g.menu_item_id, []);
            }
            const groupObj = {
                id: g.id,
                menuItemId: g.menu_item_id,
                name: g.name,
                selectionMode: g.selection_mode,
                minSelections: parseInt(g.min_selections, 10) || 0,
                maxSelections: parseInt(g.max_selections, 10) || 1,
                pricingMode: g.pricing_mode,
                isActive: g.is_active,
                options: [] as any[]
            };
            itemGroupsMap.get(g.menu_item_id)!.push(groupObj);
            groupByIdMap.set(g.id, groupObj);
        }

        // 3. Fetch item_options with group details
        const optionsRes = await client.query(`
            SELECT io.id, io.group_id, io.menu_item_id, io.name, io.price_delta, io.is_default, io.is_available,
                   iog.selection_mode, iog.pricing_mode, iog.is_active as group_is_active, iog.name as group_name
            FROM item_options io
            JOIN item_option_groups iog ON iog.id = io.group_id
            WHERE io.tenant_id = $1 AND io.menu_item_id = ANY($2::uuid[])
            ORDER BY io.sort_order ASC
        `, [tenantId, itemIds]);

        const itemOptionsMap = new Map<string, any>();
        for (const o of optionsRes.rows) {
            const optObj = {
                id: o.id,
                groupId: o.group_id,
                menuItemId: o.menu_item_id,
                name: o.name,
                priceDelta: parseInt(o.price_delta, 10) || 0,
                isDefault: Boolean(o.is_default),
                isAvailable: Boolean(o.is_available),
                selectionMode: o.selection_mode,
                pricingMode: o.pricing_mode,
                groupIsActive: Boolean(o.group_is_active),
                groupName: o.group_name
            };
            itemOptionsMap.set(o.id, optObj);
            const parentGroup = groupByIdMap.get(o.group_id);
            if (parentGroup) {
                parentGroup.options.push(optObj);
            }
        }

        // 4. Fetch legacy variants for requested items
        const legacyVariantsRes = await client.query(`
            SELECT id, menu_item_id, name, price_adjustment, is_available
            FROM menu_item_variants
            WHERE tenant_id = $1 AND menu_item_id = ANY($2::uuid[])
        `, [tenantId, itemIds]);

        const itemLegacyVariantsMap = new Map<string, any>();
        for (const v of legacyVariantsRes.rows) {
            itemLegacyVariantsMap.set(v.id, {
                id: v.id,
                menuItemId: v.menu_item_id,
                name: v.name,
                priceAdjustment: parseInt(v.price_adjustment, 10) || 0,
                isAvailable: v.is_available
            });
        }

        // 5. Validate all line items, enforce option groups, and calculate prices
        let rawSubtotal = 0;
        const lineItems: {
            menuItemId: string;
            variantId?: string;
            variantName?: string;
            name: string;
            basePrice: number;
            quantity: number;
            lineSubtotal: number;
            note?: string;
        }[] = [];

        for (const item of items) {
            const dbItem = dbItemMap.get(item.menuItemId);
            if (!dbItem) {
                throw { status: 400, code: 'ITEM_NOT_FOUND', message: 'Món không tồn tại trong quán' };
            }
            if (!dbItem.isAvailable) {
                throw { status: 409, code: 'ITEM_UNAVAILABLE', message: `Món "${dbItem.name}" hiện đã hết hàng` };
            }
            if (item.quantity <= 0) {
                throw new Error(`Số lượng món "${dbItem.name}" phải lớn hơn 0`);
            }

            const rawOptionIds = [
                ...(item.variantId ? [item.variantId] : []),
                ...(Array.isArray((item as any).variantIds) ? (item as any).variantIds : []),
                ...(Array.isArray((item as any).optionIds) ? (item as any).optionIds : [])
            ].filter(Boolean);

            if (rawOptionIds.length > 20) {
                throw { status: 400, code: 'TOO_MANY_OPTIONS', message: `Số lượng tùy chọn của món "${dbItem.name}" vượt quá giới hạn cho phép` };
            }

            const uniqueOptionIds = Array.from(new Set(rawOptionIds));
            if (uniqueOptionIds.length !== rawOptionIds.length) {
                throw { status: 400, code: 'DUPLICATE_OPTION', message: `Không thể chọn trùng lặp tùy chọn trong cùng một món "${dbItem.name}"` };
            }

            let itemPrice = dbItem.price;
            const variantNames: string[] = [];
            const groupSelectionsCount = new Map<string, number>();
            let legacyVariantCount = 0;

            for (const oid of uniqueOptionIds) {
                if (itemOptionsMap.has(oid)) {
                    const opt = itemOptionsMap.get(oid)!;
                    if (opt.menuItemId !== item.menuItemId) {
                        throw { status: 400, code: 'INVALID_OPTION', message: `Tùy chọn "${opt.name}" không thuộc về món "${dbItem.name}"` };
                    }
                    if (!opt.groupIsActive) {
                        throw { status: 400, code: 'INVALID_OPTION', message: `Nhóm tùy chọn "${opt.groupName}" hiện đang tạm ngừng phục vụ` };
                    }
                    if (!opt.isAvailable) {
                        throw { status: 409, code: 'VARIANT_UNAVAILABLE', message: `Tùy chọn "${opt.name}" của món "${dbItem.name}" hiện đã hết hàng` };
                    }

                    groupSelectionsCount.set(opt.groupId, (groupSelectionsCount.get(opt.groupId) || 0) + 1);
                    const delta = opt.pricingMode === 'FREE' ? 0 : opt.priceDelta;
                    itemPrice = Math.max(0, itemPrice + delta);
                    variantNames.push(opt.name);
                } else if (itemLegacyVariantsMap.has(oid)) {
                    const leg = itemLegacyVariantsMap.get(oid)!;
                    if (leg.menuItemId !== item.menuItemId) {
                        throw { status: 400, code: 'INVALID_OPTION', message: `Biến thể "${leg.name}" không thuộc về món "${dbItem.name}"` };
                    }
                    if (!leg.isAvailable) {
                        throw { status: 409, code: 'VARIANT_UNAVAILABLE', message: `Biến thể "${leg.name}" của món "${dbItem.name}" hiện đã hết hàng` };
                    }

                    legacyVariantCount++;
                    if (legacyVariantCount > 1) {
                        throw { status: 400, code: 'INVALID_OPTION', message: `Món "${dbItem.name}" chỉ được chọn tối đa 1 biến thể truyền thống` };
                    }

                    itemPrice = Math.max(0, itemPrice + leg.priceAdjustment);
                    variantNames.push(leg.name);
                } else {
                    throw { status: 400, code: 'INVALID_OPTION', message: `Mã tùy chọn không tồn tại hoặc không thuộc món "${dbItem.name}"` };
                }
            }

            // Enforce cardinality & constraints for all active groups belonging to this menu item
            const activeGroups = (itemGroupsMap.get(item.menuItemId) || []).filter((g: any) => g.isActive);
            for (const group of activeGroups) {
                let count = groupSelectionsCount.get(group.id) || 0;
                if (count === 0 && group.minSelections > 0) {
                    const defaultOption = group.options.find((o: any) => o.isDefault && o.isAvailable);
                    if (defaultOption) {
                        count = 1;
                        groupSelectionsCount.set(group.id, 1);
                        const delta = defaultOption.pricingMode === 'FREE' ? 0 : defaultOption.priceDelta;
                        itemPrice = Math.max(0, itemPrice + delta);
                        variantNames.push(defaultOption.name);
                    }
                }

                if (count < group.minSelections) {
                    throw {
                        status: 400,
                        code: 'OPTION_REQUIRED',
                        message: `Vui lòng chọn ít nhất ${group.minSelections} lựa chọn cho nhóm "${group.name}" của món "${dbItem.name}"`
                    };
                }
                if (group.selectionMode === 'SINGLE' && count > 1) {
                    throw {
                        status: 400,
                        code: 'INVALID_OPTION',
                        message: `Nhóm tùy chọn "${group.name}" chỉ cho phép chọn 1 lựa chọn duy nhất`
                    };
                }
                if (group.maxSelections > 0 && count > group.maxSelections) {
                    throw {
                        status: 400,
                        code: 'INVALID_OPTION',
                        message: `Nhóm tùy chọn "${group.name}" cho phép tối đa ${group.maxSelections} lựa chọn`
                    };
                }
            }

            const variantName = variantNames.length > 0 ? variantNames.join(', ') : undefined;
            const lineSub = itemPrice * item.quantity;
            rawSubtotal += lineSub;
            lineItems.push({
                menuItemId: item.menuItemId,
                variantId: item.variantId || uniqueOptionIds[0],
                variantName,
                name: dbItem.name,
                basePrice: itemPrice,
                quantity: item.quantity,
                lineSubtotal: lineSub,
                note: item.note
            });
        }

        // 2. Fetch active promotions for tenant
        const promosRes = await client.query(`
            SELECT 
                id, code, title, discount_type, discount_value,
                min_order_amount, max_discount_amount, max_redemptions,
                current_redemptions, priority
            FROM promotions
            WHERE tenant_id = $1 
              AND is_active = true
              AND (start_time IS NULL OR NOW() >= start_time)
              AND (end_time IS NULL OR NOW() <= end_time)
              AND (max_redemptions IS NULL OR current_redemptions < max_redemptions)
            ORDER BY priority DESC, created_at ASC
        `, [tenantId]);

        // 3. Evaluate each promotion (Non-stacking single best deal)
        let bestPromo: any = null;
        let bestDiscount = 0;

        for (const promo of promosRes.rows) {
            const minOrder = parseInt(promo.min_order_amount || '0', 10);
            if (rawSubtotal < minOrder) {
                continue;
            }

            const discValue = parseInt(promo.discount_value, 10);
            let calculatedDiscount = 0;

            if (promo.discount_type === 'PERCENT') {
                calculatedDiscount = Math.floor((rawSubtotal * discValue) / 100);
                if (promo.max_discount_amount) {
                    const maxCap = parseInt(promo.max_discount_amount, 10);
                    calculatedDiscount = Math.min(calculatedDiscount, maxCap);
                }
            } else if (promo.discount_type === 'FIXED_AMOUNT') {
                calculatedDiscount = Math.min(discValue, rawSubtotal);
            }

            // Ensure discount is non-negative and doesn't exceed subtotal
            calculatedDiscount = Math.max(0, Math.min(calculatedDiscount, rawSubtotal));

            // Best deal comparison: higher discount wins; if equal, higher priority wins
            if (
                calculatedDiscount > bestDiscount ||
                (calculatedDiscount === bestDiscount && calculatedDiscount > 0 && promo.priority > (bestPromo?.priority || 0))
            ) {
                bestDiscount = calculatedDiscount;
                bestPromo = promo;
            }
        }

        // Largest-remainder allocation preserves the exact discount without ever
        // assigning more than a line's subtotal, including many tiny-value lines.
        const discounts = lineItems.map(li => rawSubtotal > 0 ? Number(BigInt(li.lineSubtotal) * BigInt(bestDiscount) / BigInt(rawSubtotal)) : 0);
        let remainder = bestDiscount - discounts.reduce((sum, value) => sum + value, 0);
        const allocationOrder = lineItems.map((li, index) => ({ index, remainder: rawSubtotal > 0 ? (BigInt(li.lineSubtotal) * BigInt(bestDiscount)) % BigInt(rawSubtotal) : 0n }))
            .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
        for (const { index } of allocationOrder) {
            if (remainder <= 0) break;
            if (discounts[index] < lineItems[index].lineSubtotal) { discounts[index]++; remainder--; }
        }
        const calculatedItems: CalculatedOrderItem[] = lineItems.map((li, index) => {
            const itemDiscount = discounts[index];
            const itemFinal = Math.max(0, li.lineSubtotal - itemDiscount);

            return {
                menuItemId: li.menuItemId,
                variantId: li.variantId,
                variantName: li.variantName,
                name: li.name,
                basePrice: li.basePrice,
                quantity: li.quantity,
                subtotal: li.lineSubtotal,
                discountAmount: itemDiscount,
                finalPrice: itemFinal,
                appliedPromotionId: bestPromo ? bestPromo.id : null,
                note: li.note
            };
        });

        const finalTotal = Math.max(0, rawSubtotal - bestDiscount);

        return {
            items: calculatedItems,
            subtotal: rawSubtotal,
            discountTotal: bestDiscount,
            finalTotal,
            appliedPromotion: bestPromo ? {
                id: bestPromo.id,
                title: bestPromo.title,
                code: bestPromo.code,
                discountType: bestPromo.discount_type,
                discountValue: parseInt(bestPromo.discount_value, 10),
                discountAmount: bestDiscount
            } : null
        };
    }

    /**
     * Atomically redeem a promotion inside an order creation transaction
     */
    static async recordPromotionRedemption(
        client: PoolClient,
        tenantId: string,
        promotionId: string,
        orderId: string,
        sessionId: string,
        discountAmount: number
    ) {
        // Atomic increment with capacity check
        const updateRes = await client.query(`
            UPDATE promotions
            SET current_redemptions = current_redemptions + 1, updated_at = NOW()
            WHERE id = $1 AND tenant_id = $2
              AND (max_redemptions IS NULL OR current_redemptions < max_redemptions)
            RETURNING id, current_redemptions, max_redemptions
        `, [promotionId, tenantId]);

        if (updateRes.rows.length === 0) {
            throw { status: 409, code: 'PROMOTION_EXHAUSTED', message: 'Chương trình khuyến mãi đã hết lượt sử dụng; vui lòng gửi lại đơn' };
        }

        // Record redemption history
        await client.query(`
            INSERT INTO promotion_redemptions (tenant_id, promotion_id, order_id, session_id, discount_amount)
            VALUES ($1, $2, $3, $4, $5)
        `, [tenantId, promotionId, orderId, sessionId, discountAmount]);
    }
}
