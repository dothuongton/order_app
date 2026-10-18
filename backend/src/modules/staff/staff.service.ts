import { query, withTransaction } from '../../db/pool.js';
import { broadcastToStaff, broadcastToSession } from '../../realtime/socket.js';
import qrcode from 'qrcode';

export class StaffService {
    // 1. Get Dashboard Snapshot
    static async getDashboardSnapshot(tenantId: string) {
        // Fetch all tables
        const tablesRes = await query(`
            SELECT 
                t.id as table_id,
                t.table_number,
                t.public_qr_id,
                t.capacity,
                t.readiness,
                t.is_enabled,
                ts.id as active_session_id,
                ts.opened_at,
                ts.settlement_version,
                u.full_name as opened_by_name
            FROM tables t
            LEFT JOIN table_sessions ts ON ts.table_id = t.id AND ts.status = 'OPEN'
            LEFT JOIN users u ON u.id = ts.opened_by
            WHERE t.tenant_id = $1
            ORDER BY t.table_number ASC
        `, [tenantId]);

        // Fetch open service requests
        const requestsRes = await query(`
            SELECT 
                sr.id,
                sr.table_id,
                sr.session_id,
                sr.type,
                sr.status,
                sr.note,
                sr.created_at,
                t.table_number,
                u.full_name as accepted_by_name
            FROM service_requests sr
            JOIN tables t ON t.id = sr.table_id
            LEFT JOIN users u ON u.id = sr.accepted_by
            WHERE sr.tenant_id = $1 AND sr.status IN ('PENDING', 'ACCEPTED')
            ORDER BY sr.created_at ASC
        `, [tenantId]);

        // Fetch pending/active order counts per table
        const pendingItemsRes = await query(`
            SELECT 
                ts.table_id,
                COUNT(oip.id) FILTER (WHERE oip.status = 'PENDING') as pending_count,
                COUNT(oip.id) FILTER (WHERE oip.status = 'ACCEPTED') as accepted_count,
                COUNT(oip.id) FILTER (WHERE oip.status = 'SERVED') as served_count
            FROM table_sessions ts
            JOIN orders o ON o.session_id = ts.id
            JOIN order_items oi ON oi.order_id = o.id
            JOIN order_item_parts oip ON oip.order_item_id = oi.id
            WHERE ts.tenant_id = $1 AND ts.status = 'OPEN'
            GROUP BY ts.table_id
        `, [tenantId]);

        const countsMap = new Map<string, any>();
        pendingItemsRes.rows.forEach(r => countsMap.set(r.table_id, {
            pending: Number(r.pending_count || 0),
            accepted: Number(r.accepted_count || 0),
            served: Number(r.served_count || 0)
        }));

        const tables = tablesRes.rows.map(table => {
            const counts = countsMap.get(table.table_id) || { pending: 0, accepted: 0, served: 0 };
            const hasCheckout = requestsRes.rows.some(r => r.table_id === table.table_id && r.type === 'CHECKOUT');
            const hasAssistance = requestsRes.rows.some(r => r.table_id === table.table_id && r.type === 'ASSISTANCE');

            // Derive display status according to section 4.3
            let displayStatus = 'Sẵn sàng';
            if (!table.is_enabled) {
                displayStatus = 'Ngừng sử dụng';
            } else if (hasCheckout) {
                displayStatus = 'Yêu cầu thanh toán';
            } else if (table.active_session_id) {
                displayStatus = 'Đang phục vụ';
            } else if (table.readiness === 'NEEDS_CLEANING') {
                displayStatus = 'Chờ dọn';
            }

            return {
                ...table,
                displayStatus,
                hasCheckout,
                hasAssistance,
                counts
            };
        });

        return {
            tables,
            openRequests: requestsRes.rows
        };
    }

    // 2. Open Session (F01)
    static async openSession(tenantId: string, tableId: string, userId: string) {
        return await withTransaction(async (client) => {
            // Lock table row
            const tableRes = await client.query(`
                SELECT id, table_number, readiness, is_enabled
                FROM tables
                WHERE id = $1 AND tenant_id = $2
                FOR UPDATE
            `, [tableId, tenantId]);

            if (tableRes.rows.length === 0) {
                throw { status: 404, code: 'TABLE_NOT_FOUND', message: 'Không tìm thấy bàn' };
            }

            const table = tableRes.rows[0];
            if (!table.is_enabled) {
                throw { status: 400, code: 'TABLE_DISABLED', message: 'Bàn đang bị tắt sử dụng' };
            }

            if (table.readiness === 'NEEDS_CLEANING') {
                throw {
                    status: 400,
                    code: 'TABLE_NOT_CLEAN',
                    message: 'Bàn đang chờ dọn dẹp. Vui lòng xác nhận sẵn sàng trước khi mở phiên'
                };
            }

            // Check if there is already an open session
            const existingRes = await client.query(`
                SELECT id FROM table_sessions
                WHERE table_id = $1 AND status = 'OPEN'
            `, [tableId]);

            if (existingRes.rows.length > 0) {
                return {
                    sessionId: existingRes.rows[0].id,
                    isExisting: true,
                    message: 'Bàn đã có phiên đang mở'
                };
            }

            // Create new session
            const sessionRes = await client.query(`
                INSERT INTO table_sessions (tenant_id, table_id, status, opened_by, opened_at)
                VALUES ($1, $2, 'OPEN', $3, NOW())
                RETURNING id, status, opened_at, settlement_version
            `, [tenantId, tableId, userId]);

            const newSession = sessionRes.rows[0];

            // Create initial bill
            await client.query(`
                INSERT INTO bills (tenant_id, session_id, status, total_amount)
                VALUES ($1, $2, 'OPEN', 0)
            `, [tenantId, newSession.id]);

            broadcastToStaff(tenantId, 'table.updated', { tableId });

            return {
                sessionId: newSession.id,
                tableNumber: table.table_number,
                openedAt: newSession.opened_at,
                isExisting: false,
                message: `Đã mở phiên phục vụ cho bàn ${table.table_number}`
            };
        });
    }

    // 3. Accept Order Item / Part (F05)
    static async acceptOrderItem(tenantId: string, orderItemId: string, quantityToAccept: number, userId: string) {
        return await withTransaction(async (client) => {
            // Find order item and pending part
            const itemRes = await client.query(`
                SELECT oi.id, oi.order_id, oi.snapshot_name, o.session_id, o.tenant_id
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE oi.id = $1 AND o.tenant_id = $2
                FOR UPDATE
            `, [orderItemId, tenantId]);

            if (itemRes.rows.length === 0) {
                throw { status: 404, code: 'ITEM_NOT_FOUND', message: 'Không tìm thấy món' };
            }

            const item = itemRes.rows[0];

            const partRes = await client.query(`
                SELECT id, quantity
                FROM order_item_parts
                WHERE order_item_id = $1 AND status = 'PENDING'
                FOR UPDATE
            `, [orderItemId]);

            if (partRes.rows.length === 0) {
                throw { status: 400, code: 'INVALID_TRANSITION', message: 'Món không có phần nào đang chờ tiếp nhận' };
            }

            const pendingPart = partRes.rows[0];
            const acceptQty = Math.min(quantityToAccept || pendingPart.quantity, pendingPart.quantity);

            if (acceptQty <= 0) {
                throw { status: 400, code: 'INVALID_QUANTITY', message: 'Số lượng tiếp nhận không hợp lệ' };
            }

            if (acceptQty === pendingPart.quantity) {
                // Update entire pending part to ACCEPTED
                await client.query(`
                    UPDATE order_item_parts
                    SET status = 'ACCEPTED', updated_at = NOW()
                    WHERE id = $1
                `, [pendingPart.id]);
            } else {
                // Split part
                await client.query(`
                    UPDATE order_item_parts
                    SET quantity = quantity - $1, updated_at = NOW()
                    WHERE id = $2
                `, [acceptQty, pendingPart.id]);

                await client.query(`
                    INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity)
                    VALUES ($1, $2, 'ACCEPTED', $3)
                `, [tenantId, orderItemId, acceptQty]);
            }

            // Log event
            await client.query(`
                INSERT INTO order_item_events (tenant_id, order_item_id, from_status, to_status, quantity, changed_by)
                VALUES ($1, $2, 'PENDING', 'ACCEPTED', $3, $4)
            `, [tenantId, orderItemId, acceptQty, userId]);

            // Update settlement_version
            await client.query(`
                UPDATE table_sessions
                SET settlement_version = settlement_version + 1, updated_at = NOW()
                WHERE id = $1
            `, [item.session_id]);

            broadcastToStaff(tenantId, 'order.updated', { orderItemId, sessionId: item.session_id });
            broadcastToSession(item.session_id, 'order.updated', { orderItemId });

            return {
                orderItemId,
                acceptedQuantity: acceptQty,
                message: `Đã tiếp nhận ${acceptQty} ${item.snapshot_name}`
            };
        });
    }

    // Accept all pending items for a session
    static async acceptAllPending(tenantId: string, sessionId: string, userId: string) {
        return await withTransaction(async (client) => {
            const pendingParts = await client.query(`
                SELECT oip.id, oip.order_item_id, oip.quantity, oi.snapshot_name
                FROM order_item_parts oip
                JOIN order_items oi ON oi.id = oip.order_item_id
                JOIN orders o ON o.id = oi.order_id
                WHERE o.session_id = $1 AND o.tenant_id = $2 AND oip.status = 'PENDING'
                FOR UPDATE
            `, [sessionId, tenantId]);

            for (const part of pendingParts.rows) {
                await client.query(`
                    UPDATE order_item_parts
                    SET status = 'ACCEPTED', updated_at = NOW()
                    WHERE id = $1
                `, [part.id]);

                await client.query(`
                    INSERT INTO order_item_events (tenant_id, order_item_id, from_status, to_status, quantity, changed_by)
                    VALUES ($1, $2, 'PENDING', 'ACCEPTED', $3, $4)
                `, [tenantId, part.order_item_id, part.quantity, userId]);
            }

            if (pendingParts.rows.length > 0) {
                await client.query(`
                    UPDATE table_sessions
                    SET settlement_version = settlement_version + 1, updated_at = NOW()
                    WHERE id = $1
                `, [sessionId]);

                broadcastToStaff(tenantId, 'order.updated', { sessionId });
                broadcastToSession(sessionId, 'order.updated', { sessionId });
            }

            return {
                acceptedCount: pendingParts.rows.length,
                message: `Đã tiếp nhận toàn bộ ${pendingParts.rows.length} món chờ`
            };
        });
    }

    // 4. Mark Served (F06)
    static async serveOrderItem(tenantId: string, orderItemId: string, quantityToServe: number, userId: string) {
        return await withTransaction(async (client) => {
            const itemRes = await client.query(`
                SELECT oi.id, oi.snapshot_name, o.session_id, o.tenant_id
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE oi.id = $1 AND o.tenant_id = $2
                FOR UPDATE
            `, [orderItemId, tenantId]);

            if (itemRes.rows.length === 0) {
                throw { status: 404, code: 'ITEM_NOT_FOUND', message: 'Không tìm thấy món' };
            }

            const item = itemRes.rows[0];

            const partRes = await client.query(`
                SELECT id, quantity
                FROM order_item_parts
                WHERE order_item_id = $1 AND status = 'ACCEPTED'
                FOR UPDATE
            `, [orderItemId]);

            if (partRes.rows.length === 0) {
                throw { status: 400, code: 'INVALID_TRANSITION', message: 'Món chưa được tiếp nhận hoặc đã được phục vụ hết' };
            }

            const acceptedPart = partRes.rows[0];
            const serveQty = Math.min(quantityToServe || acceptedPart.quantity, acceptedPart.quantity);

            if (serveQty <= 0) {
                throw { status: 400, code: 'INVALID_QUANTITY', message: 'Số lượng phục vụ không hợp lệ' };
            }

            if (serveQty === acceptedPart.quantity) {
                await client.query(`
                    UPDATE order_item_parts
                    SET status = 'SERVED', updated_at = NOW()
                    WHERE id = $1
                `, [acceptedPart.id]);
            } else {
                await client.query(`
                    UPDATE order_item_parts
                    SET quantity = quantity - $1, updated_at = NOW()
                    WHERE id = $2
                `, [serveQty, acceptedPart.id]);

                await client.query(`
                    INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity)
                    VALUES ($1, $2, 'SERVED', $3)
                `, [tenantId, orderItemId, serveQty]);
            }

            await client.query(`
                INSERT INTO order_item_events (tenant_id, order_item_id, from_status, to_status, quantity, changed_by)
                VALUES ($1, $2, 'ACCEPTED', 'SERVED', $3, $4)
            `, [tenantId, orderItemId, serveQty, userId]);

            await client.query(`
                UPDATE table_sessions
                SET settlement_version = settlement_version + 1, updated_at = NOW()
                WHERE id = $1
            `, [item.session_id]);

            broadcastToStaff(tenantId, 'order.updated', { orderItemId, sessionId: item.session_id });
            broadcastToSession(item.session_id, 'order.updated', { orderItemId });

            return {
                orderItemId,
                servedQuantity: serveQty,
                message: `Đã đánh dấu phục vụ ${serveQty} ${item.snapshot_name}`
            };
        });
    }

    // Serve all accepted items for a session
    static async serveAllAccepted(tenantId: string, sessionId: string, userId: string) {
        return await withTransaction(async (client) => {
            const acceptedParts = await client.query(`
                SELECT oip.id, oip.order_item_id, oip.quantity, oi.snapshot_name
                FROM order_item_parts oip
                JOIN order_items oi ON oi.id = oip.order_item_id
                JOIN orders o ON o.id = oi.order_id
                WHERE o.session_id = $1 AND o.tenant_id = $2 AND oip.status = 'ACCEPTED'
                FOR UPDATE
            `, [sessionId, tenantId]);

            for (const part of acceptedParts.rows) {
                await client.query(`
                    UPDATE order_item_parts
                    SET status = 'SERVED', updated_at = NOW()
                    WHERE id = $1
                `, [part.id]);

                await client.query(`
                    INSERT INTO order_item_events (tenant_id, order_item_id, from_status, to_status, quantity, changed_by)
                    VALUES ($1, $2, 'ACCEPTED', 'SERVED', $3, $4)
                `, [tenantId, part.order_item_id, part.quantity, userId]);
            }

            if (acceptedParts.rows.length > 0) {
                await client.query(`
                    UPDATE table_sessions
                    SET settlement_version = settlement_version + 1, updated_at = NOW()
                    WHERE id = $1
                `, [sessionId]);

                broadcastToStaff(tenantId, 'order.updated', { sessionId });
                broadcastToSession(sessionId, 'order.updated', { sessionId });
            }

            return {
                servedCount: acceptedParts.rows.length,
                message: `Đã đánh dấu phục vụ toàn bộ ${acceptedParts.rows.length} món đã tiếp nhận`
            };
        });
    }

    // 5. Cancel Item due to out of stock / ingredients (F07)
    static async cancelOrderItem(
        tenantId: string,
        orderItemId: string,
        quantityToCancel: number,
        reason: string,
        userId: string,
        markItemOutOfStock: boolean = false
    ) {
        return await withTransaction(async (client) => {
            const itemRes = await client.query(`
                SELECT oi.id, oi.menu_item_id, oi.snapshot_name, o.session_id, o.tenant_id
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE oi.id = $1 AND o.tenant_id = $2
                FOR UPDATE
            `, [orderItemId, tenantId]);

            if (itemRes.rows.length === 0) {
                throw { status: 404, code: 'ITEM_NOT_FOUND', message: 'Không tìm thấy món' };
            }

            const item = itemRes.rows[0];

            // Can cancel from PENDING or ACCEPTED (NOT SERVED)
            const partsRes = await client.query(`
                SELECT id, status, quantity
                FROM order_item_parts
                WHERE order_item_id = $1 AND status IN ('PENDING', 'ACCEPTED')
                ORDER BY CASE WHEN status = 'PENDING' THEN 1 ELSE 2 END
                FOR UPDATE
            `, [orderItemId]);

            const availableQty = partsRes.rows.reduce((sum, p) => sum + p.quantity, 0);
            if (availableQty === 0) {
                throw {
                    status: 400,
                    code: 'CANNOT_CANCEL_SERVED',
                    message: 'Món đã phục vụ không thể hủy do hết nguyên liệu (theo đặc tả v1.2)'
                };
            }

            const cancelQty = Math.min(quantityToCancel || availableQty, availableQty);
            let remainingToCancel = cancelQty;

            for (const part of partsRes.rows) {
                if (remainingToCancel <= 0) break;

                const take = Math.min(part.quantity, remainingToCancel);
                if (take === part.quantity) {
                    await client.query(`
                        UPDATE order_item_parts
                        SET status = 'CANCELLED', cancel_reason = $1, updated_at = NOW()
                        WHERE id = $2
                    `, [reason || 'Hết nguyên liệu', part.id]);
                } else {
                    await client.query(`
                        UPDATE order_item_parts
                        SET quantity = quantity - $1, updated_at = NOW()
                        WHERE id = $2
                    `, [take, part.id]);

                    await client.query(`
                        INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity, cancel_reason)
                        VALUES ($1, $2, 'CANCELLED', $3, $4)
                    `, [tenantId, orderItemId, take, reason || 'Hết nguyên liệu']);
                }

                await client.query(`
                    INSERT INTO order_item_events (tenant_id, order_item_id, from_status, to_status, quantity, changed_by, reason)
                    VALUES ($1, $2, $3, 'CANCELLED', $4, $5, $6)
                `, [tenantId, orderItemId, part.status, take, userId, reason || 'Hết nguyên liệu']);

                remainingToCancel -= take;
            }

            // Optionally mark menu item out of stock
            if (markItemOutOfStock && item.menu_item_id) {
                await client.query(`
                    UPDATE menu_items
                    SET is_available = false, updated_at = NOW()
                    WHERE id = $1 AND tenant_id = $2
                `, [item.menu_item_id, tenantId]);
            }

            await client.query(`
                UPDATE table_sessions
                SET settlement_version = settlement_version + 1, updated_at = NOW()
                WHERE id = $1
            `, [item.session_id]);

            broadcastToStaff(tenantId, 'order.updated', { orderItemId, sessionId: item.session_id });
            broadcastToSession(item.session_id, 'order.updated', { orderItemId });

            return {
                orderItemId,
                cancelledQuantity: cancelQty,
                message: `Đã hủy ${cancelQty} ${item.snapshot_name} (Lý do: ${reason || 'Hết nguyên liệu'})`
            };
        });
    }

    // 6. Confirm Payment and Close Session (F10)
    // Atomic Transaction:
    // - Locks: Table -> Session -> Bill -> Items
    // - Check settlement_version (optimistic lock)
    // - Condition: no PENDING or ACCEPTED parts remain (AT12)
    // - Total calculation: Σ(SERVED × snapshot_price)
    // - Insert manual_settlement_confirmations
    // - Insert immutable bill_lines
    // - Bill status -> CONFIRMED
    // - Session status -> CLOSED
    // - Revoke all guest_sessions
    // - Complete CHECKOUT request, cancel ASSISTANCE
    // - Table readiness -> NEEDS_CLEANING
    static async confirmPaymentAndCloseSession(
        tenantId: string,
        sessionId: string,
        clientSettlementVersion: number,
        userId: string,
        note?: string,
        requestId?: string
    ) {
        return await withTransaction(async (client) => {
            // 1. Lock Session row
            const sessionRes = await client.query(`
                SELECT ts.id, ts.tenant_id, ts.table_id, ts.status, ts.settlement_version, t.table_number
                FROM table_sessions ts
                JOIN tables t ON t.id = ts.table_id
                WHERE ts.id = $1 AND ts.tenant_id = $2
                FOR UPDATE
            `, [sessionId, tenantId]);

            if (sessionRes.rows.length === 0) {
                throw { status: 404, code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên' };
            }

            const session = sessionRes.rows[0];

            if (session.status === 'CLOSED') {
                throw {
                    status: 400,
                    code: 'ALREADY_CLOSED',
                    message: 'Phiên bàn đã được kết thúc trước đó'
                };
            }

            // Version check
            if (clientSettlementVersion && session.settlement_version !== clientSettlementVersion) {
                throw {
                    status: 409,
                    code: 'SUMMARY_CHANGED',
                    message: 'Tổng bill hoặc trạng thái món đã thay đổi trong khi đang xử lý. Vui lòng kiểm tra lại'
                };
            }

            // 2. Lock Bill row
            const billRes = await client.query(`
                SELECT id, status, total_amount
                FROM bills
                WHERE session_id = $1 AND tenant_id = $2
                FOR UPDATE
            `, [sessionId, tenantId]);

            if (billRes.rows.length === 0) {
                throw { status: 500, code: 'BILL_NOT_FOUND', message: 'Không tìm thấy hóa đơn của phiên' };
            }

            const bill = billRes.rows[0];

            // 3. Condition check: any unresolved items (PENDING or ACCEPTED)?
            const unresolvedRes = await client.query(`
                SELECT 
                    oi.snapshot_name,
                    oip.status,
                    SUM(oip.quantity) as count
                FROM order_item_parts oip
                JOIN order_items oi ON oi.id = oip.order_item_id
                JOIN orders o ON o.id = oi.order_id
                WHERE o.session_id = $1 AND oip.status IN ('PENDING', 'ACCEPTED')
                GROUP BY oi.snapshot_name, oip.status
            `, [sessionId]);

            if (unresolvedRes.rows.length > 0) {
                const unresolvedNames = unresolvedRes.rows.map(r => `${r.count}x ${r.snapshot_name} (${r.status === 'PENDING' ? 'Chờ tiếp nhận' : 'Chưa phục vụ'})`).join(', ');
                throw {
                    status: 400,
                    code: 'UNRESOLVED_ITEMS',
                    message: `Không thể kết thúc phiên vì còn món chưa hoàn tất: ${unresolvedNames}. Vui lòng tiếp nhận/phục vụ hoặc hủy món trước khi thanh toán`
                };
            }

            // 4. Calculate final served lines
            const servedPartsRes = await client.query(`
                SELECT 
                    oi.id as order_item_id,
                    oi.snapshot_name,
                    oi.snapshot_variant_name,
                    oi.snapshot_price,
                    SUM(oip.quantity) as quantity_served
                FROM order_item_parts oip
                JOIN order_items oi ON oi.id = oip.order_item_id
                JOIN orders o ON o.id = oi.order_id
                WHERE o.session_id = $1 AND oip.status = 'SERVED'
                GROUP BY oi.id, oi.snapshot_name, oi.snapshot_variant_name, oi.snapshot_price
            `, [sessionId]);

            let finalAmount = 0;
            const billLinesToInsert: any[] = [];

            for (const r of servedPartsRes.rows) {
                const qty = parseInt(r.quantity_served, 10);
                const price = Number(r.snapshot_price);
                const subtotal = qty * price;
                finalAmount += subtotal;

                billLinesToInsert.push({
                    orderItemId: r.order_item_id,
                    itemName: r.snapshot_name,
                    variantName: r.snapshot_variant_name,
                    quantityServed: qty,
                    unitPrice: price,
                    subtotal
                });
            }

            // 5. Insert Manual Settlement Confirmation record
            await client.query(`
                INSERT INTO manual_settlement_confirmations (
                    tenant_id, bill_id, session_id, amount, confirmed_by, request_id, note
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [tenantId, bill.id, sessionId, finalAmount, userId, requestId || null, note || null]);

            // 6. Snapshot Bill Lines
            for (const line of billLinesToInsert) {
                await client.query(`
                    INSERT INTO bill_lines (
                        bill_id, order_item_id, item_name, variant_name, 
                        quantity_served, unit_price, subtotal
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [bill.id, line.orderItemId, line.itemName, line.variantName, line.quantityServed, line.unitPrice, line.subtotal]);
            }

            // 7. Update Bill to CONFIRMED
            await client.query(`
                UPDATE bills
                SET status = 'CONFIRMED', total_amount = $1, confirmed_at = NOW(), updated_at = NOW()
                WHERE id = $2
            `, [finalAmount, bill.id]);

            // 8. Update Table Session to CLOSED
            await client.query(`
                UPDATE table_sessions
                SET status = 'CLOSED', closed_by = $1, closed_at = NOW(), close_reason = 'CONFIRMED_SETTLED', updated_at = NOW()
                WHERE id = $2
            `, [userId, sessionId]);

            // 9. Complete CHECKOUT requests and cancel ASSISTANCE requests
            await client.query(`
                UPDATE service_requests
                SET status = 'COMPLETED', completed_by = $1, completed_at = NOW()
                WHERE session_id = $2 AND type = 'CHECKOUT' AND status IN ('PENDING', 'ACCEPTED')
            `, [userId, sessionId]);

            await client.query(`
                UPDATE service_requests
                SET status = 'CANCELLED', cancel_reason = 'SESSION_CLOSED'
                WHERE session_id = $1 AND type = 'ASSISTANCE' AND status IN ('PENDING', 'ACCEPTED')
            `, [sessionId]);

            // 10. Revoke all guest_sessions for this session
            await client.query(`
                UPDATE guest_sessions
                SET revoked_at = NOW()
                WHERE session_id = $1
            `, [sessionId]);

            // 11. Set table readiness to NEEDS_CLEANING (F11)
            await client.query(`
                UPDATE tables
                SET readiness = 'NEEDS_CLEANING', updated_at = NOW()
                WHERE id = $1
            `, [session.table_id]);

            // Broadcast events
            broadcastToStaff(tenantId, 'table.updated', { tableId: session.table_id });
            broadcastToSession(sessionId, 'session.closed', {
                sessionId,
                message: 'Phiên bàn đã kết thúc. Cảm ơn quý khách!'
            });

            return {
                sessionId,
                tableNumber: session.table_number,
                totalAmount: finalAmount,
                confirmedAt: new Date().toISOString(),
                lines: billLinesToInsert,
                message: `Đã xác nhận thanh toán ${finalAmount.toLocaleString('vi-VN')}đ và kết thúc phiên bàn ${session.table_number}`
            };
        });
    }

    // 7. Close Session Without Charge (F12)
    static async closeWithoutCharge(tenantId: string, sessionId: string, userId: string, reason: string) {
        return await withTransaction(async (client) => {
            const sessionRes = await client.query(`
                SELECT ts.id, ts.table_id, ts.status, t.table_number
                FROM table_sessions ts
                JOIN tables t ON t.id = ts.table_id
                WHERE ts.id = $1 AND ts.tenant_id = $2
                FOR UPDATE
            `, [sessionId, tenantId]);

            if (sessionRes.rows.length === 0) {
                throw { status: 404, code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên' };
            }

            const session = sessionRes.rows[0];
            if (session.status === 'CLOSED') {
                throw { status: 400, code: 'ALREADY_CLOSED', message: 'Phiên bàn đã kết thúc' };
            }

            // Verify no served items exist
            const servedCountRes = await client.query(`
                SELECT COUNT(oip.id) as count
                FROM order_item_parts oip
                JOIN order_items oi ON oi.id = oip.order_item_id
                JOIN orders o ON o.id = oi.order_id
                WHERE o.session_id = $1 AND oip.status = 'SERVED'
            `, [sessionId]);

            if (parseInt(servedCountRes.rows[0].count, 10) > 0) {
                throw {
                    status: 400,
                    code: 'CANNOT_CLOSE_WITHOUT_CHARGE',
                    message: 'Phiên đã có món phục vụ cho khách. Không thể kết thúc không tính tiền'
                };
            }

            // Mark bill CANCELLED
            await client.query(`
                UPDATE bills
                SET status = 'CANCELLED', total_amount = 0, updated_at = NOW()
                WHERE session_id = $1
            `, [sessionId]);

            // Close session
            await client.query(`
                UPDATE table_sessions
                SET status = 'CLOSED', closed_by = $1, closed_at = NOW(), close_reason = $2, updated_at = NOW()
                WHERE id = $3
            `, [userId, reason || 'WITHOUT_CHARGE', sessionId]);

            // Cancel any open service requests
            await client.query(`
                UPDATE service_requests
                SET status = 'CANCELLED', cancel_reason = 'SESSION_CLOSED'
                WHERE session_id = $1 AND status IN ('PENDING', 'ACCEPTED')
            `, [sessionId]);

            // Revoke guest access
            await client.query(`
                UPDATE guest_sessions
                SET revoked_at = NOW()
                WHERE session_id = $1
            `, [sessionId]);

            // Set table readiness to NEEDS_CLEANING
            await client.query(`
                UPDATE tables
                SET readiness = 'NEEDS_CLEANING', updated_at = NOW()
                WHERE id = $1
            `, [session.table_id]);

            broadcastToStaff(tenantId, 'table.updated', { tableId: session.table_id });
            broadcastToSession(sessionId, 'session.closed', {
                sessionId,
                message: 'Phiên bàn đã được kết thúc'
            });

            return {
                sessionId,
                tableNumber: session.table_number,
                message: `Đã kết thúc phiên bàn ${session.table_number} (không phát sinh bill)`
            };
        });
    }

    // 8. Mark Table Ready (F11)
    static async markTableReady(tenantId: string, tableId: string) {
        return await withTransaction(async (client) => {
            const tableRes = await client.query(`
                SELECT id, table_number, readiness
                FROM tables
                WHERE id = $1 AND tenant_id = $2
                FOR UPDATE
            `, [tableId, tenantId]);

            if (tableRes.rows.length === 0) {
                throw { status: 404, code: 'TABLE_NOT_FOUND', message: 'Không tìm thấy bàn' };
            }

            const table = tableRes.rows[0];

            // Verify no OPEN session exists
            const sessionRes = await client.query(`
                SELECT id FROM table_sessions
                WHERE table_id = $1 AND status = 'OPEN'
            `, [tableId]);

            if (sessionRes.rows.length > 0) {
                throw {
                    status: 400,
                    code: 'SESSION_STILL_OPEN',
                    message: 'Bàn đang có phiên hoạt động, không thể đánh dấu dọn'
                };
            }

            await client.query(`
                UPDATE tables
                SET readiness = 'READY', updated_at = NOW()
                WHERE id = $1
            `, [tableId]);

            broadcastToStaff(tenantId, 'table.updated', { tableId });

            return {
                tableId,
                tableNumber: table.table_number,
                message: `Bàn ${table.table_number} đã sẵn sàng đón khách mới`
            };
        });
    }

    // 9. Service Requests Management
    static async acceptServiceRequest(tenantId: string, requestId: string, userId: string) {
        const res = await query(`
            UPDATE service_requests
            SET status = 'ACCEPTED', accepted_by = $1, accepted_at = NOW()
            WHERE id = $2 AND tenant_id = $3 AND status = 'PENDING'
            RETURNING id, type, session_id, table_id
        `, [userId, requestId, tenantId]);

        if (res.rows.length === 0) {
            throw { status: 400, code: 'NOT_FOUND_OR_PROCESSED', message: 'Yêu cầu không tìm thấy hoặc đã được tiếp nhận' };
        }

        const row = res.rows[0];
        broadcastToStaff(tenantId, 'service_request.updated', { requestId });
        broadcastToSession(row.session_id, 'service_request.updated', { requestId });

        return { success: true, message: 'Đã tiếp nhận yêu cầu hỗ trợ' };
    }

    static async completeServiceRequest(tenantId: string, requestId: string, userId: string) {
        const res = await query(`
            UPDATE service_requests
            SET status = 'COMPLETED', completed_by = $1, completed_at = NOW()
            WHERE id = $2 AND tenant_id = $3 AND status IN ('PENDING', 'ACCEPTED')
            RETURNING id, type, session_id, table_id
        `, [userId, requestId, tenantId]);

        if (res.rows.length === 0) {
            throw { status: 400, code: 'NOT_FOUND_OR_PROCESSED', message: 'Yêu cầu không tìm thấy hoặc đã hoàn tất' };
        }

        const row = res.rows[0];
        broadcastToStaff(tenantId, 'service_request.updated', { requestId });
        broadcastToSession(row.session_id, 'service_request.updated', { requestId });

        return { success: true, message: 'Đã hoàn tất yêu cầu hỗ trợ' };
    }

    static async cancelServiceRequest(tenantId: string, requestId: string, reason: string) {
        const res = await query(`
            UPDATE service_requests
            SET status = 'CANCELLED', cancel_reason = $1
            WHERE id = $2 AND tenant_id = $3 AND status IN ('PENDING', 'ACCEPTED')
            RETURNING id, type, session_id, table_id
        `, [reason || 'Khách đổi ý', requestId, tenantId]);

        if (res.rows.length === 0) {
            throw { status: 400, code: 'NOT_FOUND_OR_PROCESSED', message: 'Yêu cầu không tìm thấy' };
        }

        const row = res.rows[0];
        broadcastToStaff(tenantId, 'service_request.updated', { requestId });
        broadcastToSession(row.session_id, 'service_request.updated', { requestId });

        return { success: true, message: 'Đã hủy yêu cầu' };
    }

    // 10. Generate Table QR code data URL
    static async generateTableQR(publicQrId: string, frontendBaseUrl: string) {
        const qrUrl = `${frontendBaseUrl}/t/${publicQrId}`;
        const dataUrl = await qrcode.toDataURL(qrUrl, {
            width: 400,
            margin: 2,
            color: {
                dark: '#1e293b',
                light: '#ffffff'
            }
        });
        return {
            qrUrl,
            dataUrl
        };
    }
}
