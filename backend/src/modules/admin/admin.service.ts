import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../db/pool.js';
import { validate } from '../../utils/validation.js';
import { AdminApiError } from './admin.errors.js';
import {
    CreateShopInput,
    UpdateShopInput,
    ListShopsQueryInput,
    ListAuditLogsQueryInput,
    createShopSchema,
    updateShopSchema
} from './admin.validation.js';

export class AdminService {
    /**
     * Get platform overview statistics
     */
    static async getPlatformStats() {
        const shopsRes = await query(`
            SELECT
                COUNT(*) as total_shops,
                COUNT(*) FILTER (WHERE status = 'active') as active_shops,
                COUNT(*) FILTER (WHERE status = 'suspended') as suspended_shops,
                COUNT(*) FILTER (WHERE status = 'archived') as archived_shops
            FROM tenants
        `);

        const revenueRes = await query(`
            SELECT
                COALESCE(SUM(amount), 0) as total_confirmed_revenue,
                COUNT(*) as total_settlements
            FROM manual_settlement_confirmations
        `);

        const ordersRes = await query(`
            SELECT COUNT(*) as total_orders FROM orders
        `);

        return {
            totalShops: parseInt(shopsRes.rows[0].total_shops, 10),
            activeShops: parseInt(shopsRes.rows[0].active_shops, 10),
            suspendedShops: parseInt(shopsRes.rows[0].suspended_shops, 10),
            archivedShops: parseInt(shopsRes.rows[0].archived_shops, 10),
            totalRevenue: parseInt(revenueRes.rows[0].total_confirmed_revenue, 10),
            totalSettlements: parseInt(revenueRes.rows[0].total_settlements, 10),
            totalOrders: parseInt(ordersRes.rows[0].total_orders, 10)
        };
    }

    /**
     * List shops with search, status filtering, bounded pagination and stable sort.
     * Guarantees exactly one record per tenant using LATERAL join for owner.
     */
    static async listShops(input: ListShopsQueryInput) {
        const page = Math.max(1, input.page);
        const limit = Math.min(100, Math.max(1, input.limit));
        const offset = (page - 1) * limit;

        const whereClauses: string[] = ['1=1'];
        const params: any[] = [];

        if (input.status && input.status !== 'all') {
            params.push(input.status);
            whereClauses.push(`t.status = $${params.length}`);
        }

        if (input.search && input.search.trim()) {
            params.push(`%${input.search.trim().toLowerCase()}%`);
            whereClauses.push(
                `(LOWER(t.name) LIKE $${params.length} OR LOWER(t.slug) LIKE $${params.length} OR LOWER(COALESCE(owner.email, '')) LIKE $${params.length})`
            );
        }

        const whereSql = whereClauses.join(' AND ');

        // 1. Total count query
        const countSql = `
            SELECT COUNT(t.id) as total
            FROM tenants t
            LEFT JOIN LATERAL (
                SELECT u.email
                FROM memberships m
                JOIN users u ON u.id = m.user_id
                WHERE m.tenant_id = t.id AND m.role = 'owner'
                ORDER BY m.created_at ASC, m.id ASC
                LIMIT 1
            ) owner ON true
            WHERE ${whereSql}
        `;
        const countRes = await query(countSql, params);
        const total = parseInt(countRes.rows[0]?.total || '0', 10);

        // 2. Determine sort order
        const orderDirection = input.order === 'asc' ? 'ASC' : 'DESC';
        let orderByClause = `t.created_at ${orderDirection}, t.id ${orderDirection}`;
        if (input.sortBy === 'name') {
            orderByClause = `t.name ${orderDirection}, t.id ${orderDirection}`;
        } else if (input.sortBy === 'revenue') {
            orderByClause = `total_revenue ${orderDirection}, t.id ${orderDirection}`;
        } else if (input.sortBy === 'orders') {
            orderByClause = `order_count ${orderDirection}, t.id ${orderDirection}`;
        }

        // 3. Data query with pagination parameters
        const dataParams = [...params];
        dataParams.push(limit);
        const limitParamIndex = dataParams.length;
        dataParams.push(offset);
        const offsetParamIndex = dataParams.length;

        const dataSql = `
            SELECT
                t.id, t.name, t.slug, t.status, t.phone, t.address,
                t.active_template_id, t.active_published_version,
                t.created_at, t.updated_at,
                owner.id as owner_id, owner.email as owner_email, owner.full_name as owner_name,
                (SELECT COUNT(*) FROM tables tbl WHERE tbl.tenant_id = t.id) as table_count,
                (SELECT COUNT(*) FROM orders o WHERE o.tenant_id = t.id) as order_count,
                (SELECT COALESCE(SUM(amount), 0) FROM manual_settlement_confirmations msc WHERE msc.tenant_id = t.id) as total_revenue
            FROM tenants t
            LEFT JOIN LATERAL (
                SELECT u.id, u.email, u.full_name
                FROM memberships m
                JOIN users u ON u.id = m.user_id
                WHERE m.tenant_id = t.id AND m.role = 'owner'
                ORDER BY m.created_at ASC, m.id ASC
                LIMIT 1
            ) owner ON true
            WHERE ${whereSql}
            ORDER BY ${orderByClause}
            LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
        `;

        const dataRes = await query(dataSql, dataParams);
        const shops = dataRes.rows.map(row => {
            const tableCount = parseInt(row.table_count || '0', 10);
            const orderCount = parseInt(row.order_count || '0', 10);
            const totalRevenue = parseInt(row.total_revenue || '0', 10);
            return {
                id: row.id,
                name: row.name,
                slug: row.slug,
                status: row.status,
                phone: row.phone,
                address: row.address,
                activeTemplateId: row.active_template_id,
                activePublishedVersion: row.active_published_version,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                owner: row.owner_id ? {
                    id: row.owner_id,
                    email: row.owner_email,
                    fullName: row.owner_name
                } : null,
                tableCount,
                orderCount,
                totalRevenue,
                metrics: {
                    tableCount,
                    orderCount,
                    totalRevenue
                }
            };
        });

        return {
            shops,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        };
    }

    /**
     * Get detail of a single shop
     */
    static async getShopDetail(tenantId: string) {
        const sql = `
            SELECT
                t.id, t.name, t.slug, t.status, t.phone, t.address, t.description,
                t.active_template_id, t.active_published_version,
                t.created_at, t.updated_at,
                owner.id as owner_id, owner.email as owner_email, owner.full_name as owner_name, owner.phone as owner_phone,
                (SELECT COUNT(*) FROM tables tbl WHERE tbl.tenant_id = t.id) as table_count,
                (SELECT COUNT(*) FROM orders o WHERE o.tenant_id = t.id) as order_count,
                (SELECT COALESCE(SUM(amount), 0) FROM manual_settlement_confirmations msc WHERE msc.tenant_id = t.id) as total_revenue
            FROM tenants t
            LEFT JOIN LATERAL (
                SELECT u.id, u.email, u.full_name, u.phone
                FROM memberships m
                JOIN users u ON u.id = m.user_id
                WHERE m.tenant_id = t.id AND m.role = 'owner'
                ORDER BY m.created_at ASC, m.id ASC
                LIMIT 1
            ) owner ON true
            WHERE t.id = $1
        `;

        const res = await query(sql, [tenantId]);
        if (res.rows.length === 0) {
            throw new AdminApiError(404, 'NOT_FOUND', 'Không tìm thấy nhà hàng');
        }

        const row = res.rows[0];
        const tableCount = parseInt(row.table_count || '0', 10);
        const orderCount = parseInt(row.order_count || '0', 10);
        const totalRevenue = parseInt(row.total_revenue || '0', 10);

        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            status: row.status,
            phone: row.phone,
            address: row.address,
            description: row.description,
            activeTemplateId: row.active_template_id,
            activePublishedVersion: row.active_published_version,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            owner: row.owner_id ? {
                id: row.owner_id,
                email: row.owner_email,
                fullName: row.owner_name,
                phone: row.owner_phone
            } : null,
            tableCount,
            orderCount,
            totalRevenue,
            metrics: {
                tableCount,
                orderCount,
                totalRevenue
            }
        };
    }

    /**
     * Create a new shop along with owner, default draft, tables, and categories transactionally.
     */
    static async createShop(input: CreateShopInput, createdBySuperAdminId: string) {
        input = validate(createShopSchema, input);

        return await withTransaction(async (client) => {
            try {
                // Check slug uniqueness
            const slugCheck = await client.query('SELECT id FROM tenants WHERE slug = $1', [input.slug]);
            if (slugCheck.rows.length > 0) {
                throw new AdminApiError(400, 'BAD_REQUEST', `Đường dẫn slug "${input.slug}" đã được sử dụng bởi quán khác`);
            }

            // 1. Create Tenant
            const tenantRes = await client.query(`
                INSERT INTO tenants (name, slug, phone, address, status)
                VALUES ($1, $2, $3, $4, 'active')
                RETURNING id, name, slug, status, created_at
            `, [input.name, input.slug, input.phone || null, input.address || null]);

            const tenant = tenantRes.rows[0];
            const tenantId = tenant.id;

            // Check existing owner account (Issue #82: explicit onboarding vs linking)
            const normalizedEmail = input.ownerEmail.trim().toLowerCase();
            const existingUserRes = await client.query(
                'SELECT id, email, full_name, password_hash FROM users WHERE LOWER(email) = LOWER($1)',
                [normalizedEmail]
            );

            const userExists = existingUserRes.rows.length > 0;
            if (userExists && !input.linkExistingOwner) {
                throw new AdminApiError(409, 'OWNER_EMAIL_EXISTS', `Tài khoản với email "${input.ownerEmail}" đã tồn tại trên hệ thống. Vui lòng xác nhận liên kết tài khoản hoặc sử dụng email khác.`);
            }

            if (!userExists && input.linkExistingOwner) {
                throw new AdminApiError(404, 'NOT_FOUND', `Không tìm thấy tài khoản với email "${input.ownerEmail}" để liên kết.`);
            }

            // 2. Create or link Owner User
            let ownerUser: { id: string; email: string; full_name: string };
            let ownerMode: 'created_new' | 'linked_existing';

            if (userExists) {
                ownerUser = {
                    id: existingUserRes.rows[0].id,
                    email: existingUserRes.rows[0].email,
                    full_name: existingUserRes.rows[0].full_name
                };
                ownerMode = 'linked_existing';
            } else {
                const passwordHash = await bcrypt.hash(input.ownerPassword!, 10);
                const userRes = await client.query(`
                    INSERT INTO users (email, password_hash, full_name, phone)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id, email, full_name
                `, [normalizedEmail, passwordHash, input.ownerFullName, input.phone || null]);
                ownerUser = userRes.rows[0];
                ownerMode = 'created_new';
            }

            // 3. Create Membership as owner
            await client.query(`
                INSERT INTO memberships (tenant_id, user_id, role, permissions)
                VALUES ($1, $2, 'owner', ARRAY[
                    'session.open', 'session.confirm_payment_close', 'session.close_without_charge',
                    'order.manage', 'order.serve', 'order.cancel', 'menu.manage', 'table.manage', 'report.view'
                ])
                ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner', is_active = true
            `, [tenantId, ownerUser.id]);

            // 4. Create initial CMS Draft and Published Version 1
            const initialTheme = {
                primaryColor: '#ea580c',
                fontFamily: 'Inter',
                layout: 'classic',
                showBanner: true,
                showPromotions: true,
                blockOrder: ['header', 'banners', 'promotions', 'categories', 'product_grid', 'cart_footer']
            };

            await client.query(`
                INSERT INTO cms_drafts (tenant_id, template_id, theme_config, content_config, version)
                VALUES ($1, 'classic', $2, '{"bannerIds":[]}'::jsonb, 1)
            `, [tenantId, JSON.stringify(initialTheme)]);

            await client.query(`
                INSERT INTO cms_published_versions (tenant_id, version, template_id, theme_config, content_config, changelog, published_by)
                VALUES ($1, 1, 'classic', $2, '{"bannerIds":[]}'::jsonb, 'Khởi tạo quán mới', $3)
            `, [tenantId, JSON.stringify(initialTheme), createdBySuperAdminId]);

            // 5. Create default tables
            for (let i = 1; i <= 5; i++) {
                const tableNum = `Bàn ${i < 10 ? '0' + i : i}`;
                const publicQrId = `qr-${input.slug}-b${i}`;
                await client.query(`
                    INSERT INTO tables (tenant_id, table_number, public_qr_id, capacity)
                    VALUES ($1, $2, $3, 4)
                `, [tenantId, tableNum, publicQrId]);
            }

            // 6. Create default categories
            await client.query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order)
                VALUES
                    ($1, 'Món Ăn Nổi Bật', 1),
                    ($1, 'Đồ Uống & Tráng Miệng', 2)
            `, [tenantId]);

            // 7. Record Super Admin Audit Log (sanitized, NO passwords or hashes)
            await client.query(`
                INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
                VALUES ($1, $2, 'SUPER_ADMIN_CREATE_SHOP', 'tenant', $3, $4)
            `, [tenantId, createdBySuperAdminId, tenantId, JSON.stringify({
                name: input.name,
                slug: input.slug,
                ownerEmail: input.ownerEmail,
                ownerFullName: input.ownerFullName,
                ownerMode
            })]);

            return {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                status: tenant.status,
                owner: ownerUser
            };
            } catch (err: any) {
                if (err instanceof AdminApiError) {
                    throw err;
                }
                // Handle concurrent race unique constraint violations cleanly (Issue #82)
                if (err?.code === '23505') {
                    if (err?.constraint === 'users_email_key' || err?.table === 'users') {
                        throw new AdminApiError(409, 'OWNER_EMAIL_EXISTS', `Tài khoản với email "${input.ownerEmail}" đã tồn tại trên hệ thống. Vui lòng xác nhận liên kết tài khoản hoặc sử dụng email khác.`);
                    }
                    if (err?.constraint === 'tenants_slug_key' || err?.table === 'tenants') {
                        throw new AdminApiError(400, 'BAD_REQUEST', `Đường dẫn slug "${input.slug}" đã được sử dụng bởi quán khác`);
                    }
                }
                throw err;
            }
        });
    }

    /**
     * Update shop details or status (e.g. suspend, activate, archive)
     */
    static async updateShop(tenantId: string, input: UpdateShopInput, adminUserId: string) {
        input = validate(updateShopSchema, input);

        return await withTransaction(async (client) => {
            const currentRes = await client.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
            if (currentRes.rows.length === 0) {
                throw new AdminApiError(404, 'NOT_FOUND', 'Không tìm thấy nhà hàng');
            }
            const current = currentRes.rows[0];

            if (input.slug && input.slug !== current.slug) {
                const slugCheck = await client.query(
                    'SELECT id FROM tenants WHERE slug = $1 AND id != $2',
                    [input.slug, tenantId]
                );
                if (slugCheck.rows.length > 0) {
                    throw new AdminApiError(400, 'BAD_REQUEST', `Đường dẫn slug "${input.slug}" đã bị trùng với quán khác`);
                }
            }

            // Prevent archiving tenant if there are open table sessions (Release 54 coordination)
            if (input.status === 'archived') {
                const openSessionsCheck = await client.query(
                    "SELECT COUNT(*) as count FROM table_sessions WHERE tenant_id = $1 AND status = 'OPEN'",
                    [tenantId]
                );
                const openCount = parseInt(openSessionsCheck.rows[0]?.count || '0', 10);
                if (openCount > 0) {
                    throw new AdminApiError(
                        400,
                        'CANNOT_ARCHIVE_ACTIVE_SESSIONS',
                        `Không thể lưu trữ quán khi vẫn còn ${openCount} phiên bàn đang mở (OPEN). Vui lòng hoàn tất thanh toán hoặc đóng các phiên trước khi lưu trữ.`
                    );
                }
            }

            const updatedName = input.name ?? current.name;
            const updatedSlug = input.slug ?? current.slug;
            const updatedStatus = input.status ?? current.status;
            const updatedPhone = input.phone !== undefined ? input.phone : current.phone;
            const updatedAddress = input.address !== undefined ? input.address : current.address;
            const updatedDesc = input.description !== undefined ? input.description : current.description;

            const updateRes = await client.query(`
                UPDATE tenants
                SET name = $1, slug = $2, status = $3, phone = $4, address = $5, description = $6, updated_at = NOW()
                WHERE id = $7
                RETURNING id, name, slug, status, phone, address, description, active_template_id, active_published_version, created_at, updated_at
            `, [updatedName, updatedSlug, updatedStatus, updatedPhone, updatedAddress, updatedDesc, tenantId]);

            const action = input.status && input.status !== current.status
                ? 'SUPER_ADMIN_STATUS_CHANGE'
                : 'SUPER_ADMIN_UPDATE_SHOP';

            // Audit log with structured diff (sanitized)
            await client.query(`
                INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
                VALUES ($1, $2, $3, 'tenant', $4, $5)
            `, [tenantId, adminUserId, action, tenantId.toString(), JSON.stringify({
                previous: {
                    name: current.name,
                    slug: current.slug,
                    status: current.status,
                    phone: current.phone,
                    address: current.address,
                    description: current.description
                },
                updated: {
                    name: updatedName,
                    slug: updatedSlug,
                    status: updatedStatus,
                    phone: updatedPhone,
                    address: updatedAddress,
                    description: updatedDesc
                }
            })]);

            return updateRes.rows[0];
        });
    }

    /**
     * Get templates registry
     */
    static async listTemplates() {
        const res = await query(`
            SELECT id, name, description, thumbnail_url, default_blocks, editable_fields, is_active, created_at
            FROM cms_templates
            ORDER BY created_at ASC
        `);
        return res.rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            thumbnailUrl: row.thumbnail_url,
            defaultBlocks: row.default_blocks,
            editableFields: row.editable_fields,
            isActive: row.is_active,
            createdAt: row.created_at
        }));
    }

    /**
     * List audit logs with bounded pagination and filtering
     */
    static async listAuditLogs(input: ListAuditLogsQueryInput) {
        const page = Math.max(1, input.page);
        const limit = Math.min(100, Math.max(1, input.limit));
        const offset = (page - 1) * limit;

        const whereClauses: string[] = ['1=1'];
        const params: any[] = [];

        if (input.tenantId) {
            params.push(input.tenantId);
            whereClauses.push(`al.tenant_id = $${params.length}`);
        }

        if (input.userId) {
            params.push(input.userId);
            whereClauses.push(`al.user_id = $${params.length}`);
        }

        if (input.action && input.action.trim()) {
            params.push(input.action.trim());
            whereClauses.push(`al.action = $${params.length}`);
        }

        const fromDateStr = input.startDate || input.from;
        if (fromDateStr) {
            const fromDate = new Date(fromDateStr);
            params.push(fromDate.toISOString());
            whereClauses.push(`al.created_at >= $${params.length}`);
        }

        const toDateStr = input.endDate || input.to;
        if (toDateStr) {
            const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(toDateStr);
            const toDate = isDateOnly ? new Date(`${toDateStr}T23:59:59.999Z`) : new Date(toDateStr);
            params.push(toDate.toISOString());
            whereClauses.push(`al.created_at <= $${params.length}`);
        }

        const whereSql = whereClauses.join(' AND ');

        // 1. Total count query
        const countRes = await query(`SELECT COUNT(*) as total FROM audit_logs al WHERE ${whereSql}`, params);
        const total = parseInt(countRes.rows[0]?.total || '0', 10);

        // 2. Data query
        const dataParams = [...params];
        dataParams.push(limit);
        const limitParamIndex = dataParams.length;
        dataParams.push(offset);
        const offsetParamIndex = dataParams.length;

        const dataSql = `
            SELECT
                al.id, al.tenant_id, al.user_id, al.action, al.resource_type, al.resource_id, al.details, al.created_at,
                u.email as user_email, u.full_name as user_name,
                t.name as tenant_name
            FROM audit_logs al
            LEFT JOIN users u ON u.id = al.user_id
            LEFT JOIN tenants t ON t.id = al.tenant_id
            WHERE ${whereSql}
            ORDER BY al.created_at DESC, al.id DESC
            LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
        `;

        const dataRes = await query(dataSql, dataParams);
        const logs = dataRes.rows.map(row => ({
            id: row.id,
            tenantId: row.tenant_id,
            tenantName: row.tenant_name || null,
            userId: row.user_id || null,
            userName: row.user_name || null,
            userEmail: row.user_email || null,
            action: row.action,
            resourceType: row.resource_type,
            resourceId: row.resource_id,
            details: row.details,
            createdAt: row.created_at
        }));

        return {
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        };
    }
}
