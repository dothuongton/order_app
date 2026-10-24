import { query, withTransaction } from '../../db/pool.js';
import { broadcastToStaff, broadcastToSession, broadcastToTable } from '../../realtime/socket.js';
import { generateRandomToken, hashToken } from '../../utils/crypto.js';
import { recordIdempotency } from '../../utils/idempotency.js';
import { config } from '../../config/index.js';
import qrcode from 'qrcode';

import { z } from 'zod';
import { validate, requestedQuantity } from '../../utils/validation.js';
import { partAmount } from '../../utils/billing.js';
import { PricingService } from '../pricing/pricing.service.js';
import { PoolClient } from 'pg';

async function lockOpenSession(client: PoolClient, tenantId: string, sessionId: string) {
    const result = await client.query(`SELECT status FROM table_sessions WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [sessionId, tenantId]);
    if (!result.rows.length) throw { status: 404, code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên' };
    if (result.rows[0].status !== 'OPEN') throw { status: 409, code: 'SESSION_CLOSED', message: 'Phiên bàn đã kết thúc' };
}

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
            ORDER BY 
                CASE WHEN ts.id IS NOT NULL THEN 0 ELSE 1 END ASC,
                LENGTH(t.table_number) ASC,
                t.table_number ASC
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
                COALESCE(sr.call_count, 1) as call_count,
                sr.created_at,
                COALESCE(sr.updated_at, sr.created_at) as updated_at,
                t.table_number,
                u.full_name as accepted_by_name
            FROM service_requests sr
            JOIN tables t ON t.id = sr.table_id
            LEFT JOIN users u ON u.id = sr.accepted_by
            WHERE sr.tenant_id = $1 AND sr.status IN ('PENDING', 'ACCEPTED')
            ORDER BY COALESCE(sr.updated_at, sr.created_at) DESC
        `, [tenantId]);

        // Fetch active order items with notes for tables currently in OPEN session
        const activeItemsRes = await query(`
            SELECT 
                ts.table_id,
                o.order_number,
                oi.id as order_item_id,
                oi.snapshot_name as name,
                oi.snapshot_variant_name as variant_name,
                oi.snapshot_price as price,
                oi.note,
                oip.id as part_id,
                oip.status,
                oip.quantity,
                oip.cancel_reason,
                oi.created_at
            FROM table_sessions ts
            JOIN orders o ON o.session_id = ts.id
            JOIN order_items oi ON oi.order_id = o.id
            JOIN order_item_parts oip ON oip.order_item_id = oi.id
            WHERE ts.tenant_id = $1 AND ts.status = 'OPEN'
            ORDER BY o.order_number ASC, oi.created_at ASC
        `, [tenantId]);

        const itemsByTable = new Map<string, any[]>();
        activeItemsRes.rows.forEach(r => {
            if (!itemsByTable.has(r.table_id)) {
                itemsByTable.set(r.table_id, []);
            }
            itemsByTable.get(r.table_id)!.push({
                orderItemId: r.order_item_id,
                partId: r.part_id,
                orderNumber: r.order_number,
                name: r.name,
                variantName: r.variant_name,
                price: Number(r.price),
                note: r.note,
                status: r.status,
                quantity: r.quantity,
                cancelReason: r.cancel_reason,
                createdAt: r.created_at
            });
        });

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
            const activeItems = itemsByTable.get(table.table_id) || [];

            // Display status: removed NEEDS_CLEANING (tables are immediately READY)
            let displayStatus = 'Sẵn sàng';
            if (!table.is_enabled) {
                displayStatus = 'Ngừng sử dụng';
            } else if (hasCheckout) {
                displayStatus = 'Yêu cầu thanh toán';
            } else if (table.active_session_id) {
                displayStatus = 'Đang phục vụ';
            }

            return {
                ...table,
                displayStatus,
                hasCheckout,
                hasAssistance,
                counts,
                activeItems
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
            // 1. Lock tenant row with FOR SHARE and recheck lifecycle status atomically (Contract #6 / Issue #116)
            // Lock order: tenant -> table -> session -> bill
            const tenantRes = await client.query(
                `SELECT id, status FROM tenants WHERE id = $1 FOR SHARE`,
                [tenantId]
            );

            if (tenantRes.rows.length === 0) {
                throw { status: 404, code: 'SHOP_NOT_FOUND', message: 'Không tìm thấy quán ăn' };
            }

            const tenant = tenantRes.rows[0];
            if (tenant.status === 'archived') {
                throw {
                    status: 403,
                    code: 'SHOP_ARCHIVED',
                    message: 'Quán ăn này đã được đưa vào lưu trữ và ngừng hoạt động hoàn toàn'
                };
            }
            if (tenant.status !== 'active') {
                throw {
                    status: 403,
                    code: 'SHOP_SUSPENDED',
                    message: 'Quán đang ngừng nhận khách'
                };
            }

            // 2. Lock table row FOR UPDATE
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

            // If table had legacy NEEDS_CLEANING, reset to READY
            if (table.readiness === 'NEEDS_CLEANING') {
                await client.query(`UPDATE tables SET readiness = 'READY' WHERE id = $1`, [tableId]);
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

            // G2: If there are pending requests, supersede them so they don't block opening
            const pendingRes = await client.query(`
                UPDATE table_sessions
                SET status = 'CLOSED', close_reason = 'SUPERSEDED_BY_STAFF', closed_at = NOW(), closed_by = $1, updated_at = NOW()
                WHERE table_id = $2 AND status = 'PENDING_APPROVAL'
                RETURNING id, request_id, requester_guest_name, requester_device_hash
            `, [userId, tableId]);

            for (const p of pendingRes.rows) {
                if (p.request_id) {
                    await recordIdempotency(client, tenantId, 'request_table_open', tableId, p.request_id, { guestName: p.requester_guest_name, deviceHash: p.requester_device_hash }, {
                        status: 'SUPERSEDED_BY_STAFF',
                        sessionId: p.id,
                        requestId: p.request_id,
                        message: 'Yêu cầu mở bàn bị thay thế bởi nhân viên mở trực tiếp'
                    });
                }
                broadcastToStaff(tenantId, 'table_session:rejected', { tableId, sessionId: p.id });
                broadcastToTable(tableId, 'table_session:status_changed', { tableId, status: 'VACANT' });
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

    // 2b. Gaeru Flow - Approve Session Request (P1)
    static async approveSessionRequest(tenantId: string, tableId: string, userId: string, input?: { sessionId?: string; expectedVersion?: number }) {
        if (config.orderingMode !== 'approved_single_device') {
            throw { status: 403, code: 'FEATURE_DISABLED', message: 'Tính năng không khả dụng' };
        }

        return await withTransaction(async (client) => {
            const tenant = await client.query(`SELECT status FROM tenants WHERE id = $1`, [tenantId]);
            if (tenant.rows[0]?.status !== 'active') throw { status: 403, code: 'SHOP_SUSPENDED', message: 'Quán đang ngừng nhận khách' };

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

            // Lock session: either PENDING_APPROVAL or (OPEN and claimed_device_hash IS NULL and requester_device_hash IS NOT NULL)
            const sessionQuery = input?.sessionId
                ? `SELECT * FROM table_sessions WHERE id = $1 AND table_id = $2 AND tenant_id = $3 AND (status = 'PENDING_APPROVAL' OR (status = 'OPEN' AND claimed_device_hash IS NULL AND requester_device_hash IS NOT NULL)) FOR UPDATE`
                : `SELECT * FROM table_sessions WHERE table_id = $1 AND tenant_id = $2 AND (status = 'PENDING_APPROVAL' OR (status = 'OPEN' AND claimed_device_hash IS NULL AND requester_device_hash IS NOT NULL)) FOR UPDATE`;
            const sessionParams = input?.sessionId
                ? [input.sessionId, tableId, tenantId]
                : [tableId, tenantId];

            const sessionRes = await client.query(sessionQuery, sessionParams);
            if (sessionRes.rows.length === 0) {
                throw { status: 409, code: 'REQUEST_NOT_FOUND_OR_RESOLVED', message: 'Yêu cầu mở bàn không tồn tại hoặc đã được xử lý' };
            }

            const session = sessionRes.rows[0];
            if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
                if (session.status === 'PENDING_APPROVAL') {
                    await client.query(`
                        UPDATE table_sessions
                        SET status = 'CLOSED', close_reason = 'EXPIRED', updated_at = NOW()
                        WHERE id = $1
                    `, [session.id]);
                } else {
                    await client.query(`
                        UPDATE table_sessions
                        SET requester_device_hash = NULL,
                            requester_guest_name = NULL,
                            request_id = NULL,
                            requested_at = NULL,
                            expires_at = NULL,
                            updated_at = NOW()
                        WHERE id = $1
                    `, [session.id]);
                }
                if (session.request_id) {
                    await recordIdempotency(client, tenantId, 'request_table_open', tableId, session.request_id, { guestName: session.requester_guest_name, deviceHash: session.requester_device_hash }, {
                        status: 'EXPIRED',
                        sessionId: session.id,
                        requestId: session.request_id,
                        message: 'Yêu cầu mở bàn đã hết hạn'
                    });
                }
                return {
                    isError: true,
                    status: 409,
                    code: 'REQUEST_EXPIRED',
                    message: 'Yêu cầu mở bàn đã hết hạn 15 phút'
                };
            }

            if (input?.expectedVersion && session.claim_version !== input.expectedVersion) {
                throw { status: 409, code: 'VERSION_CONFLICT', message: 'Phiên yêu cầu đã có thay đổi' };
            }

            // Reset readiness if needed
            if (table.readiness === 'NEEDS_CLEANING') {
                await client.query(`UPDATE tables SET readiness = 'READY' WHERE id = $1`, [tableId]);
            }

            let approvedSession: any;
            if (session.status === 'PENDING_APPROVAL') {
                // Approve and open new session
                const updateRes = await client.query(`
                    UPDATE table_sessions
                    SET status = 'OPEN',
                        approved_at = NOW(),
                        approved_by = $1,
                        opened_at = NOW(),
                        opened_by = $1,
                        claimed_device_hash = requester_device_hash,
                        requester_device_hash = NULL,
                        claim_version = 1,
                        updated_at = NOW()
                    WHERE id = $2
                    RETURNING *
                `, [userId, session.id]);

                approvedSession = updateRes.rows[0];

                // Create initial bill
                await client.query(`
                    INSERT INTO bills (tenant_id, session_id, status, total_amount)
                    VALUES ($1, $2, 'OPEN', 0)
                    ON CONFLICT (session_id) DO NOTHING
                `, [tenantId, approvedSession.id]);
            } else {
                // Approve replacement on existing OPEN session (G3)
                const nextClaimVersion = (session.claim_version || 1) + 1;
                const updateRes = await client.query(`
                    UPDATE table_sessions
                    SET claimed_device_hash = requester_device_hash,
                        requester_device_hash = NULL,
                        claim_version = $1,
                        updated_at = NOW()
                    WHERE id = $2
                    RETURNING *
                `, [nextClaimVersion, session.id]);

                approvedSession = updateRes.rows[0];
            }

            // Record idempotency terminal state (G4)
            if (session.request_id) {
                const devHash = session.requester_device_hash || approvedSession.claimed_device_hash;
                await recordIdempotency(client, tenantId, 'request_table_open', tableId, session.request_id, { guestName: session.requester_guest_name, deviceHash: devHash }, {
                    status: 'OPEN',
                    sessionId: approvedSession.id,
                    requestId: session.request_id,
                    tableNumber: table.table_number
                });
            }

            // Broadcast real-time events WITHOUT leaking raw token or claimedDeviceHash (G1)
            broadcastToStaff(tenantId, 'table_session:opened', {
                tableId,
                sessionId: approvedSession.id,
                tableNumber: table.table_number
            });

            broadcastToTable(tableId, 'table_session:approved', {
                tableId,
                sessionId: approvedSession.id,
                tableNumber: table.table_number
            });

            broadcastToStaff(tenantId, 'table.updated', { tableId });

            return {
                sessionId: approvedSession.id,
                tableId,
                tableNumber: table.table_number,
                message: `Đã duyệt mở bàn ${table.table_number}`
            };
        });
    }

    // 2c. Gaeru Flow - Reject Session Request (P1)
    static async rejectSessionRequest(tenantId: string, tableId: string, userId: string, input?: { sessionId?: string; reason?: string }) {
        if (config.orderingMode !== 'approved_single_device') {
            throw { status: 403, code: 'FEATURE_DISABLED', message: 'Tính năng không khả dụng' };
        }

        return await withTransaction(async (client) => {
            const sessionQuery = input?.sessionId
                ? `SELECT * FROM table_sessions WHERE id = $1 AND table_id = $2 AND tenant_id = $3 AND (status = 'PENDING_APPROVAL' OR (status = 'OPEN' AND claimed_device_hash IS NULL AND requester_device_hash IS NOT NULL)) FOR UPDATE`
                : `SELECT * FROM table_sessions WHERE table_id = $1 AND tenant_id = $2 AND (status = 'PENDING_APPROVAL' OR (status = 'OPEN' AND claimed_device_hash IS NULL AND requester_device_hash IS NOT NULL)) FOR UPDATE`;
            const sessionParams = input?.sessionId
                ? [input.sessionId, tableId, tenantId]
                : [tableId, tenantId];

            const sessionRes = await client.query(sessionQuery, sessionParams);
            if (sessionRes.rows.length === 0) {
                throw { status: 409, code: 'REQUEST_NOT_FOUND_OR_RESOLVED', message: 'Yêu cầu mở bàn không tồn tại hoặc đã được xử lý' };
            }

            const session = sessionRes.rows[0];

            if (session.status === 'PENDING_APPROVAL') {
                await client.query(`
                    UPDATE table_sessions
                    SET status = 'CLOSED',
                        close_reason = 'STAFF_REJECTED',
                        closed_at = NOW(),
                        closed_by = $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [userId, session.id]);
            } else {
                // Reject replacement request on existing OPEN session (G3)
                await client.query(`
                    UPDATE table_sessions
                    SET requester_device_hash = NULL,
                        requester_guest_name = NULL,
                        request_id = NULL,
                        requested_at = NULL,
                        expires_at = NULL,
                        updated_at = NOW()
                    WHERE id = $1
                `, [session.id]);
            }

            if (session.request_id) {
                await recordIdempotency(client, tenantId, 'request_table_open', tableId, session.request_id, { guestName: session.requester_guest_name, deviceHash: session.requester_device_hash }, {
                    status: 'REJECTED',
                    sessionId: session.id,
                    requestId: session.request_id,
                    message: 'Đã từ chối yêu cầu mở bàn'
                });
            }

            broadcastToStaff(tenantId, 'table_session:rejected', {
                tableId,
                sessionId: session.id
            });

            broadcastToTable(tableId, 'table_session:rejected', {
                tableId,
                sessionId: session.id,
                reason: input?.reason
            });

            broadcastToStaff(tenantId, 'table.updated', { tableId });

            return {
                status: 'REJECTED',
                tableId,
                sessionId: session.id,
                message: 'Đã từ chối yêu cầu mở bàn'
            };
        });
    }

    // 2d. Gaeru Flow - Release Claim (P1)
    static async releaseSessionClaim(tenantId: string, tableId: string, _userId: string) {
        if (config.orderingMode !== 'approved_single_device') {
            throw { status: 403, code: 'FEATURE_DISABLED', message: 'Tính năng không khả dụng' };
        }

        return await withTransaction(async (client) => {
            const sessionRes = await client.query(`
                SELECT id, status, claim_version
                FROM table_sessions
                WHERE table_id = $1 AND tenant_id = $2 AND status = 'OPEN'
                FOR UPDATE
            `, [tableId, tenantId]);

            if (sessionRes.rows.length === 0) {
                throw { status: 404, code: 'SESSION_NOT_FOUND', message: 'Không có phiên đang mở trên bàn này' };
            }

            const session = sessionRes.rows[0];

            // Verify no served items exist before releasing machine/device claim
            const servedRes = await client.query(`
                SELECT COUNT(oip.id) as count
                FROM order_item_parts oip
                JOIN order_items oi ON oi.id = oip.order_item_id
                JOIN orders o ON o.id = oi.order_id
                WHERE o.session_id = $1 AND oip.status = 'SERVED'
            `, [session.id]);

            if (parseInt(servedRes.rows[0].count, 10) > 0) {
                throw {
                    status: 400,
                    code: 'HAS_SERVED_ITEMS',
                    message: 'Bàn đã có món ở trạng thái đã phục vụ, không thể giải phóng máy gọi món'
                };
            }

            const nextClaimVersion = (session.claim_version || 1) + 1;

            await client.query(`
                UPDATE table_sessions
                SET claimed_device_hash = NULL,
                    requester_device_hash = NULL,
                    requester_guest_name = NULL,
                    request_id = NULL,
                    requested_at = NULL,
                    expires_at = NULL,
                    claim_version = $1,
                    updated_at = NOW()
                WHERE id = $2
            `, [nextClaimVersion, session.id]);

            // Revoke all existing guest tokens
            await client.query(`
                UPDATE guest_sessions
                SET revoked_at = NOW()
                WHERE session_id = $1 AND revoked_at IS NULL
            `, [session.id]);

            broadcastToTable(tableId, 'table_session:claim_released', {
                tableId,
                sessionId: session.id,
                claimVersion: nextClaimVersion
            });

            broadcastToSession(session.id, 'session.claim_released', {
                tableId,
                claimVersion: nextClaimVersion
            });

            broadcastToStaff(tenantId, 'table.updated', { tableId });

            return {
                status: 'CLAIM_RELEASED',
                tableId,
                sessionId: session.id,
                claimVersion: nextClaimVersion,
                message: 'Đã giải phóng quyền đặt món của thiết bị. Bàn có thể duyệt thiết bị mới.'
            };
        });
    }

    // 2e. Gaeru Flow - Get Pending Requests (P1)
    static async getPendingRequests(tenantId: string) {
        if (config.orderingMode !== 'approved_single_device') {
            return [];
        }

        const res = await query(`
            SELECT
                ts.id as session_id,
                ts.table_id,
                t.table_number,
                ts.requester_guest_name as guest_name,
                ts.request_id,
                ts.requested_at,
                ts.expires_at,
                GREATEST(0, EXTRACT(EPOCH FROM (ts.expires_at - NOW())))::int as remaining_seconds
            FROM table_sessions ts
            JOIN tables t ON t.id = ts.table_id
            WHERE ts.tenant_id = $1
              AND (
                  (ts.status = 'PENDING_APPROVAL' AND ts.expires_at > NOW())
                  OR (ts.status = 'OPEN' AND ts.claimed_device_hash IS NULL AND ts.requester_device_hash IS NOT NULL AND ts.expires_at > NOW())
              )
            ORDER BY ts.requested_at ASC
        `, [tenantId]);

        return res.rows;
    }

    // 3. Accept Order Item / Part (F05)
    static async acceptOrderItem(tenantId: string, orderItemId: string, quantityToAccept: number, userId: string) {
        return await withTransaction(async (client) => {
            // Find order item and pending part
            const lookup = await client.query(`SELECT o.session_id FROM order_items oi
                JOIN orders o ON o.id = oi.order_id WHERE oi.id = $1 AND o.tenant_id = $2`, [orderItemId, tenantId]);
            if (!lookup.rows.length) throw { status: 404, code: 'ITEM_NOT_FOUND', message: 'Không tìm thấy món' };
            await lockOpenSession(client, tenantId, lookup.rows[0].session_id);
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
            const acceptQty = requestedQuantity(quantityToAccept, pendingPart.quantity);

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
            broadcastToSession(item.session_id, 'order.updated', {
                orderItemId,
                type: 'ACCEPTED',
                message: `Nhà hàng đã tiếp nhận ${acceptQty}x "${item.snapshot_name}"`
            });

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
            await lockOpenSession(client, tenantId, sessionId);
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
                broadcastToSession(sessionId, 'order.updated', {
                    sessionId,
                    type: 'ACCEPTED',
                    message: `Nhà hàng đã tiếp nhận ${pendingParts.rows.length} món đang chờ của bạn`
                });
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
            const lookup = await client.query(`SELECT o.session_id FROM order_items oi
                JOIN orders o ON o.id = oi.order_id WHERE oi.id = $1 AND o.tenant_id = $2`, [orderItemId, tenantId]);
            if (!lookup.rows.length) throw { status: 404, code: 'ITEM_NOT_FOUND', message: 'Không tìm thấy món' };
            await lockOpenSession(client, tenantId, lookup.rows[0].session_id);
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

            const available = partRes.rows.reduce((sum, part) => sum + part.quantity, 0);
            const serveQty = requestedQuantity(quantityToServe, available);
            let remaining = serveQty;
            for (const part of partRes.rows) {
                if (remaining === 0) break;
                const take = Math.min(part.quantity, remaining);
                if (take === part.quantity) {
                    await client.query(`UPDATE order_item_parts SET status = 'SERVED', updated_at = NOW() WHERE id = $1`, [part.id]);
                } else {
                    await client.query(`UPDATE order_item_parts SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`, [take, part.id]);
                    await client.query(`INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity) VALUES ($1, $2, 'SERVED', $3)`, [tenantId, orderItemId, take]);
                }
                remaining -= take;
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
            broadcastToSession(item.session_id, 'order.updated', {
                orderItemId,
                type: 'SERVED',
                message: `Món "${item.snapshot_name}" (x${serveQty}) đã được phục vụ đến bàn`
            });

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
            await lockOpenSession(client, tenantId, sessionId);
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
                broadcastToSession(sessionId, 'order.updated', {
                    sessionId,
                    type: 'SERVED',
                    message: `Món ăn của bạn đã được phục vụ lên bàn!`
                });
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
            const lookup = await client.query(`SELECT o.session_id FROM order_items oi
                JOIN orders o ON o.id = oi.order_id WHERE oi.id = $1 AND o.tenant_id = $2`, [orderItemId, tenantId]);
            if (!lookup.rows.length) throw { status: 404, code: 'ITEM_NOT_FOUND', message: 'Không tìm thấy món' };
            await lockOpenSession(client, tenantId, lookup.rows[0].session_id);
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

            const cancelQty = requestedQuantity(quantityToCancel, availableQty);
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
            broadcastToSession(item.session_id, 'order.updated', {
                orderItemId,
                type: 'CANCELLED',
                message: `Món "${item.snapshot_name}" (x${cancelQty}) đã bị hủy: ${reason || 'Hết nguyên liệu'}`
            });

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
        requestId?: string,
        expectedAmount?: number
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

            // Never allow clients to bypass optimistic concurrency with 0/null/missing.
            validate(z.number().int().positive(), clientSettlementVersion);
            if (session.settlement_version !== clientSettlementVersion) {
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
                    o.order_number,
                    oi.id as order_item_id,
                    oi.snapshot_name,
                    oi.snapshot_variant_name,
                    oi.snapshot_price,
                    oi.quantity as original_quantity,
                    oi.discount_amount,
                    oi.applied_promotion_id,
                    SUM(oip.quantity) as quantity_served
                FROM order_item_parts oip
                JOIN order_items oi ON oi.id = oip.order_item_id
                JOIN orders o ON o.id = oi.order_id
                WHERE o.session_id = $1 AND oip.status = 'SERVED'
                GROUP BY o.order_number, oi.created_at, oi.id, oi.snapshot_name, oi.snapshot_variant_name, oi.snapshot_price, oi.applied_promotion_id
                ORDER BY o.order_number ASC, oi.created_at ASC, oi.id ASC
            `, [sessionId]);

            const rawServedTotal = servedPartsRes.rows.reduce((sum, r) => sum + Number(r.snapshot_price) * parseInt(r.quantity_served, 10), 0);
            const confirmedItemDiscountTotal = servedPartsRes.rows.reduce((sum, r) => {
                const qty = parseInt(r.quantity_served, 10);
                const price = Number(r.snapshot_price);
                const sub = partAmount(price, qty, r.original_quantity, Number(r.discount_amount || 0));
                return sum + Math.max(0, price * qty - sub);
            }, 0);

            // Fetch active promotions for tenant
            const promoRes = await client.query(`
                SELECT id, code, title, discount_type, discount_value, min_order_amount, max_discount_amount, priority, max_redemptions, current_redemptions
                FROM promotions
                WHERE tenant_id = $1 AND is_active = true
                  AND (start_time IS NULL OR NOW() >= start_time)
                  AND (end_time IS NULL OR NOW() <= end_time)
                ORDER BY priority DESC, created_at DESC
            `, [tenantId]);

            const attachedPromoIds = Array.from(new Set(
                servedPartsRes.rows
                    .map(r => r.applied_promotion_id)
                    .filter((id): id is string => Boolean(id))
            ));
            const promoEval = PricingService.evaluateSessionPromotion(rawServedTotal, attachedPromoIds, promoRes.rows);
            const selectedPromo = promoEval.selectedPromo;
            const sessionDiscount = promoEval.discountAmount;
            const hadExhaustedAttachedPromo = promoEval.hadExhaustedAttachedPromo;

            if (attachedPromoIds.length > 0 && !selectedPromo && hadExhaustedAttachedPromo && expectedAmount !== undefined && expectedAmount < rawServedTotal) {
                throw {
                    status: 409,
                    code: 'PROMOTION_EXHAUSTED',
                    message: `Chương trình khuyến mãi "${hadExhaustedAttachedPromo.title}" vừa hết lượt sử dụng. Vui lòng tải lại và xác nhận hóa đơn mới.`
                };
            }

            let finalAmount = Math.max(0, rawServedTotal - sessionDiscount);
            const billLinesToInsert: any[] = [];

            if (sessionDiscount > 0 && selectedPromo) {
                // Atomically claim promotion cap (BUS-06)
                const claimRes = await client.query(`
                    UPDATE promotions
                    SET current_redemptions = current_redemptions + 1, updated_at = NOW()
                    WHERE id = $1 AND (max_redemptions IS NULL OR current_redemptions < max_redemptions)
                    RETURNING id
                `, [selectedPromo.id]);

                if (claimRes.rowCount === 0) {
                    throw {
                        status: 409,
                        code: 'PROMOTION_EXHAUSTED',
                        message: `Chương trình khuyến mãi "${selectedPromo.title}" vừa hết lượt sử dụng. Vui lòng tải lại và xác nhận hóa đơn mới.`
                    };
                }

                // Record session-level promotion redemption with metadata snapshot (BUS-05, R7)
                await client.query(`
                    INSERT INTO promotion_redemptions (
                        tenant_id, promotion_id, session_id, discount_amount,
                        snapshot_title, snapshot_code, snapshot_discount_type, snapshot_discount_value
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [
                    tenantId,
                    selectedPromo.id,
                    sessionId,
                    sessionDiscount,
                    selectedPromo.title,
                    selectedPromo.code,
                    selectedPromo.discount_type,
                    selectedPromo.discount_value
                ]);

                const lineRaw = servedPartsRes.rows.map(r => Number(r.snapshot_price) * parseInt(r.quantity_served, 10));
                const lineDiscounts = lineRaw.map(amt => rawServedTotal > 0 ? Number(BigInt(amt) * BigInt(sessionDiscount) / BigInt(rawServedTotal)) : 0);
                let rem = sessionDiscount - lineDiscounts.reduce((s, v) => s + v, 0);
                for (let i = 0; i < lineDiscounts.length && rem > 0; i++) {
                    lineDiscounts[i]++;
                    rem--;
                }

                servedPartsRes.rows.forEach((r, idx) => {
                    const qty = parseInt(r.quantity_served, 10);
                    const price = Number(r.snapshot_price);
                    const rawLine = price * qty;
                    const subtotal = Math.max(0, rawLine - (lineDiscounts[idx] || 0));
                    billLinesToInsert.push({
                        orderItemId: r.order_item_id,
                        itemName: r.snapshot_name,
                        variantName: r.snapshot_variant_name,
                        quantityServed: qty,
                        unitPrice: price,
                        subtotal
                    });
                });
            } else {
                servedPartsRes.rows.forEach(r => {
                    const qty = parseInt(r.quantity_served, 10);
                    const price = Number(r.snapshot_price);
                    const subtotal = price * qty;
                    billLinesToInsert.push({
                        orderItemId: r.order_item_id,
                        itemName: r.snapshot_name,
                        variantName: r.snapshot_variant_name,
                        quantityServed: qty,
                        unitPrice: price,
                        subtotal
                    });
                });
            }

            // Protect against unexpected price change / race condition (BUS-04)
            if (expectedAmount !== undefined && finalAmount !== expectedAmount) {
                throw {
                    status: 409,
                    code: 'PRICE_CHANGED',
                    message: `Số tiền thanh toán đã thay đổi (dự kiến ${expectedAmount.toLocaleString('vi-VN')}đ, thực tế ${finalAmount.toLocaleString('vi-VN')}đ). Vui lòng kiểm tra và xác nhận lại hóa đơn.`
                };
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

            // 11. Set table readiness to READY
            await client.query(`
                UPDATE tables
                SET readiness = 'READY', updated_at = NOW()
                WHERE id = $1
            `, [session.table_id]);

            // Broadcast events
            broadcastToStaff(tenantId, 'table.updated', { tableId: session.table_id });
            broadcastToStaff(tenantId, 'service_request.updated', { sessionId });
            broadcastToSession(sessionId, 'session.closed', {
                sessionId,
                reason: 'CONFIRMED_SETTLED',
                settledAmount: finalAmount,
                confirmedAt: new Date().toISOString(),
                lines: billLinesToInsert,
                message: `Đã xác nhận thanh toán ${finalAmount.toLocaleString('vi-VN')}đ và kết thúc phiên bàn ${session.table_number}`
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

            // Cancel any open order item parts if any existed
            await client.query(`
                UPDATE order_item_parts
                SET status = 'CANCELLED', cancel_reason = 'SESSION_CLOSED_WITHOUT_CHARGE', updated_at = NOW()
                WHERE order_item_id IN (
                    SELECT oi.id FROM order_items oi
                    JOIN orders o ON o.id = oi.order_id
                    WHERE o.session_id = $1
                ) AND status IN ('PENDING', 'ACCEPTED')
            `, [sessionId]);

            // Revoke guest access
            await client.query(`
                UPDATE guest_sessions
                SET revoked_at = NOW()
                WHERE session_id = $1
            `, [sessionId]);

            // Set table readiness to READY
            await client.query(`
                UPDATE tables
                SET readiness = 'READY', updated_at = NOW()
                WHERE id = $1
            `, [session.table_id]);

            broadcastToStaff(tenantId, 'table.updated', { tableId: session.table_id });
            broadcastToStaff(tenantId, 'order.updated', { sessionId });
            broadcastToStaff(tenantId, 'service_request.updated', { sessionId });
            broadcastToSession(sessionId, 'session.closed', {
                sessionId,
                reason: 'CLOSED_WITHOUT_CHARGE',
                settledAmount: 0,
                confirmedAt: new Date().toISOString(),
                lines: [],
                message: 'Phiên bàn đã được kết thúc (không phát sinh bill)'
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
        const acceptMsg = row.type === 'CHECKOUT'
            ? 'Nhân viên đã tiếp nhận yêu cầu thanh toán và đang tới bàn.'
            : 'Nhân viên đã tiếp nhận yêu cầu hỗ trợ và đang tới bàn.';

        broadcastToStaff(tenantId, 'service_request.updated', { requestId, type: row.type, status: 'ACCEPTED' });
        broadcastToSession(row.session_id, 'service_request.updated', {
            requestId,
            type: row.type,
            status: 'ACCEPTED',
            message: acceptMsg
        });
        broadcastToTable(row.table_id, 'service_request.updated', {
            requestId,
            type: row.type,
            status: 'ACCEPTED',
            message: acceptMsg
        });

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
        broadcastToStaff(tenantId, 'service_request.updated', { requestId, type: row.type, status: 'COMPLETED' });
        broadcastToSession(row.session_id, 'service_request.updated', {
            requestId,
            type: row.type,
            status: 'COMPLETED',
            message: 'Nhân viên đã hoàn tất yêu cầu hỗ trợ.'
        });
        broadcastToTable(row.table_id, 'service_request.updated', {
            requestId,
            type: row.type,
            status: 'COMPLETED',
            message: 'Nhân viên đã hoàn tất yêu cầu hỗ trợ.'
        });

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
        const cancelMsg = reason ? `Yêu cầu hỗ trợ đã hủy: ${reason}` : 'Yêu cầu hỗ trợ đã được hủy.';
        broadcastToStaff(tenantId, 'service_request.updated', { requestId, type: row.type, status: 'CANCELLED' });
        broadcastToSession(row.session_id, 'service_request.updated', {
            requestId,
            type: row.type,
            status: 'CANCELLED',
            message: cancelMsg
        });
        broadcastToTable(row.table_id, 'service_request.updated', {
            requestId,
            type: row.type,
            status: 'CANCELLED',
            message: cancelMsg
        });

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
