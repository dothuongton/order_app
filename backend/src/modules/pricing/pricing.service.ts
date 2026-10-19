import { PoolClient } from 'pg';

export interface OrderItemInput {
    menuItemId: string;
    quantity: number;
    note?: string;
}

export interface CalculatedOrderItem {
    menuItemId: string;
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
        const itemIds = items.map(i => i.menuItemId);
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

        // Validate all items exist and are available
        let rawSubtotal = 0;
        const lineItems: {
            menuItemId: string;
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

            const lineSub = dbItem.price * item.quantity;
            rawSubtotal += lineSub;
            lineItems.push({
                menuItemId: item.menuItemId,
                name: dbItem.name,
                basePrice: dbItem.price,
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
                current_redemptions, priority, scope, applicable_item_ids
            FROM promotions
            WHERE tenant_id = $1 
              AND is_active = true
              AND NOW() >= start_time
              AND (end_time IS NULL OR NOW() <= end_time)
              AND (max_redemptions IS NULL OR current_redemptions < max_redemptions)
            ORDER BY priority DESC, created_at ASC
        `, [tenantId]);

        // 3. Evaluate each promotion (Non-stacking single best deal)
        let bestPromo: any = null;
        let bestDiscount = 0;

        for (const promo of promosRes.rows) {
            const isSpecific = promo.scope === 'SPECIFIC_ITEMS';
            const applicableSet = new Set<string>(promo.applicable_item_ids || []);
            const eligibleLines = isSpecific
                ? lineItems.filter(li => applicableSet.has(li.menuItemId))
                : lineItems;

            if (eligibleLines.length === 0) {
                continue; // No matching items in order
            }

            const eligibleSubtotal = eligibleLines.reduce((sum, li) => sum + li.lineSubtotal, 0);

            const minOrder = parseInt(promo.min_order_amount || '0', 10);
            if (eligibleSubtotal < minOrder) {
                continue;
            }

            const discValue = parseInt(promo.discount_value, 10);
            let calculatedDiscount = 0;

            if (promo.discount_type === 'PERCENT') {
                calculatedDiscount = Math.floor((eligibleSubtotal * discValue) / 100);
                if (promo.max_discount_amount) {
                    const maxCap = parseInt(promo.max_discount_amount, 10);
                    calculatedDiscount = Math.min(calculatedDiscount, maxCap);
                }
            } else if (promo.discount_type === 'FIXED_AMOUNT') {
                calculatedDiscount = Math.min(discValue, eligibleSubtotal);
            }

            // Ensure discount is non-negative and doesn't exceed eligible subtotal
            calculatedDiscount = Math.max(0, Math.min(calculatedDiscount, eligibleSubtotal));

            // Best deal comparison: higher discount wins; if equal, higher priority wins
            if (
                calculatedDiscount > bestDiscount ||
                (calculatedDiscount === bestDiscount && calculatedDiscount > 0 && promo.priority > (bestPromo?.priority || 0))
            ) {
                bestDiscount = calculatedDiscount;
                bestPromo = promo;
            }
        }

        // Allocate discount across eligible lines using largest-remainder algorithm
        const isBestSpecific = bestPromo?.scope === 'SPECIFIC_ITEMS';
        const bestApplicableSet = new Set<string>(bestPromo?.applicable_item_ids || []);

        const eligibleIndices: number[] = [];
        lineItems.forEach((li, idx) => {
            if (!isBestSpecific || bestApplicableSet.has(li.menuItemId)) {
                eligibleIndices.push(idx);
            }
        });

        const targetSubtotal = eligibleIndices.reduce((sum, idx) => sum + lineItems[idx].lineSubtotal, 0);
        const discounts = new Array(lineItems.length).fill(0);

        if (bestDiscount > 0 && targetSubtotal > 0) {
            eligibleIndices.forEach(idx => {
                const li = lineItems[idx];
                discounts[idx] = Number(BigInt(li.lineSubtotal) * BigInt(bestDiscount) / BigInt(targetSubtotal));
            });

            let remainder = bestDiscount - discounts.reduce((sum, value) => sum + value, 0);
            const allocationOrder = eligibleIndices.map(idx => ({
                index: idx,
                remainder: (BigInt(lineItems[idx].lineSubtotal) * BigInt(bestDiscount)) % BigInt(targetSubtotal)
            })).sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);

            for (const { index } of allocationOrder) {
                if (remainder <= 0) break;
                if (discounts[index] < lineItems[index].lineSubtotal) {
                    discounts[index]++;
                    remainder--;
                }
            }
        }

        const calculatedItems: CalculatedOrderItem[] = lineItems.map((li, index) => {
            const itemDiscount = discounts[index];
            const itemFinal = Math.max(0, li.lineSubtotal - itemDiscount);
            const isApplied = itemDiscount > 0 || (bestPromo && (!isBestSpecific || bestApplicableSet.has(li.menuItemId)));

            return {
                menuItemId: li.menuItemId,
                name: li.name,
                basePrice: li.basePrice,
                quantity: li.quantity,
                subtotal: li.lineSubtotal,
                discountAmount: itemDiscount,
                finalPrice: itemFinal,
                appliedPromotionId: isApplied ? bestPromo.id : null,
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
