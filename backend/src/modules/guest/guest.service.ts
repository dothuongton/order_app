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
                mi.is_available
            FROM menu_items mi
            WHERE mi.tenant_id = $1
            ORDER BY mi.is_available DESC, mi.name ASC
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
            SELECT id, code, title, description, discount_type, discount_value, min_order_amount, max_discount_amount
            FROM promotions
            WHERE tenant_id = $1 AND is_active = true
              AND NOW() >= start_time AND (end_time IS NULL OR NOW() <= end_time)
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
            menuItems: itemsRes.rows,
            banners: bannersRes.rows,
            promotions: promosRes.rows
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
                pricing.appliedPromotion ? pricing.appliedPromotion.id : null,
                pricing.discountTotal
            ]);

            const order = orderRes.rows[0];

            // If a promotion was applied, atomically record redemption
            if (pricing.appliedPromotion) {
                await PricingService.recordPromotionRedemption(
                    client,
                    tenantId,
                    pricing.appliedPromotion.id,
                    order.id,
                    sessionId,
                    pricing.discountTotal
                );
            }

            const createdItems = [];

            // Insert order_items and initial order_item_parts
            for (const item of pricing.items) {
                const orderItemRes = await client.query(`
                    INSERT INTO order_items (
                        tenant_id, order_id, menu_item_id,
                        snapshot_name, snapshot_price,
                        quantity, note, discount_amount, applied_promotion_id, final_price
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING id, snapshot_name, snapshot_price, quantity, note, discount_amount, final_price
                `, [
                    tenantId,
                    order.id,
                    item.menuItemId,
                    item.name,
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
            SELECT id, order_number, source, created_at
            FROM orders
            WHERE session_id = $1 AND tenant_id = $2
            ORDER BY order_number ASC
        `, [sessionId, tenantId]);

        const orders = [];

        for (const o of ordersRes.rows) {
            const itemsRes = await query(`
                SELECT
                    oi.id,
                    oi.snapshot_name,
                    oi.snapshot_price,
                    oi.snapshot_category_name,
                    oi.quantity,
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
                        price: Number(item.snapshot_price),
                        quantity: item.quantity,
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
                oi.id as item_id,
                oi.snapshot_name,
                oi.snapshot_price,
                oi.quantity as original_quantity,
                oi.discount_amount,
                oi.note,
                oip.status,
                oip.quantity,
                oip.cancel_reason
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            JOIN order_item_parts oip ON oip.order_item_id = oi.id
            WHERE o.session_id = $1 AND o.tenant_id = $2
            ORDER BY o.order_number ASC, oi.created_at ASC, oi.id,
                CASE oip.status WHEN 'SERVED' THEN 1 WHEN 'ACCEPTED' THEN 2 WHEN 'PENDING' THEN 3 ELSE 4 END, oip.id
        `, [sessionId, tenantId]);

        let confirmedOrAcceptedTotal = 0; // ACCEPTED + SERVED
        let servedTotal = 0;              // Chỉ SERVED
        let pendingTotal = 0;             // PENDING
        let unresolvedCount = 0;          // Số lượng phần còn PENDING hoặc ACCEPTED

        const roundSummaries: Record<number, any> = {};

        const allocatedQuantities = new Map<string, number>();
        for (const row of partsRes.rows) {
            const price = Number(row.snapshot_price);
            const qty = row.quantity;
            const preceding = allocatedQuantities.get(row.item_id) || 0;
            const subtotal = row.status === 'CANCELLED' ? 0 : partAmount(price, qty, row.original_quantity, Number(row.discount_amount || 0), preceding);
            allocatedQuantities.set(row.item_id, preceding + qty);
            const roundNum = row.order_number;

            if (!roundSummaries[roundNum]) {
                roundSummaries[roundNum] = {
                    orderNumber: roundNum,
                    acceptedOrServedSubtotal: 0,
                    pendingSubtotal: 0,
                    items: []
                };
            }

            if (row.status === 'SERVED') {
                servedTotal += subtotal;
                confirmedOrAcceptedTotal += subtotal;
                roundSummaries[roundNum].acceptedOrServedSubtotal += subtotal;
            } else if (row.status === 'ACCEPTED') {
                confirmedOrAcceptedTotal += subtotal;
                unresolvedCount += qty;
                roundSummaries[roundNum].acceptedOrServedSubtotal += subtotal;
            } else if (row.status === 'PENDING') {
                pendingTotal += subtotal;
                unresolvedCount += qty;
                roundSummaries[roundNum].pendingSubtotal += subtotal;
            }

            roundSummaries[roundNum].items.push({
                itemId: row.item_id,
                name: row.snapshot_name,
                price,
                quantity: qty,
                note: row.note,
                status: row.status,
                cancelReason: row.cancel_reason,
                subtotal
            });
        }

        return {
            sessionId: session.id,
            sessionStatus: session.status,
            settlementVersion: session.settlement_version,
            validBillTotal: confirmedOrAcceptedTotal, // Tổng các món đã tiếp nhận / đã phục vụ
            servedTotal,                             // Tổng các món đã phục vụ
            pendingTotal,                            // Phần đang chờ tiếp nhận
            unresolvedCount,                         // Còn món PENDING/ACCEPTED chưa giải quyết
            rounds: Object.values(roundSummaries),
            canConfirmPayment: unresolvedCount === 0 && session.status === 'OPEN'
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
