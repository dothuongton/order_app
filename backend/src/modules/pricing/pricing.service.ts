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
                throw new Error(`Món không tồn tại trong quán (ID: ${item.menuItemId})`);
            }
            if (!dbItem.isAvailable) {
                throw new Error(`Món "${dbItem.name}" hiện đã hết hàng`);
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
                current_redemptions, priority
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

        // 4. Distribute discount proportionally across order items
        let allocatedDiscount = 0;
        const calculatedItems: CalculatedOrderItem[] = lineItems.map((li, index) => {
            let itemDiscount = 0;
            if (bestDiscount > 0 && rawSubtotal > 0) {
                if (index === lineItems.length - 1) {
                    // Last item absorbs remaining difference to avoid rounding loss
                    itemDiscount = bestDiscount - allocatedDiscount;
                } else {
                    itemDiscount = Math.floor((li.lineSubtotal / rawSubtotal) * bestDiscount);
                    allocatedDiscount += itemDiscount;
                }
            }

            const itemFinal = Math.max(0, li.lineSubtotal - itemDiscount);

            return {
                menuItemId: li.menuItemId,
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
            throw new Error('Chương trình khuyến mãi đã hết lượt sử dụng đồng thời');
        }

        // Record redemption history
        await client.query(`
            INSERT INTO promotion_redemptions (tenant_id, promotion_id, order_id, session_id, discount_amount)
            VALUES ($1, $2, $3, $4, $5)
        `, [tenantId, promotionId, orderId, sessionId, discountAmount]);
    }
}
