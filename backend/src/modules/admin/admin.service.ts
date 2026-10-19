import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../db/pool.js';

export interface CreateShopInput {
    name: string;
    slug: string;
    phone?: string;
    address?: string;
    ownerEmail: string;
    ownerFullName: string;
    ownerPassword?: string;
}

export interface UpdateShopInput {
    name?: string;
    slug?: string;
    status?: 'draft' | 'active' | 'suspended' | 'archived';
    phone?: string;
    address?: string;
    description?: string;
}

export class AdminService {
    /**
     * Get platform overview statistics
     */
    static async getPlatformStats() {
        const shopsRes = await query(`
            SELECT 
                COUNT(*) as total_shops,
                COUNT(*) FILTER (WHERE status = 'active') as active_shops,
                COUNT(*) FILTER (WHERE status = 'suspended') as suspended_shops
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
            totalRevenue: parseInt(revenueRes.rows[0].total_confirmed_revenue, 10),
            totalSettlements: parseInt(revenueRes.rows[0].total_settlements, 10),
            totalOrders: parseInt(ordersRes.rows[0].total_orders, 10)
        };
    }

    /**
     * List shops with search and status filtering
     */
    static async listShops(search?: string, status?: string) {
        let sql = `
            SELECT 
                t.id, t.name, t.slug, t.status, t.phone, t.address,
                t.active_template_id, t.active_published_version,
                t.created_at, t.updated_at,
                u.id as owner_id, u.email as owner_email, u.full_name as owner_name,
                (SELECT COUNT(*) FROM tables tbl WHERE tbl.tenant_id = t.id) as table_count,
                (SELECT COUNT(*) FROM orders o WHERE o.tenant_id = t.id) as order_count,
                (SELECT COALESCE(SUM(amount), 0) FROM manual_settlement_confirmations msc WHERE msc.tenant_id = t.id) as total_revenue
            FROM tenants t
            LEFT JOIN memberships m ON m.tenant_id = t.id AND m.role = 'owner'
            LEFT JOIN users u ON u.id = m.user_id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (status && status !== 'all') {
            params.push(status);
            sql += ` AND t.status = $${params.length}`;
        }

        if (search && search.trim()) {
            params.push(`%${search.trim().toLowerCase()}%`);
            sql += ` AND (LOWER(t.name) LIKE $${params.length} OR LOWER(t.slug) LIKE $${params.length} OR LOWER(COALESCE(u.email, '')) LIKE $${params.length})`;
        }

        sql += ` ORDER BY t.created_at DESC`;

        const res = await query(sql, params);
        return res.rows.map(row => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            status: row.status,
            phone: row.phone,
            address: row.address,
            activeTemplateId: row.active_template_id,
            activePublishedVersion: row.active_published_version,
            createdAt: row.created_at,
            owner: row.owner_id ? {
                id: row.owner_id,
                email: row.owner_email,
                fullName: row.owner_name
            } : null,
            tableCount: parseInt(row.table_count || '0', 10),
            orderCount: parseInt(row.order_count || '0', 10),
            totalRevenue: parseInt(row.total_revenue || '0', 10)
        }));
    }

    /**
     * Create a new shop along with its owner, draft and default tables
     */
    static async createShop(input: CreateShopInput, createdBySuperAdminId: string) {
        return await withTransaction(async (client) => {
            // Check slug uniqueness
            const slugCheck = await client.query('SELECT id FROM tenants WHERE slug = $1', [input.slug]);
            if (slugCheck.rows.length > 0) {
                throw new Error(`Đường dẫn slug "${input.slug}" đã được sử dụng bởi quán khác`);
            }

            // 1. Create Tenant
            const tenantRes = await client.query(`
                INSERT INTO tenants (name, slug, phone, address, status)
                VALUES ($1, $2, $3, $4, 'active')
                RETURNING id, name, slug, status, created_at
            `, [input.name, input.slug, input.phone || null, input.address || null]);

            const tenant = tenantRes.rows[0];
            const tenantId = tenant.id;

            // 2. Create or find Owner User
            const password = input.ownerPassword || '123456';
            const passwordHash = await bcrypt.hash(password, 10);

            const userRes = await client.query(`
                INSERT INTO users (email, password_hash, full_name, phone)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
                RETURNING id, email, full_name
            `, [input.ownerEmail, passwordHash, input.ownerFullName, input.phone || null]);

            const ownerUser = userRes.rows[0];

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

            // 7. Record Super Admin Audit Log
            await client.query(`
                INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
                VALUES ($1, $2, 'SUPER_ADMIN_CREATE_SHOP', 'tenant', $3, $4)
            `, [tenantId, createdBySuperAdminId, tenantId, JSON.stringify({
                name: input.name,
                slug: input.slug,
                ownerEmail: input.ownerEmail
            })]);

            return {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                status: tenant.status,
                owner: ownerUser
            };
        });
    }

    /**
     * Update shop details or status (e.g. suspend or activate)
     */
    static async updateShop(tenantId: string, input: UpdateShopInput, adminUserId: string) {
        return await withTransaction(async (client) => {
            const currentRes = await client.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
            if (currentRes.rows.length === 0) {
                throw new Error('Không tìm thấy quán');
            }
            const current = currentRes.rows[0];

            if (input.slug && input.slug !== current.slug) {
                const slugCheck = await client.query('SELECT id FROM tenants WHERE slug = $1 AND id != $2', [input.slug, tenantId]);
                if (slugCheck.rows.length > 0) {
                    throw new Error(`Slug "${input.slug}" đã bị trùng với quán khác`);
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
                RETURNING *
            `, [updatedName, updatedSlug, updatedStatus, updatedPhone, updatedAddress, updatedDesc, tenantId]);

            // Audit log
            await client.query(`
                INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
                VALUES ($1, $2, 'SUPER_ADMIN_UPDATE_SHOP', 'tenant', $3, $4)
            `, [tenantId, adminUserId, tenantId.toString(), JSON.stringify({
                previous: { name: current.name, status: current.status, slug: current.slug },
                updated: { name: updatedName, status: updatedStatus, slug: updatedSlug }
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
        return res.rows;
    }

    /**
     * List audit logs with pagination
     */
    static async listAuditLogs(limit: number = 50) {
        const res = await query(`
            SELECT 
                al.id, al.tenant_id, al.action, al.resource_type, al.resource_id, al.details, al.created_at,
                u.email as user_email, u.full_name as user_name,
                t.name as tenant_name
            FROM audit_logs al
            LEFT JOIN users u ON u.id = al.user_id
            LEFT JOIN tenants t ON t.id = al.tenant_id
            ORDER BY al.created_at DESC
            LIMIT $1
        `, [limit]);
        return res.rows;
    }
}
