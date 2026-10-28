import { ORDER_SOURCE_NAME_SQL } from '../../utils/order-source.js';
import { query, withTransaction } from '../../db/pool.js';
import { generateRandomToken, hashToken } from '../../utils/crypto.js';
import { checkIdempotency, recordIdempotency } from '../../utils/idempotency.js';
import { broadcastToStaff, broadcastToSession, broadcastToTable } from '../../realtime/socket.js';
import { PushService } from '../push/push.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { config } from '../../config/index.js';
import { getCachedTenantCatalog, setCachedTenantCatalog } from '../../utils/menu-cache.js';

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
    static async getPublicTableMenu(publicQrId: string, callerDeviceHash?: string) {
        const tableRes = await query(`
            SELECT
                t.id as table_id,
                t.table_number,
                t.readiness,
                t.capacity,
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

        // Check active or pending session
        const sessionRes = await query(`
            SELECT id, status, settlement_version, opened_at, expires_at,
                   requester_device_hash, claimed_device_hash, claim_version,
                   requester_guest_name, request_id, requested_at
            FROM table_sessions
            WHERE table_id = $1 AND status IN ('PENDING_APPROVAL', 'OPEN')
        `, [table.table_id]);

        let activeSession = sessionRes.rows[0] || null;

        // Auto-expire pending session or pending replacement request if time has passed
        if (activeSession) {
            const isPendingCandidate = activeSession.status === 'PENDING_APPROVAL' &&
                Boolean(activeSession.expires_at && new Date(activeSession.expires_at).getTime() <= Date.now());
            const isReplacementCandidate = activeSession.status === 'OPEN' &&
                !activeSession.claimed_device_hash && Boolean(activeSession.requester_device_hash) &&
                Boolean(activeSession.expires_at && new Date(activeSession.expires_at).getTime() <= Date.now());

            if (isPendingCandidate || isReplacementCandidate) {
                const snapshotSessionId = activeSession.id;
                const snapshotRequestId = activeSession.request_id;
                const snapshotDeviceHash = activeSession.requester_device_hash;

                await withTransaction(async (client) => {
                    const lockRes = await client.query(`
                        SELECT id, status, settlement_version, opened_at, expires_at,
                               requester_device_hash, claimed_device_hash, claim_version,
                               requester_guest_name, request_id, requested_at
                        FROM table_sessions
                        WHERE id = $1
                        FOR UPDATE
                    `, [snapshotSessionId]);

                    if (lockRes.rows.length === 0) {
                        activeSession = null;
                        return;
                    }

                    const lockedSession = lockRes.rows[0];

                    if (isPendingCandidate) {
                        const isStillPendingExpired = lockedSession.status === 'PENDING_APPROVAL' &&
                            lockedSession.request_id === snapshotRequestId &&
                            (lockedSession.requester_device_hash ?? null) === (snapshotDeviceHash ?? null) &&
                            Boolean(lockedSession.expires_at && new Date(lockedSession.expires_at).getTime() <= Date.now());

                        if (isStillPendingExpired) {
                            const updateRes = await client.query(`
                                UPDATE table_sessions
                                SET status = 'CLOSED', close_reason = 'EXPIRED', updated_at = NOW()
                                WHERE id = $1
                                  AND status = 'PENDING_APPROVAL'
                                  AND (request_id = $2 OR (request_id IS NULL AND $2 IS NULL))
                                  AND (requester_device_hash = $3 OR (requester_device_hash IS NULL AND $3 IS NULL))
                            `, [lockedSession.id, snapshotRequestId, snapshotDeviceHash]);

                            if ((updateRes.rowCount ?? 0) > 0 && lockedSession.request_id) {
                                await recordIdempotency(
                                    client,
                                    table.tenant_id,
                                    'request_table_open',
                                    table.table_id,
                                    lockedSession.request_id,
                                    { guestName: lockedSession.requester_guest_name, deviceHash: lockedSession.requester_device_hash },
                                    {
                                        status: 'EXPIRED',
                                        sessionId: lockedSession.id,
                                        requestId: lockedSession.request_id,
                                        message: 'Yêu cầu mở bàn đã hết hạn'
                                    }
                                );
                                activeSession = null;
                                return;
                            }
                        }

                        // State changed, superseded, or not expired under lock -> refresh activeSession
                        activeSession = (lockedSession.status === 'OPEN' || lockedSession.status === 'PENDING_APPROVAL') ? lockedSession : null;
                    } else if (isReplacementCandidate) {
                        const isStillReplacementExpired = lockedSession.status === 'OPEN' &&
                            !lockedSession.claimed_device_hash &&
                            lockedSession.request_id === snapshotRequestId &&
                            (lockedSession.requester_device_hash ?? null) === (snapshotDeviceHash ?? null) &&
                            Boolean(lockedSession.expires_at && new Date(lockedSession.expires_at).getTime() <= Date.now());

                        if (isStillReplacementExpired) {
                            const updateRes = await client.query(`
                                UPDATE table_sessions
                                SET requester_device_hash = NULL,
                                    requester_guest_name = NULL,
                                    request_id = NULL,
                                    requested_at = NULL,
                                    expires_at = NULL,
                                    updated_at = NOW()
                                WHERE id = $1
                                  AND status = 'OPEN'
                                  AND claimed_device_hash IS NULL
                                  AND (request_id = $2 OR (request_id IS NULL AND $2 IS NULL))
                                  AND (requester_device_hash = $3 OR (requester_device_hash IS NULL AND $3 IS NULL))
                            `, [lockedSession.id, snapshotRequestId, snapshotDeviceHash]);

                            if ((updateRes.rowCount ?? 0) > 0 && lockedSession.request_id) {
                                await recordIdempotency(
                                    client,
                                    table.tenant_id,
                                    'request_table_open',
                                    table.table_id,
                                    lockedSession.request_id,
                                    { guestName: lockedSession.requester_guest_name, deviceHash: lockedSession.requester_device_hash },
                                    {
                                        status: 'EXPIRED',
                                        sessionId: lockedSession.id,
                                        requestId: lockedSession.request_id,
                                        message: 'Yêu cầu mở bàn đã hết hạn'
                                    }
                                );
                                lockedSession.requester_device_hash = null;
                                lockedSession.request_id = null;
                                lockedSession.requester_guest_name = null;
                                lockedSession.requested_at = null;
                                lockedSession.expires_at = null;
                            }
                        }

                        // State changed, new requester arrived, or cleared -> refresh activeSession
                        activeSession = (lockedSession.status === 'OPEN' || lockedSession.status === 'PENDING_APPROVAL') ? lockedSession : null;
                    }
                });
            }
        }

        // Determine device state & table status
        let tableStatus: 'VACANT' | 'PENDING' | 'OCCUPIED' = 'VACANT';
        let deviceState: 'IDLE' | 'REQUESTER' | 'CLAIMED' | 'VIEWER' = 'IDLE';
        let requesterInfo: any = null;
        let canOrder = false;
        let canRequest = config.orderingMode === 'approved_single_device' && table.is_enabled && table.tenant_status === 'active';

        if (activeSession) {
            if (activeSession.status === 'PENDING_APPROVAL') {
                tableStatus = 'PENDING';
                canRequest = false;
                if (callerDeviceHash && activeSession.requester_device_hash === callerDeviceHash) {
                    deviceState = 'REQUESTER';
                    requesterInfo = {
                        requestId: activeSession.request_id,
                        guestName: activeSession.requester_guest_name,
                        requestedAt: activeSession.requested_at,
                        expiresAt: activeSession.expires_at,
                        remainingSeconds: Math.max(0, Math.floor((new Date(activeSession.expires_at).getTime() - Date.now()) / 1000)),
                        canWithdraw: true
                    };
                } else {
                    deviceState = 'VIEWER';
                }
            } else if (activeSession.status === 'OPEN') {
                tableStatus = 'OCCUPIED';
                if (config.orderingMode === 'approved_single_device') {
                    if (activeSession.claimed_device_hash) {
                        canRequest = false;
                        if (callerDeviceHash && activeSession.claimed_device_hash === callerDeviceHash) {
                            deviceState = 'CLAIMED';
                            canOrder = true;
                        } else {
                            deviceState = 'VIEWER';
                            canOrder = false;
                        }
                    } else {
                        // Claim released! (G3)
                        canOrder = false;
                        if (activeSession.requester_device_hash) {
                            tableStatus = 'PENDING';
                            canRequest = false;
                            if (callerDeviceHash && activeSession.requester_device_hash === callerDeviceHash) {
                                deviceState = 'REQUESTER';
                                requesterInfo = {
                                    requestId: activeSession.request_id,
                                    guestName: activeSession.requester_guest_name,
                                    requestedAt: activeSession.requested_at,
                                    expiresAt: activeSession.expires_at,
                                    remainingSeconds: Math.max(0, Math.floor((new Date(activeSession.expires_at).getTime() - Date.now()) / 1000)),
                                    canWithdraw: true
                                };
                            } else {
                                deviceState = 'VIEWER';
                            }
                        } else {
                            deviceState = 'VIEWER';
                            canRequest = activeSession.claim_version > 1 && table.is_enabled && table.tenant_status === 'active';
                            if (canRequest) {
                                const served = await query(`SELECT 1 FROM orders o
                                    JOIN order_items i ON i.order_id=o.id
                                    JOIN order_item_parts p ON p.order_item_id=i.id
                                    WHERE o.session_id=$1 AND p.status='SERVED' LIMIT 1`, [activeSession.id]);
                                canRequest = served.rows.length === 0;
                            }
                        }
                    }
                } else {
                    // Multi-device mode: any device can order
                    deviceState = 'CLAIMED';
                    canOrder = true;
                    canRequest = false;
                }
            }
        }

        // Fetch categories, items, banners, promotions (cached per tenant for high concurrency)
        let catalog = getCachedTenantCatalog(table.tenant_id);
        if (!catalog) {
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

            const mappedMenuItems = itemsRes.rows.map(item => {
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
            });

            const mappedPromotions = promosRes.rows.map(p => ({
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
            }));

            catalog = {
                categories: catRes.rows,
                menuItems: mappedMenuItems,
                banners: bannersRes.rows,
                promotions: mappedPromotions
            };
            setCachedTenantCatalog(table.tenant_id, catalog);
        }

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
                table_number: table.table_number,
                readiness: table.readiness,
                capacity: table.capacity,
                isEnabled: table.is_enabled,
                is_enabled: table.is_enabled,
                orderingMode: config.orderingMode,
                ordering_mode: config.orderingMode,
                sessionStatus: activeSession ? activeSession.status : null,
                session_status: activeSession ? activeSession.status : null,
                tableStatus,
                table_status: tableStatus,
                deviceState,
                device_state: deviceState,
                canOrder,
                can_order: canOrder,
                canRequest,
                can_request: canRequest,
                request: requesterInfo,
                claimedGuestName: (activeSession && activeSession.status === 'OPEN') ? (activeSession.requester_guest_name || null) : null,
                claimed_guest_name: (activeSession && activeSession.status === 'OPEN') ? (activeSession.requester_guest_name || null) : null
            },
            session: (activeSession && (deviceState === 'CLAIMED' || config.orderingMode === 'multi_device')) ? {
                id: activeSession.id,
                status: activeSession.status,
                openedAt: activeSession.opened_at
            } : null,
            categories: catalog.categories,
            menuItems: catalog.menuItems,
            banners: catalog.banners,
            promotions: catalog.promotions
        };
    }

    // 2. Join session
    static async joinSession(publicQrId: string, deviceFingerprint?: string, callerDeviceHash?: string) {
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

            const locked = await client.query(`SELECT status, claimed_device_hash, claim_version FROM table_sessions WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [row.session_id, row.tenant_id]);
            if (locked.rows[0]?.status !== 'OPEN') throw { status: 409, code: 'SESSION_CLOSED', message: 'Phiên bàn đã kết thúc' };

            // In approved_single_device mode: enforce caller has claim
            if (config.orderingMode === 'approved_single_device') {
                const claimedHash = locked.rows[0]?.claimed_device_hash;
                if (!claimedHash || claimedHash !== callerDeviceHash) {
                    throw {
                        status: 403,
                        code: 'DEVICE_NOT_CLAIMED',
                        message: 'Thiết bị này không có quyền tham gia phiên đặt món của bàn. Chỉ thiết bị được duyệt mới có quyền đặt món.'
                    };
                }
            }

            // Generate token and record guest_session
            const rawToken = generateRandomToken(32);
            const tokenHash = hashToken(rawToken);
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

            await client.query(`
                INSERT INTO guest_sessions (tenant_id, table_id, session_id, token_hash, device_fingerprint, expires_at)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [row.tenant_id, row.table_id, row.session_id, tokenHash, callerDeviceHash || deviceFingerprint || null, expiresAt]);

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

    // 2b. Gaeru Flow - Request Table Open (P1)
    static async requestTableOpen(publicQrId: string, input: { requestId: string; guestName: string }, deviceHash: string) {
        validate(z.object({
            requestId: z.string().uuid(),
            guestName: z.string().trim().min(1, 'Vui lòng nhập tên').max(80, 'Tên tối đa 80 ký tự')
        }), input);

        if (config.orderingMode !== 'approved_single_device') {
            throw { status: 403, code: 'FEATURE_DISABLED', message: 'Tính năng yêu cầu mở bàn không khả dụng ở chế độ này' };
        }

        return await withTransaction(async (client) => {
            // Lock table row
            const tableRes = await client.query(`
                SELECT t.id, t.tenant_id, t.table_number, t.is_enabled, te.status as tenant_status
                FROM tables t
                JOIN tenants te ON te.id = t.tenant_id
                WHERE t.public_qr_id = $1
                FOR UPDATE
            `, [publicQrId]);

            if (tableRes.rows.length === 0) {
                throw { status: 404, code: 'TABLE_NOT_FOUND', message: 'Không tìm thấy bàn tương ứng với mã QR' };
            }

            const table = tableRes.rows[0];
            if (table.tenant_status !== 'active') {
                throw { status: 403, code: 'SHOP_SUSPENDED', message: 'Quán ăn hiện đang tạm ngừng hoạt động.' };
            }
            if (!table.is_enabled) {
                throw { status: 400, code: 'TABLE_DISABLED', message: 'Bàn này hiện đang tạm ngừng sử dụng.' };
            }

            // G4: Check idempotency BEFORE rate limit, strictly scoped by deviceHash and payload
            const idempotency = await checkIdempotency(client, table.tenant_id, 'request_table_open', table.id, input.requestId, { guestName: input.guestName.trim(), deviceHash });
            if (idempotency.handled) {
                const cached = idempotency.result;
                // G4a: If cached result was PENDING_APPROVAL but has expired, transition to terminal EXPIRED state
                if (cached.status === 'PENDING_APPROVAL' && cached.expiresAt && new Date(cached.expiresAt).getTime() <= Date.now()) {
                    const expiredResult = {
                        status: 'EXPIRED',
                        sessionId: cached.sessionId,
                        requestId: input.requestId,
                        message: 'Yêu cầu mở bàn đã hết hạn'
                    };
                    await recordIdempotency(client, table.tenant_id, 'request_table_open', table.id, input.requestId, { guestName: input.guestName.trim(), deviceHash }, expiredResult);
                    return { ...expiredResult, isRetry: true };
                }
                return { ...cached, isRetry: true };
            }

            // G4c: Check if request_id already exists in table_sessions (terminal or active)
            const existingReqRes = await client.query(`
                SELECT id, status, close_reason, requester_guest_name, requested_at, expires_at, requester_device_hash, claimed_device_hash
                FROM table_sessions
                WHERE table_id = $1 AND request_id = $2
            `, [table.id, input.requestId]);

            if (existingReqRes.rows.length > 0) {
                const ex = existingReqRes.rows[0];
                if (ex.requester_device_hash && ex.requester_device_hash !== deviceHash) {
                    throw { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'Yêu cầu không thuộc về thiết bị này' };
                }
                if (ex.expires_at && new Date(ex.expires_at).getTime() <= Date.now()) {
                    const expiredResult = {
                        status: 'EXPIRED',
                        sessionId: ex.id,
                        requestId: input.requestId,
                        message: 'Yêu cầu mở bàn đã hết hạn'
                    };
                    await recordIdempotency(client, table.tenant_id, 'request_table_open', table.id, input.requestId, { guestName: input.guestName.trim(), deviceHash }, expiredResult);
                    return { ...expiredResult, isRetry: true };
                }
                return {
                    status: ex.status === 'CLOSED' ? (ex.close_reason || 'CLOSED') : ex.status,
                    sessionId: ex.id,
                    requestId: input.requestId,
                    isRetry: true
                };
            }

            // Rate limit: max 6 requests in 10 minutes from this device
            const countRes = await client.query(`
                SELECT COUNT(*) as recent_count
                FROM table_sessions
                WHERE requester_device_hash = $1
                  AND requested_at > NOW() - INTERVAL '10 minutes'
            `, [deviceHash]);

            if (parseInt(countRes.rows[0]?.recent_count || '0', 10) >= 6) {
                throw {
                    status: 429,
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Bạn đã gửi quá nhiều yêu cầu mở bàn. Vui lòng chờ vài phút rồi thử lại.'
                };
            }

            // Check existing active session
            const activeRes = await client.query(`
                SELECT id, status, request_id, requester_device_hash, requester_guest_name, requested_at, expires_at, claimed_device_hash, claim_version
                FROM table_sessions
                WHERE table_id = $1 AND status IN ('PENDING_APPROVAL', 'OPEN')
                FOR UPDATE
            `, [table.id]);

            if (activeRes.rows.length > 0) {
                const active = activeRes.rows[0];
                if (active.status === 'OPEN') {
                    if (active.claimed_device_hash || active.claim_version <= 1) {
                        throw { status: 409, code: 'TABLE_ALREADY_OCCUPIED', message: 'Bàn đang có khách phục vụ.' };
                    }
                    const served = await client.query(`SELECT 1 FROM orders o
                        JOIN order_items i ON i.order_id=o.id
                        JOIN order_item_parts p ON p.order_item_id=i.id
                        WHERE o.session_id=$1 AND p.status='SERVED' LIMIT 1`, [active.id]);
                    if (served.rows.length) {
                        throw { status: 409, code: 'TABLE_ALREADY_OCCUPIED', message: 'Bàn đang có khách phục vụ.' };
                    }
                    // G3: Claim released on OPEN session! Check if replacement request exists
                    if (active.requester_device_hash) {
                        if (active.expires_at && new Date(active.expires_at).getTime() <= Date.now()) {
                            // Expired pending replacement request -> clear it and continue
                            await client.query(`
                                UPDATE table_sessions
                                SET requester_device_hash = NULL, requester_guest_name = NULL, request_id = NULL, requested_at = NULL, expires_at = NULL
                                WHERE id = $1
                            `, [active.id]);
                            if (active.request_id) {
                                await recordIdempotency(client, table.tenant_id, 'request_table_open', table.id, active.request_id, { guestName: active.requester_guest_name, deviceHash: active.requester_device_hash }, {
                                    status: 'EXPIRED',
                                    sessionId: active.id,
                                    requestId: active.request_id,
                                    message: 'Yêu cầu mở bàn đã hết hạn'
                                });
                            }
                        } else if (active.request_id === input.requestId) {
                            if (active.requester_device_hash !== deviceHash) {
                                throw { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'Yêu cầu không thuộc về thiết bị này' };
                            }
                            // Idempotent retry
                            return {
                                status: 'PENDING_APPROVAL',
                                isRetry: true,
                                sessionId: active.id,
                                requestId: active.request_id,
                                guestName: active.requester_guest_name,
                                requestedAt: active.requested_at,
                                expiresAt: active.expires_at
                            };
                        } else {
                            throw { status: 409, code: 'TABLE_REQUEST_PENDING', message: 'Bàn đang có yêu cầu mở bàn khác đang chờ duyệt.' };
                        }
                    }

                    // Attach replacement request to existing OPEN session
                    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
                    await client.query(`
                        UPDATE table_sessions
                        SET request_id = $1,
                            requester_guest_name = $2,
                            requester_device_hash = $3,
                            requested_at = NOW(),
                            expires_at = $4,
                            updated_at = NOW()
                        WHERE id = $5
                    `, [input.requestId, input.guestName.trim(), deviceHash, expiresAt, active.id]);

                    const result = {
                        status: 'PENDING_APPROVAL',
                        sessionId: active.id,
                        requestId: input.requestId,
                        guestName: input.guestName.trim(),
                        requestedAt: new Date(),
                        expiresAt
                    };

                    await recordIdempotency(client, table.tenant_id, 'request_table_open', table.id, input.requestId, { guestName: input.guestName.trim(), deviceHash }, result);

                    broadcastToStaff(table.tenant_id, 'table_session:requested', {
                        tableId: table.id,
                        tableNumber: table.table_number,
                        sessionId: active.id,
                        requestId: input.requestId,
                        guestName: input.guestName.trim(),
                        requestedAt: new Date(),
                        expiresAt
                    });

                    broadcastToTable(table.id, 'table_session:status_changed', {
                        tableId: table.id,
                        status: 'PENDING'
                    });

                    return result;
                }

                // If pending, check expiration
                if (active.expires_at && new Date(active.expires_at).getTime() <= Date.now()) {
                    await client.query(`
                        UPDATE table_sessions
                        SET status = 'CLOSED', close_reason = 'EXPIRED'
                        WHERE id = $1
                    `, [active.id]);
                    if (active.request_id) {
                        await recordIdempotency(client, table.tenant_id, 'request_table_open', table.id, active.request_id, { guestName: active.requester_guest_name, deviceHash: active.requester_device_hash }, {
                            status: 'EXPIRED',
                            sessionId: active.id,
                            requestId: active.request_id,
                            message: 'Yêu cầu mở bàn đã hết hạn'
                        });
                    }
                } else if (active.request_id === input.requestId) {
                    if (active.requester_device_hash !== deviceHash) {
                        throw { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'Yêu cầu không thuộc về thiết bị này' };
                    }
                    // Idempotent retry
                    return {
                        status: 'PENDING_APPROVAL',
                        isRetry: true,
                        sessionId: active.id,
                        requestId: active.request_id,
                        guestName: active.requester_guest_name,
                        requestedAt: active.requested_at,
                        expiresAt: active.expires_at
                    };
                } else {
                    throw { status: 409, code: 'TABLE_REQUEST_PENDING', message: 'Bàn đang có yêu cầu mở bàn khác đang chờ duyệt.' };
                }
            }

            // Insert new pending session for vacant table
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
            const insertRes = await client.query(`
                INSERT INTO table_sessions (
                    tenant_id, table_id, status, requested_at, expires_at,
                    requester_guest_name, requester_device_hash, request_id
                ) VALUES ($1, $2, 'PENDING_APPROVAL', NOW(), $3, $4, $5, $6)
                RETURNING id, status, request_id, requester_guest_name, requested_at, expires_at
            `, [table.tenant_id, table.id, expiresAt, input.guestName.trim(), deviceHash, input.requestId]);

            const row = insertRes.rows[0];
            const result = {
                status: 'PENDING_APPROVAL',
                sessionId: row.id,
                requestId: row.request_id,
                guestName: row.requester_guest_name,
                requestedAt: row.requested_at,
                expiresAt: row.expires_at
            };

            await recordIdempotency(client, table.tenant_id, 'request_table_open', table.id, input.requestId, { guestName: input.guestName.trim(), deviceHash }, result);

            // Realtime notifications
            broadcastToStaff(table.tenant_id, 'table_session:requested', {
                tableId: table.id,
                tableNumber: table.table_number,
                sessionId: row.id,
                requestId: row.request_id,
                guestName: row.requester_guest_name,
                requestedAt: row.requested_at,
                expiresAt: row.expires_at
            });

            broadcastToTable(table.id, 'table_session:status_changed', {
                tableId: table.id,
                status: 'PENDING'
            });

            return result;
        });
    }

    // 2c. Gaeru Flow - Withdraw Table Request (P1)
    static async withdrawTableRequest(publicQrId: string, requestId: string, deviceHash: string) {
        validate(z.string().uuid(), requestId);

        if (config.orderingMode !== 'approved_single_device') {
            throw { status: 403, code: 'FEATURE_DISABLED', message: 'Tính năng không khả dụng' };
        }

        return await withTransaction(async (client) => {
            const tableRes = await client.query(`
                SELECT t.id, t.tenant_id, t.table_number
                FROM tables t
                WHERE t.public_qr_id = $1
                FOR UPDATE
            `, [publicQrId]);

            if (tableRes.rows.length === 0) {
                throw { status: 404, code: 'TABLE_NOT_FOUND', message: 'Không tìm thấy bàn' };
            }
            const table = tableRes.rows[0];

            const sessionRes = await client.query(`
                SELECT id, requester_device_hash, requester_guest_name, status, request_id
                FROM table_sessions
                WHERE table_id = $1 AND request_id = $2 AND (status = 'PENDING_APPROVAL' OR (status = 'OPEN' AND claimed_device_hash IS NULL AND requester_device_hash IS NOT NULL))
                FOR UPDATE
            `, [table.id, requestId]);

            if (sessionRes.rows.length === 0) {
                throw { status: 404, code: 'REQUEST_NOT_FOUND', message: 'Không tìm thấy yêu cầu chờ duyệt hợp lệ' };
            }

            const session = sessionRes.rows[0];
            if (session.requester_device_hash !== deviceHash) {
                throw { status: 403, code: 'FORBIDDEN', message: 'Không thể hủy yêu cầu của thiết bị khác' };
            }

            if (session.status === 'PENDING_APPROVAL') {
                await client.query(`
                    UPDATE table_sessions
                    SET status = 'CLOSED', close_reason = 'CUSTOMER_WITHDRAWN', updated_at = NOW()
                    WHERE id = $1
                `, [session.id]);
            } else {
                // OPEN session replacement request: clear requester without closing session (G3)
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

            const terminalResult = {
                status: 'WITHDRAWN',
                sessionId: session.id,
                requestId
            };

            await recordIdempotency(client, table.tenant_id, 'request_table_open', table.id, requestId, { guestName: session.requester_guest_name, deviceHash: session.requester_device_hash }, terminalResult);

            broadcastToStaff(table.tenant_id, 'table_session:withdrawn', {
                tableId: table.id,
                tableNumber: table.table_number,
                sessionId: session.id,
                requestId
            });

            broadcastToTable(table.id, 'table_session:status_changed', {
                tableId: table.id,
                status: session.status === 'OPEN' ? 'OCCUPIED' : 'VACANT'
            });

            return terminalResult;
        });
    }

    // 3. Create Order (F02, F03, F04)
    static async createOrder(
        tenantId: string,
        sessionId: string,
        tableId: string,
        input: CreateOrderInput,
        callerDeviceHash?: string,
        staffActor?: { id: string; fullName: string }
    ) {
        input = validate(orderInputSchema, input);
        if (!input.items || input.items.length === 0) {
            throw { status: 400, code: 'EMPTY_ORDER', message: 'Giỏ hàng đang trống' };
        }

        const operation = staffActor ? `STAFF_ORDER:${staffActor.id}` : 'CREATE_ORDER';
        const storageKey = staffActor
            ? `staff:${staffActor.id}:${hashToken(input.idempotencyKey)}`
            : input.idempotencyKey;
        return await withTransaction(async (client) => {
            // Lock session row FOR UPDATE
            const sessionRes = await client.query(`
                SELECT ts.id, ts.status, ts.settlement_version, ts.table_id, ts.claimed_device_hash, ts.claim_version, t.table_number
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
                operation,
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

            if (!staffActor && config.orderingMode === 'approved_single_device') {
                if (!callerDeviceHash || session.claimed_device_hash !== callerDeviceHash) {
                    throw {
                        status: 403,
                        code: 'DEVICE_NOT_CLAIMED',
                        message: 'Thiết bị này không có quyền đặt món cho bàn này. Chỉ thiết bị giữ quyền mới có thể đặt món.'
                    };
                }
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
                VALUES ($1, $2, $3, $4, $7, $5, $6)
                RETURNING id, order_number, created_at
            `, [
                tenantId,
                sessionId,
                nextOrderNumber,
                storageKey,
                effectiveOrderPromoId,
                effectiveOrderDiscount,
                staffActor ? 'STAFF_POS' : 'GUEST_WEB'
            ]);

            const order = orderRes.rows[0];

            const createdItems = [];

            // Batch insert order_items and initial order_item_parts in 2 roundtrips instead of 2*N sequential queries
            if (pricing.items.length > 0) {
                const itemValues: any[] = [];
                const itemPlaceholders = pricing.items.map((item, idx) => {
                    const offset = idx * 11;
                    itemValues.push(
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
                    );
                    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`;
                });

                const orderItemsRes = await client.query(`
                    INSERT INTO order_items (
                        tenant_id, order_id, menu_item_id,
                        snapshot_name, snapshot_variant_name, snapshot_price,
                        quantity, note, discount_amount, applied_promotion_id, final_price
                    )
                    VALUES ${itemPlaceholders.join(', ')}
                    RETURNING id, snapshot_name, snapshot_variant_name, snapshot_price, quantity, note, discount_amount, final_price
                `, itemValues);

                const partValues: any[] = [];
                const partPlaceholders = orderItemsRes.rows.map((row, idx) => {
                    const offset = idx * 3;
                    partValues.push(tenantId, row.id, row.quantity);
                    return `($${offset + 1}, $${offset + 2}, 'PENDING', $${offset + 3})`;
                });

                await client.query(`
                    INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity)
                    VALUES ${partPlaceholders.join(', ')}
                `, partValues);

                for (const orderItem of orderItemsRes.rows) {
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
            }

            // Increment settlement_version to protect payment race conditions (AT13, AT14)
            await client.query(`
                UPDATE table_sessions
                SET settlement_version = settlement_version + 1, updated_at = NOW()
                WHERE id = $1
            `, [sessionId]);

            if (staffActor) {
                await client.query(`INSERT INTO audit_logs
                    (tenant_id,user_id,action,resource_type,resource_id,details)
                    VALUES ($1,$2,'STAFF_CREATE_ORDER','order',$3,$4::jsonb)`,
                    [tenantId,staffActor.id,order.id,JSON.stringify({
                        staffName:staffActor.fullName, sessionId,tableId:session.table_id,
                        orderNumber:order.order_number, items:createdItems,
                        requestedItems:input.items, finalTotal:pricing.finalTotal
                    })]);
            }
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
                operation,
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
                source: staffActor ? 'STAFF_POS' : 'GUEST_WEB',
                orderedByName: staffActor?.fullName,
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
            SELECT o.id, o.order_number, o.source, ${ORDER_SOURCE_NAME_SQL} AS ordered_by_name, o.created_at, o.applied_promotion_id, o.discount_total,
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
                orderedByName: o.ordered_by_name,
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
        // Read the session and its item parts in one round trip. LEFT JOIN keeps
        // empty sessions visible so the existing 404 and empty-bill behavior stay intact.
        const [partsRes, promosRes] = await Promise.all([query(`
            SELECT
                ts.id AS session_id,
                ts.status AS session_status,
                ts.settlement_version,
                ts.table_id,
                ts.requester_guest_name AS opening_guest_name,
                confirmed_bill.id AS confirmed_bill_id,
                confirmed_bill.total_amount AS confirmed_bill_total_amount,
                confirmed_bill.confirmed_at AS confirmed_bill_at,
                confirmed_bill.promotion_redemptions AS promotion_redemptions,
                o.order_number, o.source, ${ORDER_SOURCE_NAME_SQL} AS ordered_by_name,
                o.created_at as order_created_at,
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
                oi.created_at as item_created_at,
                oip.status,
                oip.quantity,
                oip.cancel_reason
            FROM table_sessions ts
            LEFT JOIN LATERAL (
                SELECT b.id, b.total_amount, b.confirmed_at,
                       (
                           SELECT COALESCE(json_agg(json_build_object(
                               'promotion_id', pr.promotion_id,
                               'discount_amount', pr.discount_amount,
                               'promo_title', COALESCE(pr.snapshot_title, p.title),
                               'promo_code', COALESCE(pr.snapshot_code, p.code),
                               'promo_type', COALESCE(pr.snapshot_discount_type, p.discount_type),
                               'promo_value', COALESCE(pr.snapshot_discount_value, p.discount_value)
                           )), '[]'::json)
                           FROM promotion_redemptions pr
                           LEFT JOIN promotions p ON p.id = pr.promotion_id
                           WHERE pr.session_id = ts.id
                       ) AS promotion_redemptions
                FROM bills b
                WHERE b.session_id = ts.id AND b.status = 'CONFIRMED'
                LIMIT 1
            ) confirmed_bill ON TRUE
            LEFT JOIN orders o ON o.session_id = ts.id AND o.tenant_id = ts.tenant_id
            LEFT JOIN promotions p ON p.id = o.applied_promotion_id
            LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.tenant_id = o.tenant_id
            LEFT JOIN order_item_parts oip ON oip.order_item_id = oi.id AND oip.tenant_id = oi.tenant_id
            WHERE ts.id = $1 AND ts.tenant_id = $2
            ORDER BY o.order_number ASC, oi.created_at ASC, oi.id,
                CASE oip.status WHEN 'SERVED' THEN 1 WHEN 'ACCEPTED' THEN 2 WHEN 'PENDING' THEN 3 ELSE 4 END, oip.id
        `, [sessionId, tenantId]), query(`
            SELECT id, code, title, description, discount_type, discount_value, min_order_amount, max_discount_amount, priority, max_redemptions, current_redemptions
            FROM promotions
            WHERE tenant_id = $1 AND is_active = true
              AND EXISTS (
                  SELECT 1 FROM table_sessions ts
                  WHERE ts.id = $2 AND ts.tenant_id = $1 AND ts.status <> 'CLOSED'
              )
              AND (start_time IS NULL OR NOW() >= start_time)
              AND (end_time IS NULL OR NOW() <= end_time)
            ORDER BY priority DESC, created_at DESC
        `, [tenantId, sessionId])]);

        if (partsRes.rows.length === 0) {
            throw { status: 404, code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên' };
        }

        const session = {
            id: partsRes.rows[0].session_id,
            status: partsRes.rows[0].session_status,
            settlement_version: partsRes.rows[0].settlement_version,
            table_id: partsRes.rows[0].table_id,
            opening_guest_name: partsRes.rows[0].opening_guest_name
        };
        const confirmedBill = partsRes.rows[0].confirmed_bill_id ? {
            id: partsRes.rows[0].confirmed_bill_id,
            total_amount: partsRes.rows[0].confirmed_bill_total_amount,
            confirmed_at: partsRes.rows[0].confirmed_bill_at,
            promotion_redemptions: partsRes.rows[0].promotion_redemptions || []
        } : null;

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
            // Match the previous INNER JOIN behavior: item rows without parts
            // must not appear as bill lines.
            if (!row.item_id || !row.status) continue;
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
                    source: row.source, orderedByName: row.ordered_by_name,
                    createdAt: row.order_created_at || row.item_created_at,
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
                subtotal,
                createdAt: row.item_created_at || row.order_created_at
            });
        }

        // For CLOSED sessions, read the immutable bill & settlement snapshot (BUS-03)
        if (session.status === 'CLOSED') {
            if (confirmedBill) {
                const bill = confirmedBill;
                const closedBillTotal = parseInt(bill.total_amount, 10);

                let closedDiscountTotal = 0;
                const closedPromotions: any[] = [];
                for (const pr of bill.promotion_redemptions) {
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
                    openingGuestName: session.opening_guest_name,
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
            openingGuestName: session.opening_guest_name,
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
        note?: string,
        callerDeviceHash?: string
    ) {
        return await withTransaction(async (client) => {
            validate(z.enum(['ASSISTANCE', 'CHECKOUT']), type);
            validate(z.string().max(1000).optional(), note);
            const locked = await client.query(`SELECT id, status, claimed_device_hash, requester_guest_name FROM table_sessions
                WHERE id = $1 AND tenant_id = $2 AND table_id = $3 FOR UPDATE`, [sessionId, tenantId, tableId]);
            if (!locked.rows.length || locked.rows[0].status !== 'OPEN') {
                throw { status: 409, code: 'SESSION_CLOSED', message: 'Phiên bàn đã kết thúc' };
            }
            if (config.orderingMode === 'approved_single_device') {
                if (!callerDeviceHash || locked.rows[0].claimed_device_hash !== callerDeviceHash) {
                    const guestName = locked.rows[0].requester_guest_name || 'đặt món';
                    throw {
                        status: 403,
                        code: 'DEVICE_NOT_CLAIMED',
                        message: `Chỉ có khách hàng ${guestName} mới gửi được yêu cầu hỗ trợ và thanh toán.`
                    };
                }
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
