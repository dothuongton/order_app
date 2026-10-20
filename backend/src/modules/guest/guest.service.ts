import { query, withTransaction } from '../../db/pool.js';
import { generateRandomToken, hashToken } from '../../utils/crypto.js';
import { checkIdempotency, recordIdempotency } from '../../utils/idempotency.js';
import { broadcastToStaff, broadcastToSession } from '../../realtime/socket.js';
import { PushService } from '../push/push.service.js';
import { PricingService } from '../pricing/pricing.service.js';

import { z } from 'zod';
import { validate, orderInputSchema } from '../../utils/validation.js';
import { partAmount } from '../../utils/billing.js';

export interface CreateOrderItemInput {
    menuItemId: string;
    quantity: number;
    note?: string;
}

export interface CreateOrderInput {
    idempotencyKey: string;
    items: CreateOrderItemInput[];
}

export class GuestService {
    // 1. Get public table menu & status
    static async getPublicTableMenu(publicQrId: string) {
        const tableRes = await query(`
            SELECT
                t.id as table_id,
                t.table_number,
                t.readiness,
                t.is_enabled,
                te.id as tenant_id,
                te.name as tenant_name,
                te.slug as tenant_slug,
                te.currency,
                te.status as tenant_status,
                te.description as tenant_description,
                te.logo_url as tenant_logo_url,
                te.cover_url as tenant_cover_url,
                te.phone as tenant_phone,
                te.address as tenant_address,
                te.opening_hours as tenant_opening_hours,
                te.active_template_id,
                te.active_theme_config,
                te.active_published_version
            FROM tables t
            JOIN tenants te ON te.id = t.tenant_id
            WHERE t.public_qr_id = $1
        `, [publicQrId]);

        if (tableRes.rows.length === 0) {
            return null;
        }

        const table = tableRes.rows[0];

        // Check active session
        const sessionRes = await query(`
            SELECT id, status, settlement_version, opened_at
            FROM table_sessions
            WHERE table_id = $1 AND status = 'OPEN'
        `, [table.table_id]);

        const activeSession = sessionRes.rows[0] || null;

        // Fetch categories and items
        const catRes = await query(`
            SELECT id, name, sort_order
            FROM menu_categories
            WHERE tenant_id = $1 AND is_active = true
            ORDER BY sort_order ASC, name ASC
        `, [table.tenant_id]);

        const itemsRes = await query(`
            SELECT
                mi.id,
                mi.category_id,
                mi.name,
                mi.description,
                mi.price,
                mi.image_url,
                mi.is_available,
                mi.sort_order,
                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', iog.id,
                                'name', iog.name,
                                'selection_mode', iog.selection_mode,
                                'selectionMode', iog.selection_mode,
                                'min_selections', iog.min_selections,
                                'minSelections', iog.min_selections,
                                'max_selections', iog.max_selections,
                                'maxSelections', iog.max_selections,
                                'pricing_mode', iog.pricing_mode,
                                'pricingMode', iog.pricing_mode,
                                'sort_order', iog.sort_order,
                                'sortOrder', iog.sort_order,
                                'options', COALESCE(
                                    (
                                        SELECT json_agg(
                                            json_build_object(
                                                'id', io.id,
                                                'name', io.name,
                                                'price_delta', io.price_delta,
                                                'priceDelta', io.price_delta,
                                                'is_default', io.is_default,
                                                'isDefault', io.is_default,
                                                'is_available', io.is_available,
                                                'isAvailable', io.is_available,
                                                'sort_order', io.sort_order,
                                                'sortOrder', io.sort_order
                                            ) ORDER BY io.sort_order ASC, io.price_delta ASC, io.name ASC
                                        )
                                        FROM item_options io
                                        WHERE io.group_id = iog.id AND io.is_available = true
                                    ),
                                    '[]'::json
                                )
                            ) ORDER BY iog.sort_order ASC, iog.created_at ASC
                        )
                        FROM item_option_groups iog
                        WHERE iog.menu_item_id = mi.id AND iog.tenant_id = $1 AND iog.is_active = true
                    ),
                    '[]'::json
                ) as option_groups,
                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', miv.id,
                                'group_name', COALESCE(miv.group_name, 'Biến thể'),
                                'name', miv.name,
                                'price_adjustment', miv.price_adjustment,
                                'is_available', miv.is_available
                            ) ORDER BY miv.group_name ASC, miv.price_adjustment ASC, miv.name ASC
                        )
                        FROM menu_item_variants miv
                        WHERE miv.menu_item_id = mi.id AND miv.tenant_id = $1 AND miv.is_available = true
                    ),
                    '[]'::json
                ) as variants
            FROM menu_items mi
            WHERE mi.tenant_id = $1
            ORDER BY mi.is_available DESC, mi.sort_order ASC, mi.name ASC, mi.id ASC
        `, [table.tenant_id]);

        // Fetch active banners for this shop
        const bannersRes = await query(`
            SELECT id, title, description, image_url, cta_link, sort_order
            FROM banners
            WHERE tenant_id = $1 AND is_active = true
              AND (start_time IS NULL OR start_time <= NOW()) AND (end_time IS NULL OR end_time >= NOW())
            ORDER BY sort_order ASC, created_at DESC
        `, [table.tenant_id]);

        // Fetch active promotions for this shop
        const promosRes = await query(`
            SELECT id, code, title, description, discount_type, discount_value, min_order_amount, max_discount_amount, priority
            FROM promotions
            WHERE tenant_id = $1 AND is_active = true
              AND (start_time IS NULL OR NOW() >= start_time)
              AND (end_time IS NULL OR NOW() <= end_time)
              AND (max_redemptions IS NULL OR current_redemptions < max_redemptions)
            ORDER BY priority DESC, created_at DESC
        `, [table.tenant_id]);

        return {
            tenant: {
                id: table.tenant_id,
                name: table.tenant_name,
                slug: table.tenant_slug,
                currency: table.currency,
                status: table.tenant_status || 'active',
                description: table.tenant_description,
                logoUrl: table.tenant_logo_url,
                coverUrl: table.tenant_cover_url,
                phone: table.tenant_phone,
                address: table.tenant_address,
                openingHours: table.tenant_opening_hours,
                activeTemplateId: table.active_template_id || 'classic',
                activeThemeConfig: table.active_theme_config || {},
                activePublishedVersion: table.active_published_version || 1
            },
            table: {
                id: table.table_id,
                tableNumber: table.table_number,
                readiness: table.readiness,
                isEnabled: table.is_enabled
            },
            session: activeSession ? {
                id: activeSession.id,
                status: activeSession.status,
                openedAt: activeSession.opened_at
            } : null,
            categories: catRes.rows,
            menuItems: itemsRes.rows.map(item => {
                const rawVariants = (item.variants || []).map((v: any) => ({
                    ...v,
                    group_name: v.group_name || 'Biến thể',
                    price_adjustment: parseInt(v.price_adjustment, 10) || 0
                }));
                const groupsMap = new Map<string, any[]>();
                for (const v of rawVariants) {
                    if (!groupsMap.has(v.group_name)) groupsMap.set(v.group_name, []);
                    groupsMap.get(v.group_name)!.push({
                        id: v.id,
                        name: v.name,
                        price_adjustment: v.price_adjustment,
                        is_available: v.is_available
                    });
                }
                const variant_groups = Array.from(groupsMap.entries()).map(([name, options]) => ({
                    name,
                    options
                }));

                const option_groups = (item.option_groups || []).map((g: any) => ({
                    id: g.id,
                    name: g.name,
                    selection_mode: g.selection_mode || g.selectionMode || 'SINGLE',
                    selectionMode: g.selection_mode || g.selectionMode || 'SINGLE',
                    min_selections: parseInt(g.min_selections ?? g.minSelections ?? 0, 10),
                    minSelections: parseInt(g.min_selections ?? g.minSelections ?? 0, 10),
                    max_selections: parseInt(g.max_selections ?? g.maxSelections ?? 1, 10),
                    maxSelections: parseInt(g.max_selections ?? g.maxSelections ?? 1, 10),
                    pricing_mode: g.pricing_mode || g.pricingMode || 'ADDITIVE',
                    pricingMode: g.pricing_mode || g.pricingMode || 'ADDITIVE',
                    sort_order: parseInt(g.sort_order ?? g.sortOrder ?? 0, 10),
                    sortOrder: parseInt(g.sort_order ?? g.sortOrder ?? 0, 10),
                    options: (g.options || []).map((o: any) => ({
                        id: o.id,
                        name: o.name,
                        price_delta: parseInt(o.price_delta ?? o.priceDelta ?? 0, 10),
                        priceDelta: parseInt(o.price_delta ?? o.priceDelta ?? 0, 10),
                        is_default: Boolean(o.is_default ?? o.isDefault),
                        isDefault: Boolean(o.is_default ?? o.isDefault),
                        is_available: Boolean(o.is_available ?? o.isAvailable ?? true),
                        isAvailable: Boolean(o.is_available ?? o.isAvailable ?? true),
                        sort_order: parseInt(o.sort_order ?? o.sortOrder ?? 0, 10),
                        sortOrder: parseInt(o.sort_order ?? o.sortOrder ?? 0, 10)
                    }))
                }));

                return {
                    ...item,
                    sort_order: parseInt(item.sort_order || '0', 10),
                    price: parseInt(item.price, 10),
                    variants: rawVariants,
                    variant_groups,
                    option_groups,
                    optionGroups: option_groups
                };
            }),
            banners: bannersRes.rows,
            promotions: promosRes.rows.map(p => ({
                id: p.id,
                code: p.code,
                title: p.title,
                description: p.description,
                discountType: p.discount_type,
                discount_type: p.discount_type,
                discountValue: parseInt(p.discount_value, 10),
                discount_value: parseInt(p.discount_value, 10),
                minOrderAmount: parseInt(p.min_order_amount || '0', 10),
                min_order_amount: parseInt(p.min_order_amount || '0', 10),
                maxDiscountAmount: p.max_discount_amount ? parseInt(p.max_discount_amount, 10) : undefined,
                max_discount_amount: p.max_discount_amount ? parseInt(p.max_discount_amount, 10) : undefined,
                priority: parseInt(p.priority || '0', 10)
            }))
        };
    }

    // 2. Join session
    static async joinSession(publicQrId: string, deviceFingerprint?: string) {
        validate(z.string().max(1000).optional(), deviceFingerprint);
        return withTransaction(async client => {
            const tableRes = await client.query(`
                SELECT
                    t.id as table_id,
                    t.tenant_id,
                    t.table_number,
                    t.is_enabled,
                    ts.id as session_id,
                    ts.status as session_status,
                    te.status as tenant_status
                FROM tables t
                JOIN tenants te ON te.id = t.tenant_id
                LEFT JOIN table_sessions ts ON ts.table_id = t.id AND ts.status = 'OPEN'
                WHERE t.public_qr_id = $1
            `, [publicQrId]);

            if (tableRes.rows.length === 0) {
                throw { status: 404, code: 'TABLE_NOT_FOUND', message: 'Không tìm thấy bàn tương ứng với mã QR' };
            }

            const row = tableRes.rows[0];
            if (row.tenant_status !== 'active') {
                throw {
                    status: 403,
                    code: 'SHOP_SUSPENDED',
                    message: 'Quán ăn hiện đang tạm ngừng hoạt động. Vui lòng liên hệ nhân viên.'
                };
            }

            if (!row.is_enabled) {
                throw { status: 400, code: 'TABLE_DISABLED', message: 'Bàn này hiện đang tạm ngừng sử dụng' };
            }

            if (!row.session_id || row.session_status !== 'OPEN') {
                throw {
                    status: 400,
                    code: 'SESSION_NOT_OPEN',
                    message: 'Bàn chưa được mở gọi món. Vui lòng liên hệ nhân viên'
                };
            }

            const locked = await client.query(`SELECT status FROM table_sessions WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [row.session_id, row.tenant_id]);
            if (locked.rows[0]?.status !== 'OPEN') throw { status: 409, code: 'SESSION_CLOSED', message: 'Phiên bàn đã kết thúc' };

            // Generate token and record guest_session
            const rawToken = generateRandomToken(32);
            const tokenHash = hashToken(rawToken);
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

            await client.query(`
                INSERT INTO guest_sessions (tenant_id, table_id, session_id, token_hash, device_fingerprint, expires_at)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [row.tenant_id, row.table_id, row.session_id, tokenHash, deviceFingerprint || null, expiresAt]);

            return {
                token: rawToken,
                tenantId: row.tenant_id,
                tableId: row.table_id,
                sessionId: row.session_id,
                tableNumber: row.table_number,
                expiresAt
            };
        });
    }

    // 3. Create Order (F02, F03, F04)
    static async createOrder(
        tenantId: string,
        sessionId: string,
        tableId: string,
        input: CreateOrderInput
    ) {
        input = validate(orderInputSchema, input);
        if (!input.items || input.items.length === 0) {
            throw { status: 400, code: 'EMPTY_ORDER', message: 'Giỏ hàng đang trống' };
        }

        return await withTransaction(async (client) => {
            // Lock session row FOR UPDATE
            const sessionRes = await client.query(`
                SELECT ts.id, ts.status, ts.settlement_version, ts.table_id, t.table_number
                FROM table_sessions ts
                JOIN tables t ON t.id = ts.table_id
                WHERE ts.id = $1 AND ts.tenant_id = $2
                FOR UPDATE OF ts
            `, [sessionId, tenantId]);

            if (sessionRes.rows.length === 0) {
                throw { status: 404, code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên bàn' };
            }

            // Check idempotency first
            const idempotency = await checkIdempotency(
                client,
                tenantId,
                'CREATE_ORDER',
                sessionId,
                input.idempotencyKey,
                input
            );
            if (idempotency.handled) {
                return idempotency.result;
            }

            const session = sessionRes.rows[0];
            if (session.status !== 'OPEN') {
                throw { status: 400, code: 'SESSION_CLOSED', message: 'Phiên bàn đã kết thúc, không thể gọi thêm món' };
            }

            // Check if shop is suspended
            const tenantStatusRes = await client.query('SELECT status FROM tenants WHERE id = $1', [tenantId]);
            if (tenantStatusRes.rows.length === 0 || tenantStatusRes.rows[0].status !== 'active') {
                throw {
                    status: 403,
                    code: 'SHOP_SUSPENDED',
                    message: 'Quán ăn hiện đang tạm ngừng nhận đơn. Vui lòng liên hệ nhân viên.'
                };
            }

            // Calculate pricing and promotions server-side using PricingService
            const pricing = await PricingService.calculateOrderPricing(client, tenantId, input.items);

            // Check if this session already had a promotion applied in an active, non-cancelled previous order (BUS-02, R2)
            const existingPromoCheck = await client.query(`
                SELECT o.applied_promotion_id, p.title, p.code, p.discount_type, p.discount_value, p.max_discount_amount,
                       COALESCE(SUM(o.discount_total), 0) as total_discount_given
                FROM orders o
                JOIN promotions p ON p.id = o.applied_promotion_id
                JOIN order_items oi ON oi.order_id = o.id
                JOIN order_item_parts oip ON oip.order_item_id = oi.id
                WHERE o.session_id = $1 AND o.applied_promotion_id IS NOT NULL
                  AND oip.status != 'CANCELLED'
                  AND p.is_active = true
                GROUP BY o.applied_promotion_id, p.title, p.code, p.discount_type, p.discount_value, p.max_discount_amount
                ORDER BY MIN(o.order_number) ASC
                LIMIT 1
            `, [sessionId]);

            let effectiveOrderPromoId: string | null = null;
            let effectiveOrderDiscount = 0;

            if (existingPromoCheck.rows.length === 0) {
                // Round 1: Apply best promo if available
                if (pricing.appliedPromotion) {
                    effectiveOrderPromoId = pricing.appliedPromotion.id;
                    effectiveOrderDiscount = pricing.discountTotal;
                }
            } else {
                // Subsequent rounds: continue applying the same session promotion according to its type (R2)
                const sessPromo = existingPromoCheck.rows[0];
                effectiveOrderPromoId = sessPromo.applied_promotion_id;
                const discValue = parseInt(sessPromo.discount_value, 10);
                const prevDiscount = parseInt(sessPromo.total_discount_given, 10);

                if (sessPromo.discount_type === 'PERCENT') {
                    let calc = Math.floor((pricing.subtotal * discValue) / 100);
                    if (sessPromo.max_discount_amount) {
                        const maxCap = parseInt(sessPromo.max_discount_amount, 10);
                        const remainingCap = Math.max(0, maxCap - prevDiscount);
                        calc = Math.min(calc, remainingCap);
                    }
                    effectiveOrderDiscount = Math.max(0, Math.min(calc, pricing.subtotal));
                } else if (sessPromo.discount_type === 'FIXED_AMOUNT') {
                    const remainingFixed = Math.max(0, discValue - prevDiscount);
                    effectiveOrderDiscount = Math.max(0, Math.min(remainingFixed, pricing.subtotal));
                }

                // Allocate effectiveOrderDiscount across pricing.items
                const lineItems = pricing.items;
                const rawSubtotal = pricing.subtotal;
                const lineDiscounts = lineItems.map(li => rawSubtotal > 0 ? Number(BigInt(li.subtotal) * BigInt(effectiveOrderDiscount) / BigInt(rawSubtotal)) : 0);
                let remainder = effectiveOrderDiscount - lineDiscounts.reduce((sum, v) => sum + v, 0);
                const allocationOrder = lineItems.map((li, index) => ({ index, remainder: rawSubtotal > 0 ? (BigInt(li.subtotal) * BigInt(effectiveOrderDiscount)) % BigInt(rawSubtotal) : 0n }))
                    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
                for (const { index } of allocationOrder) {
                    if (remainder <= 0) break;
                    if (lineDiscounts[index] < lineItems[index].subtotal) { lineDiscounts[index]++; remainder--; }
                }

                pricing.discountTotal = effectiveOrderDiscount;
                pricing.finalTotal = Math.max(0, pricing.subtotal - effectiveOrderDiscount);
                pricing.appliedPromotion = effectiveOrderDiscount > 0 ? {
                    id: sessPromo.applied_promotion_id,
                    title: sessPromo.title,
                    code: sessPromo.code,
                    discountType: sessPromo.discount_type,
                    discountValue: discValue,
                    discountAmount: effectiveOrderDiscount
                } : null;

                lineItems.forEach((li, idx) => {
                    li.discountAmount = lineDiscounts[idx];
                    li.finalPrice = Math.max(0, li.subtotal - lineDiscounts[idx]);
                    li.appliedPromotionId = effectiveOrderDiscount > 0 ? effectiveOrderPromoId : null;
                });
            }

            // CRITICAL: Order creation MUST NOT call PricingService.recordPromotionRedemption!
            // Redemptions are claimed ONLY at payment settlement time in confirmPaymentAndCloseSession (R2, BUS-06)

            // Determine next order_number
            const countRes = await client.query(`
                SELECT COALESCE(MAX(order_number), 0) + 1 as next_order_number
                FROM orders
                WHERE session_id = $1
            `, [sessionId]);

            const nextOrderNumber = parseInt(countRes.rows[0].next_order_number, 10);

            // Insert into orders
            const orderRes = await client.query(`
                INSERT INTO orders (tenant_id, session_id, order_number, idempotency_key, source, applied_promotion_id, discount_total)
                VALUES ($1, $2, $3, $4, 'GUEST_WEB', $5, $6)
                RETURNING id, order_number, created_at
            `, [
                tenantId,
                sessionId,
                nextOrderNumber,
                input.idempotencyKey,
                effectiveOrderPromoId,
                effectiveOrderDiscount
            ]);

            const order = orderRes.rows[0];

            const createdItems = [];

            // Insert order_items and initial order_item_parts
            for (const item of pricing.items) {
                const orderItemRes = await client.query(`
                    INSERT INTO order_items (
                        tenant_id, order_id, menu_item_id,
                        snapshot_name, snapshot_variant_name, snapshot_price,
                        quantity, note, discount_amount, applied_promotion_id, final_price
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING id, snapshot_name, snapshot_variant_name, snapshot_price, quantity, note, discount_amount, final_price
                `, [
                    tenantId,
                    order.id,
                    item.menuItemId,
                    item.name,
                    item.variantName || null,
                    item.basePrice,
                    item.quantity,
                    item.note || null,
                    item.discountAmount,
                    item.appliedPromotionId,
                    item.finalPrice
                ]);

                const orderItem = orderItemRes.rows[0];

                // Create initial part: all quantity in PENDING status
                await client.query(`
                    INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity)
                    VALUES ($1, $2, 'PENDING', $3)
                `, [tenantId, orderItem.id, orderItem.quantity]);

                createdItems.push({
                    id: orderItem.id,
                    name: orderItem.snapshot_name,
                    variantName: orderItem.snapshot_variant_name || undefined,
                    price: parseInt(orderItem.snapshot_price, 10),
                    quantity: orderItem.quantity,
                    discountAmount: parseInt(orderItem.discount_amount || '0', 10),
                    finalPrice: parseInt(orderItem.final_price || '0', 10),
                    status: 'PENDING',
                    note: orderItem.note
                });
            }

            // Increment settlement_version to protect payment race conditions (AT13, AT14)
            await client.query(`
                UPDATE table_sessions
                SET settlement_version = settlement_version + 1, updated_at = NOW()
                WHERE id = $1
            `, [sessionId]);

            const result = {
                orderId: order.id,
                orderNumber: order.order_number,
                createdAt: order.created_at,
                items: createdItems,
                subtotal: pricing.subtotal,
                discountTotal: pricing.discountTotal,
                finalTotal: pricing.finalTotal,
                appliedPromotion: pricing.appliedPromotion,
                message: 'Đã gửi yêu cầu gọi món thành công, chờ nhân viên tiếp nhận'
            };

            // Record idempotency
            await recordIdempotency(
                client,
                tenantId,
                'CREATE_ORDER',
                sessionId,
                input.idempotencyKey,
                input,
                result
            );

            // Notify staff & guest
            const tableName = session.table_number ? `Bàn ${session.table_number}` : 'Bàn';
            broadcastToStaff(tenantId, 'order.created', {
                sessionId,
                tableId,
                tableName,
                orderId: order.id,
                orderNumber: order.order_number,
                itemsCount: createdItems.length
            });

            // Send Web Push notification to staff (for locked screen / background PWA on iOS)
            PushService.sendToStaff(tenantId, {
                title: `${tableName}: Đơn món mới`,
                body: `${createdItems.length} món mới đang chờ xác nhận`,
                eventId: `order-${order.id}`,
                type: 'order.created',
                tableId,
                tableName,
                sessionId,
                url: '/staff',
                requiredPermission: 'order.manage'
            }).catch(() => {});

            broadcastToSession(sessionId, 'order.created', {
                orderId: order.id,
                orderNumber: order.order_number,
                itemsCount: createdItems.length,
                message: `Đã gửi yêu cầu gọi món lượt ${order.order_number} thành công!`
            });

            return result;
        });
    }

    // 4. Get all orders of current session
    static async getSessionOrders(tenantId: string, sessionId: string) {
        const ordersRes = await query(`
            SELECT o.id, o.order_number, o.source, o.created_at, o.applied_promotion_id, o.discount_total,
                   p.title as promo_title, p.code as promo_code, p.discount_type as promo_type, p.discount_value as promo_value
            FROM orders o
            LEFT JOIN promotions p ON p.id = o.applied_promotion_id
            WHERE o.session_id = $1 AND o.tenant_id = $2
            ORDER BY o.order_number ASC
        `, [sessionId, tenantId]);

        const orders = [];

        for (const o of ordersRes.rows) {
            const itemsRes = await query(`
                SELECT
                    oi.id,
                    oi.snapshot_name,
                    oi.snapshot_variant_name,
                    oi.snapshot_price,
                    oi.snapshot_category_name,
                    oi.quantity,
                    oi.discount_amount,
                    oi.final_price,
                    oi.applied_promotion_id,
                    oi.note,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'status', oip.status,
                                'quantity', oip.quantity,
                                'cancel_reason', oip.cancel_reason
                            )
                        ) FILTER (WHERE oip.id IS NOT NULL), '[]'
                    ) as parts
                FROM order_items oi
                LEFT JOIN order_item_parts oip ON oip.order_item_id = oi.id
                WHERE oi.order_id = $1
                GROUP BY oi.id
                ORDER BY oi.created_at ASC
            `, [o.id]);

            orders.push({
                id: o.id,
                orderNumber: o.order_number,
                source: o.source,
                createdAt: o.created_at,
                discountTotal: Number(o.discount_total || 0),
                appliedPromotion: o.applied_promotion_id ? {
                    id: o.applied_promotion_id,
                    title: o.promo_title,
                    code: o.promo_code,
                    discountType: o.promo_type,
                    discountValue: Number(o.promo_value || 0),
                    discountTotal: Number(o.discount_total || 0)
                } : null,
                items: itemsRes.rows.map(item => {
                    const parts = item.parts || [];
                    const pendingQty = parts.filter((p: any) => p.status === 'PENDING').reduce((acc: number, p: any) => acc + p.quantity, 0);
                    const acceptedQty = parts.filter((p: any) => p.status === 'ACCEPTED').reduce((acc: number, p: any) => acc + p.quantity, 0);
                    const servedQty = parts.filter((p: any) => p.status === 'SERVED').reduce((acc: number, p: any) => acc + p.quantity, 0);
                    const cancelledQty = parts.filter((p: any) => p.status === 'CANCELLED').reduce((acc: number, p: any) => acc + p.quantity, 0);

                    // Compute composite status according to section 7.2
                    let overallStatus = 'PENDING';
                    if (cancelledQty === item.quantity) {
                        overallStatus = 'CANCELLED';
                    } else if (servedQty === item.quantity - cancelledQty) {
                        overallStatus = 'SERVED';
                    } else if (acceptedQty > 0 || servedQty > 0) {
                        overallStatus = 'ACCEPTED';
                    }

                    return {
                        id: item.id,
                        name: item.snapshot_name,
                        variantName: item.snapshot_variant_name || undefined,
                        price: Number(item.snapshot_price),
                        quantity: item.quantity,
                        discountAmount: Number(item.discount_amount || 0),
                        finalPrice: Number(item.final_price || (item.snapshot_price * item.quantity)),
                        note: item.note,
                        status: overallStatus,
                        pendingQty,
                        acceptedQty,
                        servedQty,
                        cancelledQty,
                        parts
                    };
                })
            });
        }

        return orders;
    }

    // 5. Get bill summary according to section 8
    // Formula:
    // Tiền lần gọi = Σ(đơn giá snapshot × số lượng ACCEPTED hoặc SERVED)
    // Chờ tiếp nhận = Σ(đơn giá snapshot × số lượng PENDING)
    // CANCELLED = 0đ
    static async getBillSummary(tenantId: string, sessionId: string) {
        const sessionRes = await query(`
            SELECT id, status, settlement_version, table_id
            FROM table_sessions
            WHERE id = $1 AND tenant_id = $2
        `, [sessionId, tenantId]);

        if (sessionRes.rows.length === 0) {
            throw { status: 404, code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên' };
        }

        const session = sessionRes.rows[0];

        // Fetch all order item parts with their snapshot price
        const partsRes = await query(`
            SELECT
                o.order_number,
                o.applied_promotion_id,
                o.discount_total,
                p.title as promo_title,
                p.code as promo_code,
                p.discount_type as promo_type,
                p.discount_value as promo_value,
                oi.id as item_id,
                oi.snapshot_name,
                oi.snapshot_variant_name,
                oi.snapshot_price,
                oi.quantity as original_quantity,
                oi.discount_amount,
                oi.note,
                oip.status,
                oip.quantity,
                oip.cancel_reason
            FROM orders o
            LEFT JOIN promotions p ON p.id = o.applied_promotion_id
            JOIN order_items oi ON oi.order_id = o.id
            JOIN order_item_parts oip ON oip.order_item_id = oi.id
            WHERE o.session_id = $1 AND o.tenant_id = $2
            ORDER BY o.order_number ASC, oi.created_at ASC, oi.id,
                CASE oip.status WHEN 'SERVED' THEN 1 WHEN 'ACCEPTED' THEN 2 WHEN 'PENDING' THEN 3 ELSE 4 END, oip.id
        `, [sessionId, tenantId]);

        let confirmedOrAcceptedTotal = 0; // ACCEPTED + SERVED (after discount)
        let servedTotal = 0;              // Chỉ SERVED (after discount)
        let pendingTotal = 0;             // PENDING (after discount)
        let rawConfirmedTotal = 0;        // Undiscounted total of ACCEPTED + SERVED
        let confirmedDiscountTotal = 0;   // Discount of ACCEPTED + SERVED
        let unresolvedCount = 0;          // Số lượng phần còn PENDING hoặc ACCEPTED

        const roundSummaries: Record<number, any> = {};
        const appliedPromotionsMap = new Map<string, any>();

        const allocatedQuantities = new Map<string, number>();
        for (const row of partsRes.rows) {
            const price = Number(row.snapshot_price);
            const qty = row.quantity;
            const preceding = allocatedQuantities.get(row.item_id) || 0;
            const subtotal = row.status === 'CANCELLED' ? 0 : partAmount(price, qty, row.original_quantity, Number(row.discount_amount || 0), preceding);
            const rawItemAmount = row.status === 'CANCELLED' ? 0 : price * qty;
            const itemDiscount = Math.max(0, rawItemAmount - subtotal);
            allocatedQuantities.set(row.item_id, preceding + qty);
            const roundNum = row.order_number;

            if (!roundSummaries[roundNum]) {
                roundSummaries[roundNum] = {
                    orderNumber: roundNum,
                    rawSubtotal: 0,
                    discountTotal: 0,
                    acceptedOrServedSubtotal: 0,
                    pendingSubtotal: 0,
                    appliedPromotion: row.applied_promotion_id ? {
                        id: row.applied_promotion_id,
                        title: row.promo_title,
                        code: row.promo_code,
                        discountType: row.promo_type,
                        discountValue: Number(row.promo_value || 0)
                    } : null,
                    items: []
                };
            }

            if (row.applied_promotion_id && !appliedPromotionsMap.has(row.applied_promotion_id)) {
                appliedPromotionsMap.set(row.applied_promotion_id, {
                    id: row.applied_promotion_id,
                    title: row.promo_title,
                    code: row.promo_code,
                    discountType: row.promo_type,
                    discountValue: Number(row.promo_value || 0)
                });
            }

            if (row.status === 'SERVED') {
                servedTotal += subtotal;
                confirmedOrAcceptedTotal += subtotal;
                rawConfirmedTotal += rawItemAmount;
                confirmedDiscountTotal += itemDiscount;
                roundSummaries[roundNum].acceptedOrServedSubtotal += subtotal;
                roundSummaries[roundNum].rawSubtotal += rawItemAmount;
                roundSummaries[roundNum].discountTotal += itemDiscount;
            } else if (row.status === 'ACCEPTED') {
                confirmedOrAcceptedTotal += subtotal;
                rawConfirmedTotal += rawItemAmount;
                confirmedDiscountTotal += itemDiscount;
                unresolvedCount += qty;
                roundSummaries[roundNum].acceptedOrServedSubtotal += subtotal;
                roundSummaries[roundNum].rawSubtotal += rawItemAmount;
                roundSummaries[roundNum].discountTotal += itemDiscount;
            } else if (row.status === 'PENDING') {
                pendingTotal += subtotal;
                unresolvedCount += qty;
                roundSummaries[roundNum].pendingSubtotal += subtotal;
                roundSummaries[roundNum].rawSubtotal += rawItemAmount;
                roundSummaries[roundNum].discountTotal += itemDiscount;
            }

            roundSummaries[roundNum].items.push({
                itemId: row.item_id,
                name: row.snapshot_name,
                variantName: row.snapshot_variant_name || undefined,
                price,
                quantity: qty,
                rawPrice: rawItemAmount,
                discountAmount: itemDiscount,
                note: row.note,
                status: row.status,
                cancelReason: row.cancel_reason,
                subtotal
            });
        }

        // For CLOSED sessions, read the immutable bill & settlement snapshot (BUS-03)
        if (session.status === 'CLOSED') {
            const billRes = await query(`
                SELECT id, total_amount, confirmed_at, status
                FROM bills
                WHERE session_id = $1 AND status = 'CONFIRMED'
                LIMIT 1
            `, [sessionId]);

            if (billRes.rows.length > 0) {
                const bill = billRes.rows[0];
                const closedBillTotal = parseInt(bill.total_amount, 10);

                const promoRedemptionsRes = await query(`
                    SELECT pr.promotion_id, pr.discount_amount,
                           COALESCE(pr.snapshot_title, p.title) as promo_title,
                           COALESCE(pr.snapshot_code, p.code) as promo_code,
                           COALESCE(pr.snapshot_discount_type, p.discount_type) as promo_type,
                           COALESCE(pr.snapshot_discount_value, p.discount_value) as promo_value
                    FROM promotion_redemptions pr
                    LEFT JOIN promotions p ON p.id = pr.promotion_id
                    WHERE pr.session_id = $1
                `, [sessionId]);

                let closedDiscountTotal = 0;
                const closedPromotions: any[] = [];
                for (const pr of promoRedemptionsRes.rows) {
                    const disc = parseInt(pr.discount_amount, 10) || 0;
                    closedDiscountTotal += disc;
                    closedPromotions.push({
                        id: pr.promotion_id,
                        title: pr.promo_title || 'Khuyến mãi đã áp dụng',
                        code: pr.promo_code,
                        discountType: pr.promo_type || 'FIXED_AMOUNT',
                        discountValue: Number(pr.promo_value || 0),
                        discountAmount: disc
                    });
                }

                if (closedPromotions.length === 0 && confirmedDiscountTotal > 0) {
                    closedDiscountTotal = confirmedDiscountTotal;
                    closedPromotions.push(...Array.from(appliedPromotionsMap.values()));
                } else if (closedPromotions.length === 0 && rawConfirmedTotal > closedBillTotal) {
                    closedDiscountTotal = rawConfirmedTotal - closedBillTotal;
                }

                return {
                    sessionId: session.id,
                    sessionStatus: session.status,
                    settlementVersion: session.settlement_version,
                    rawBillTotal: rawConfirmedTotal,
                    totalDiscount: closedDiscountTotal,
                    validBillTotal: closedBillTotal, // Immutable closed amount
                    servedTotal,
                    pendingTotal: 0,
                    unresolvedCount: 0,
                    rounds: Object.values(roundSummaries),
                    appliedPromotions: closedPromotions,
                    canConfirmPayment: false,
                    isClosed: true,
                    confirmedAt: bill.confirmed_at,
                    priceFingerprint: `${session.settlement_version}-${closedBillTotal}`
                };
            }
        }

        // Evaluate session-level promotion on the whole table session (rawConfirmedTotal)
        const promosRes = await query(`
            SELECT id, code, title, description, discount_type, discount_value, min_order_amount, max_discount_amount, priority, max_redemptions, current_redemptions
            FROM promotions
            WHERE tenant_id = $1 AND is_active = true
              AND (start_time IS NULL OR NOW() >= start_time)
              AND (end_time IS NULL OR NOW() <= end_time)
            ORDER BY priority DESC, created_at DESC
        `, [tenantId]);

        // Select attached promotion strictly from active, non-cancelled item parts (Issue #28)
        const activeParts = partsRes.rows.filter(r => r.status === 'SERVED' || r.status === 'ACCEPTED');
        const candidateParts = activeParts.length > 0 ? activeParts : partsRes.rows.filter(r => r.status !== 'CANCELLED');
        const attachedPromoIds = Array.from(new Set(
            candidateParts
                .map(r => r.applied_promotion_id)
                .filter((id): id is string => Boolean(id))
        ));

        // Use unified promotion evaluation (matches settlement exactly)
        const promoEval = PricingService.evaluateSessionPromotion(rawConfirmedTotal, attachedPromoIds, promosRes.rows);
        const selectedPromo = promoEval.selectedPromo;
        const effectiveDiscount = promoEval.discountAmount;

        const effectivePromotions = (effectiveDiscount > 0 && selectedPromo) ? [{
            id: selectedPromo.id,
            title: selectedPromo.title,
            code: selectedPromo.code,
            discountType: selectedPromo.discount_type,
            discountValue: Number(selectedPromo.discount_value || 0)
        }] : [];

        const effectiveValidBillTotal = Math.max(0, rawConfirmedTotal - effectiveDiscount);

        return {
            sessionId: session.id,
            sessionStatus: session.status,
            settlementVersion: session.settlement_version,
            rawBillTotal: rawConfirmedTotal,
            totalDiscount: effectiveDiscount,
            validBillTotal: effectiveValidBillTotal, // Tổng các món đã tiếp nhận / đã phục vụ sau giảm giá tổng bill
            servedTotal,                             // Tổng các món đã phục vụ
            pendingTotal,                            // Phần đang chờ tiếp nhận
            unresolvedCount,                         // Còn món PENDING/ACCEPTED chưa giải quyết
            rounds: Object.values(roundSummaries),
            appliedPromotions: effectivePromotions,
            canConfirmPayment: unresolvedCount === 0 && session.status === 'OPEN',
            priceFingerprint: `${session.settlement_version}-${effectiveValidBillTotal}`
        };
    }

    // 6. Service Requests (F08, F09)
    static async createServiceRequest(
        tenantId: string,
        sessionId: string,
        tableId: string,
        type: 'ASSISTANCE' | 'CHECKOUT',
        note?: string
    ) {
        return await withTransaction(async (client) => {
            validate(z.enum(['ASSISTANCE', 'CHECKOUT']), type);
            validate(z.string().max(1000).optional(), note);
            const locked = await client.query(`SELECT id, status FROM table_sessions
                WHERE id = $1 AND tenant_id = $2 AND table_id = $3 FOR UPDATE`, [sessionId, tenantId, tableId]);
            if (!locked.rows.length || locked.rows[0].status !== 'OPEN') {
                throw { status: 409, code: 'SESSION_CLOSED', message: 'Phiên bàn đã kết thúc' };
            }
            // Check if there is already an open request of this type
            const existingRes = await client.query(`
                SELECT id, type, status, note, COALESCE(call_count, 1) as call_count, created_at
                FROM service_requests
                WHERE session_id = $1 AND type = $2 AND status IN ('PENDING', 'ACCEPTED')
            `, [sessionId, type]);

            if (existingRes.rows.length > 0) {
                const existing = existingRes.rows[0];
                const updatedCount = Number(existing.call_count) + 1;

                const updateRes = await client.query(`
                    UPDATE service_requests
                    SET call_count = call_count + 1,
                        note = COALESCE($1, note),
                        updated_at = NOW()
                    WHERE id = $2
                    RETURNING id, type, status, note, call_count, created_at, updated_at
                `, [note ? note.trim() : null, existing.id]);

                const updated = updateRes.rows[0];

                const tableRes = await client.query(`SELECT table_number FROM tables WHERE id = $1`, [tableId]);
                const tableName = tableRes.rows[0]?.table_number ? `Bàn ${tableRes.rows[0].table_number}` : 'Bàn';

                // Broadcast to staff (sound & toast alert)
                broadcastToStaff(tenantId, 'service_request.created', {
                    requestId: updated.id,
                    type: updated.type,
                    tableId,
                    tableName,
                    sessionId,
                    note: updated.note,
                    callCount: updated.call_count,
                    createdAt: updated.updated_at || updated.created_at
                });

                broadcastToStaff(tenantId, 'service_request.updated', {
                    requestId: updated.id,
                    sessionId
                });

                // Send Web Push notification to staff
                PushService.sendToStaff(tenantId, {
                    title: `${tableName}: ${updated.type === 'CHECKOUT' ? 'Yêu cầu thanh toán' : 'Yêu cầu hỗ trợ'}`,
                    body: updated.type === 'CHECKOUT'
                        ? (updated.call_count > 1 ? `Khách gọi thanh toán (Nhắc lần ${updated.call_count})` : 'Khách yêu cầu thanh toán tại bàn')
                        : (updated.note ? `Hỗ trợ: ${updated.note}` : (updated.call_count > 1 ? `Khách gọi nhân viên (Nhắc lần ${updated.call_count})` : 'Khách yêu cầu nhân viên đến bàn hỗ trợ')),
                    eventId: `req-${updated.id}-${updated.call_count || 1}`,
                    type: 'service_request.created',
                    tableId,
                    tableName,
                    sessionId,
                    url: '/staff'
                }).catch(() => {});

                return {
                    request: updated,
                    isExisting: true,
                    callCount: updated.call_count,
                    message: type === 'CHECKOUT'
                        ? `Đã gửi lại yêu cầu thanh toán (Nhắc lần ${updated.call_count})`
                        : `Đã gửi lại gọi nhân viên (Nhắc lần ${updated.call_count})`
                };
            }

            const res = await client.query(`
                INSERT INTO service_requests (tenant_id, session_id, table_id, type, note)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, type, status, note, call_count, created_at, updated_at
            `, [tenantId, sessionId, tableId, type, note || null]);

            const created = res.rows[0];

            const tableRes = await client.query(`SELECT table_number FROM tables WHERE id = $1`, [tableId]);
            const tableName = tableRes.rows[0]?.table_number ? `Bàn ${tableRes.rows[0].table_number}` : 'Bàn';

            // Notify staff
            broadcastToStaff(tenantId, 'service_request.created', {
                requestId: created.id,
                type: created.type,
                tableId,
                tableName,
                sessionId,
                note: created.note,
                callCount: 1,
                createdAt: created.created_at
            });

            // Send Web Push notification to staff
            PushService.sendToStaff(tenantId, {
                title: `${tableName}: ${created.type === 'CHECKOUT' ? 'Yêu cầu thanh toán' : 'Yêu cầu hỗ trợ'}`,
                body: created.type === 'CHECKOUT'
                    ? 'Khách yêu cầu thanh toán tại bàn'
                    : (created.note ? `Hỗ trợ: ${created.note}` : 'Khách yêu cầu nhân viên đến bàn hỗ trợ'),
                eventId: `req-${created.id}-1`,
                type: 'service_request.created',
                tableId,
                tableName,
                sessionId,
                url: '/staff'
            }).catch(() => {});

            broadcastToSession(sessionId, 'service_request.created', {
                requestId: created.id,
                type: created.type,
                message: created.type === 'CHECKOUT' ? 'Đã gửi yêu cầu thanh toán tới nhân viên' : 'Đã gọi nhân viên hỗ trợ'
            });

            return {
                request: created,
                isExisting: false,
                callCount: 1,
                message: type === 'CHECKOUT'
                    ? 'Đã gửi yêu cầu thanh toán, nhân viên sẽ tới bàn ngay'
                    : 'Đã gọi nhân viên hỗ trợ, vui lòng đợi trong giây lát'
            };
        });
    }

    // 7. Get open service requests for session
    static async getSessionServiceRequests(sessionId: string) {
        const res = await query(`
            SELECT id, type, status, note, COALESCE(call_count, 1) as call_count, created_at, updated_at
            FROM service_requests
            WHERE session_id = $1 AND status IN ('PENDING', 'ACCEPTED')
            ORDER BY COALESCE(updated_at, created_at) DESC
        `, [sessionId]);

        return res.rows;
    }
}
