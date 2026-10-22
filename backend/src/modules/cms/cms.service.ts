import { query, withTransaction } from '../../db/pool.js';

import { z } from 'zod';
import { validate } from '../../utils/validation.js';
import { safeUrl, themeSchema, bannerSchema, promotionSchema } from '../../utils/cms-validation.js';

export interface UpdateProfileInput {
    name?: string;
    description?: string;
    logoUrl?: string;
    coverUrl?: string;
    phone?: string;
    address?: string;
    openingHours?: string;
}

export interface SaveDraftInput {
    templateId: string;
    themeConfig: Record<string, any>;
    contentConfig?: Record<string, any>;
}

export interface BannerInput {
    title: string;
    description?: string;
    imageUrl: string;
    ctaLink?: string;
    sortOrder?: number;
    isActive?: boolean;
    startTime?: string;
    endTime?: string;
}

export interface PromotionInput {
    code?: string | null;
    title: string;
    description?: string | null;
    discountType: 'PERCENT' | 'FIXED_AMOUNT';
    discountValue: number;
    minOrderAmount?: number;
    maxDiscountAmount?: number | null;
    maxRedemptions?: number;
    priority?: number;
    isActive?: boolean;
    startTime?: string;
    endTime?: string;
}

export function normalizeThemeConfig(config: any) {
    const raw = config && typeof config === 'object' ? config : {};
    return {
        primaryColor: typeof raw.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.primaryColor) ? raw.primaryColor.toLowerCase() : '#ea580c',
        fontFamily: ['Inter', 'Roboto', 'Be Vietnam Pro', 'Nunito', 'system-ui'].includes(raw.fontFamily) ? raw.fontFamily : 'Inter',
        layout: ['classic', 'modern_grid', 'compact_list', 'banner_featured'].includes(raw.layout) ? raw.layout : 'classic',
        showBanner: raw.showBanner !== undefined ? Boolean(raw.showBanner) : true,
        showPromotions: raw.showPromotions !== undefined ? Boolean(raw.showPromotions) : true,
        bannerDisplayMode: raw.bannerDisplayMode === 'slide' ? 'slide' : 'stack',
        blockOrder: Array.isArray(raw.blockOrder) && raw.blockOrder.length > 0 ? raw.blockOrder : ['header', 'banners', 'promotions', 'categories', 'product_grid', 'cart_footer'],
        staffTheme: raw.staffTheme && typeof raw.staffTheme === 'object' && /^#[0-9a-fA-F]{6}$/.test(raw.staffTheme.accentColor) && /^#[0-9a-fA-F]{6}$/.test(raw.staffTheme.textColor) ? {
            accentColor: String(raw.staffTheme.accentColor).toLowerCase(),
            textColor: String(raw.staffTheme.textColor).toLowerCase()
        } : {
            accentColor: '#ea580c',
            textColor: '#2f2a26'
        },
        staffDensity: raw.staffDensity === 'compact' ? 'compact' : 'comfortable'
    };
}

export class CmsService {
    /**
     * Get Shop Profile and active theme/template settings
     */
    static async getProfile(tenantId: string) {
        const res = await query(`
            SELECT 
                id, slug, name, description, logo_url, cover_url,
                phone, address, opening_hours, active_template_id,
                active_theme_config, active_published_version, status,
                created_at, updated_at
            FROM tenants
            WHERE id = $1
        `, [tenantId]);

        if (res.rows.length === 0) {
            throw new Error('Không tìm thấy thông tin quán');
        }

        const row = res.rows[0];
        return {
            id: row.id,
            slug: row.slug,
            name: row.name,
            description: row.description,
            logoUrl: row.logo_url,
            coverUrl: row.cover_url,
            phone: row.phone,
            address: row.address,
            openingHours: row.opening_hours,
            activeTemplateId: row.active_template_id,
            activeThemeConfig: normalizeThemeConfig(row.active_theme_config),
            activePublishedVersion: row.active_published_version,
            status: row.status
        };
    }

    /**
     * Update Shop Profile
     */
    static async updateProfile(tenantId: string, input: UpdateProfileInput, userId: string) {
        validate(safeUrl.nullish(), input.logoUrl);
        validate(safeUrl.nullish(), input.coverUrl);
        return await withTransaction(async (client) => {
            const currentRes = await client.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
            if (currentRes.rows.length === 0) {
                throw new Error('Không tìm thấy thông tin quán');
            }
            const current = currentRes.rows[0];

            const name = input.name ?? current.name;
            const description = input.description !== undefined ? input.description : current.description;
            const logoUrl = input.logoUrl !== undefined ? input.logoUrl : current.logo_url;
            const coverUrl = input.coverUrl !== undefined ? input.coverUrl : current.cover_url;
            const phone = input.phone !== undefined ? input.phone : current.phone;
            const address = input.address !== undefined ? input.address : current.address;
            const openingHours = input.openingHours !== undefined ? input.openingHours : current.opening_hours;

            const res = await client.query(`
                UPDATE tenants
                SET name = $1, description = $2, logo_url = $3, cover_url = $4,
                    phone = $5, address = $6, opening_hours = $7, updated_at = NOW()
                WHERE id = $8
                RETURNING *
            `, [name, description, logoUrl, coverUrl, phone, address, openingHours, tenantId]);

            // Audit
            await client.query(`
                INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
                VALUES ($1, $2, 'SHOP_UPDATE_PROFILE', 'tenant', $3, $4)
            `, [tenantId, userId, tenantId.toString(), JSON.stringify(input)]);

            const r = res.rows[0];
            return {
                id: r.id,
                slug: r.slug,
                name: r.name,
                description: r.description,
                logoUrl: r.logo_url,
                logo_url: r.logo_url,
                coverUrl: r.cover_url,
                cover_url: r.cover_url,
                phone: r.phone,
                address: r.address,
                openingHours: r.opening_hours,
                opening_hours: r.opening_hours,
                activeTemplateId: r.active_template_id,
                activeThemeConfig: normalizeThemeConfig(r.active_theme_config),
                activePublishedVersion: r.active_published_version,
                status: r.status
            };
        });
    }

    /**
     * Get Shop CMS Draft
     */
    static async getDraft(tenantId: string) {
        const res = await query(`
            SELECT id, tenant_id, template_id, theme_config, content_config, version, updated_at
            FROM cms_drafts
            WHERE tenant_id = $1
        `, [tenantId]);

        if (res.rows.length === 0) {
            // If draft doesn't exist yet, return active settings as draft
            const tenant = await this.getProfile(tenantId);
            return {
                templateId: tenant.activeTemplateId,
                themeConfig: tenant.activeThemeConfig,
                contentConfig: { bannerIds: [] },
                version: 1
            };
        }

        const row = res.rows[0];
        return {
            id: row.id,
            templateId: row.template_id,
            themeConfig: normalizeThemeConfig(row.theme_config),
            contentConfig: row.content_config,
            version: row.version,
            updatedAt: row.updated_at
        };
    }

    /**
     * Save Shop CMS Draft
     */
    static async saveDraft(tenantId: string, input: SaveDraftInput, userId: string) {
        validate(themeSchema, input.themeConfig);
        validate(z.object({ bannerIds: z.array(z.string().uuid()).max(100).optional(), featuredItemIds: z.array(z.string().uuid()).max(100).optional() }).strict(), input.contentConfig || {});
        const template = await query('SELECT id FROM cms_templates WHERE id = $1 AND is_active = true', [input.templateId]);
        if (!template.rows.length) throw new Error('Mẫu giao diện không khả dụng');
        const themeConfigJson = JSON.stringify(input.themeConfig || {});
        const contentConfigJson = JSON.stringify(input.contentConfig || {});

        const res = await query(`
            INSERT INTO cms_drafts (tenant_id, template_id, theme_config, content_config, version, updated_by, updated_at)
            VALUES ($1, $2, $3, $4, 1, $5, NOW())
            ON CONFLICT (tenant_id) DO UPDATE SET
                template_id = EXCLUDED.template_id,
                theme_config = EXCLUDED.theme_config,
                content_config = EXCLUDED.content_config,
                updated_by = EXCLUDED.updated_by,
                updated_at = NOW()
            RETURNING *
        `, [tenantId, input.templateId, themeConfigJson, contentConfigJson, userId]);

        return res.rows[0];
    }

    /**
     * Publish current Draft to Storefront
     */
    static async publishDraft(tenantId: string, changelog: string = 'Xuất bản giao diện mới', userId: string) {
        return await withTransaction(async (client) => {
            // Get current draft
            const draftRes = await client.query('SELECT * FROM cms_drafts WHERE tenant_id = $1', [tenantId]);
            if (draftRes.rows.length === 0) {
                throw new Error('Chưa có bản nháp nào được lưu');
            }
            const draft = draftRes.rows[0];
            const normalizedTheme = normalizeThemeConfig(draft.theme_config);
            const themeConfigJson = JSON.stringify(normalizedTheme);

            // Get tenant current published version
            await client.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [tenantId]);
            const latest = await client.query('SELECT COALESCE(MAX(version), 0) as version FROM cms_published_versions WHERE tenant_id = $1', [tenantId]);
            const nextVersion = Number(latest.rows[0].version) + 1;

            // Insert into cms_published_versions
            await client.query(`
                INSERT INTO cms_published_versions (tenant_id, version, template_id, theme_config, content_config, changelog, published_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [tenantId, nextVersion, draft.template_id, themeConfigJson, draft.content_config, changelog, userId]);

            // Update tenants active configuration
            await client.query(`
                UPDATE tenants
                SET active_template_id = $1, active_theme_config = $2, active_published_version = $3, updated_at = NOW()
                WHERE id = $4
            `, [draft.template_id, themeConfigJson, nextVersion, tenantId]);

            // Audit
            await client.query(`
                INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
                VALUES ($1, $2, 'SHOP_PUBLISH_CMS', 'cms_published_version', $3, $4)
            `, [tenantId, userId, nextVersion.toString(), JSON.stringify({
                version: nextVersion,
                templateId: draft.template_id,
                changelog
            })]);

            return {
                publishedVersion: nextVersion,
                templateId: draft.template_id,
                themeConfig: normalizedTheme,
                message: `Đã xuất bản giao diện phiên bản v${nextVersion} thành công!`
            };
        });
    }

    /**
     * Get published versions history
     */
    static async getVersions(tenantId: string) {
        const res = await query(`
            SELECT 
                pv.id, pv.version, pv.template_id, pv.theme_config,
                pv.changelog, pv.published_at, u.full_name as published_by_name
            FROM cms_published_versions pv
            LEFT JOIN users u ON u.id = pv.published_by
            WHERE pv.tenant_id = $1
            ORDER BY pv.version DESC
            LIMIT 20
        `, [tenantId]);
        return res.rows.map(row => ({ id: row.id, version: row.version, templateId: row.template_id, themeConfig: normalizeThemeConfig(row.theme_config), changelog: row.changelog, publishedAt: row.published_at, publishedByName: row.published_by_name }));
    }

    /**
     * Rollback to a specific published version
     */
    static async rollbackVersion(tenantId: string, versionNumber: number, userId: string) {
        return await withTransaction(async (client) => {
            await client.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [tenantId]);
            const verRes = await client.query(`
                SELECT * FROM cms_published_versions
                WHERE tenant_id = $1 AND version = $2
            `, [tenantId, versionNumber]);

            if (verRes.rows.length === 0) {
                throw new Error(`Không tìm thấy phiên bản v${versionNumber}`);
            }

            const targetVersion = verRes.rows[0];
            const normalizedTheme = normalizeThemeConfig(targetVersion.theme_config);
            const themeConfigJson = JSON.stringify(normalizedTheme);

            // Update tenants table
            await client.query(`
                UPDATE tenants
                SET active_template_id = $1, active_theme_config = $2, active_published_version = $3, updated_at = NOW()
                WHERE id = $4
            `, [targetVersion.template_id, themeConfigJson, targetVersion.version, tenantId]);

            // Sync back into cms_drafts as well
            await client.query(`
                INSERT INTO cms_drafts (tenant_id, template_id, theme_config, content_config, version, updated_by, updated_at)
                VALUES ($1, $2, $3, $4, 1, $5, NOW())
                ON CONFLICT (tenant_id) DO UPDATE SET
                    template_id = EXCLUDED.template_id,
                    theme_config = EXCLUDED.theme_config,
                    content_config = EXCLUDED.content_config,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()
            `, [tenantId, targetVersion.template_id, themeConfigJson, targetVersion.content_config, userId]);

            // Audit
            await client.query(`
                INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
                VALUES ($1, $2, 'SHOP_ROLLBACK_CMS', 'cms_published_version', $3, $4)
            `, [tenantId, userId, versionNumber.toString(), JSON.stringify({ rolledBackTo: versionNumber })]);

            return {
                rolledBackTo: versionNumber,
                templateId: targetVersion.template_id,
                themeConfig: targetVersion.theme_config,
                message: `Đã khôi phục về phiên bản v${versionNumber} thành công!`
            };
        });
    }

    // ==================== BANNERS ====================

    static async listBanners(tenantId: string) {
        const res = await query(`
            SELECT id, title, description, image_url, cta_link, sort_order, is_active, start_time, end_time, created_at
            FROM banners
            WHERE tenant_id = $1
            ORDER BY sort_order ASC, created_at DESC
        `, [tenantId]);
        return res.rows.map(row => ({ id: row.id, title: row.title, description: row.description, imageUrl: row.image_url, ctaLink: row.cta_link, sortOrder: row.sort_order, isActive: row.is_active, startTime: row.start_time, endTime: row.end_time }));
    }

    static async createBanner(tenantId: string, input: BannerInput) {
        input = validate(bannerSchema, input);
        const res = await query(`
            INSERT INTO banners (tenant_id, title, description, image_url, cta_link, sort_order, is_active, start_time, end_time)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            tenantId,
            input.title,
            input.description || null,
            input.imageUrl,
            input.ctaLink || null,
            input.sortOrder || 0,
            input.isActive ?? true,
            input.startTime ? new Date(input.startTime) : null,
            input.endTime ? new Date(input.endTime) : null
        ]);
        return res.rows[0];
    }

    static async updateBanner(tenantId: string, bannerId: string, input: Partial<BannerInput>) {
        input = validate(bannerSchema.partial(), input);
        const currentRes = await query('SELECT * FROM banners WHERE id = $1 AND tenant_id = $2', [bannerId, tenantId]);
        if (currentRes.rows.length === 0) {
            throw new Error('Không tìm thấy banner');
        }
        const cur = currentRes.rows[0];

        const title = input.title ?? cur.title;
        const description = input.description !== undefined ? input.description : cur.description;
        const imageUrl = input.imageUrl ?? cur.image_url;
        const ctaLink = input.ctaLink !== undefined ? input.ctaLink : cur.cta_link;
        const sortOrder = input.sortOrder !== undefined ? input.sortOrder : cur.sort_order;
        const isActive = input.isActive !== undefined ? input.isActive : cur.is_active;

        const res = await query(`
            UPDATE banners
            SET title = $1, description = $2, image_url = $3, cta_link = $4, sort_order = $5, is_active = $6, updated_at = NOW()
            WHERE id = $7 AND tenant_id = $8
            RETURNING *
        `, [title, description, imageUrl, ctaLink, sortOrder, isActive, bannerId, tenantId]);

        return res.rows[0];
    }

    static async deleteBanner(tenantId: string, bannerId: string) {
        const res = await query('DELETE FROM banners WHERE id = $1 AND tenant_id = $2 RETURNING id', [bannerId, tenantId]);
        if (res.rows.length === 0) {
            throw new Error('Không tìm thấy banner để xóa');
        }
        return { success: true };
    }

    // ==================== PROMOTIONS ====================

    static async listPromotions(tenantId: string) {
        const res = await query(`
            SELECT 
                id, code, title, description, discount_type, discount_value,
                min_order_amount, max_discount_amount, max_redemptions, current_redemptions,
                priority, is_active, start_time, end_time, created_at
            FROM promotions
            WHERE tenant_id = $1
            ORDER BY priority DESC, created_at DESC
        `, [tenantId]);
        return res.rows.map(row => ({ id: row.id, code: row.code, title: row.title, description: row.description, discountType: row.discount_type, discountValue: Number(row.discount_value), minOrderAmount: Number(row.min_order_amount), maxDiscountAmount: row.max_discount_amount == null ? undefined : Number(row.max_discount_amount), maxRedemptions: row.max_redemptions, currentRedemptions: row.current_redemptions, priority: row.priority, isActive: row.is_active, startTime: row.start_time, endTime: row.end_time }));
    }

    static async createPromotion(tenantId: string, input: PromotionInput) {
        input = validate(promotionSchema, input);
        if (input.startTime && input.endTime && new Date(input.endTime) <= new Date(input.startTime)) throw new Error('Ngày kết thúc phải sau ngày bắt đầu');
        if (input.discountType === 'PERCENT' && (input.discountValue <= 0 || input.discountValue > 100)) {
            throw new Error('Giá trị giảm phần trăm (%) phải từ 1 đến 100');
        }
        if (input.discountType === 'FIXED_AMOUNT' && input.discountValue <= 0) {
            throw new Error('Số tiền giảm phải lớn hơn 0');
        }

        const res = await query(`
            INSERT INTO promotions (
                tenant_id, code, title, description, discount_type, discount_value,
                min_order_amount, max_discount_amount, max_redemptions, priority, is_active,
                start_time, end_time
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [
            tenantId,
            input.code ? input.code.toUpperCase().trim() : null,
            input.title,
            input.description || null,
            input.discountType,
            input.discountValue,
            input.minOrderAmount || 0,
            input.maxDiscountAmount || null,
            input.maxRedemptions || null,
            input.priority || 0,
            input.isActive ?? true,
            input.startTime ? new Date(input.startTime) : new Date(),
            input.endTime ? new Date(input.endTime) : null
        ]);

        return res.rows[0];
    }

    static async updatePromotion(tenantId: string, promoId: string, input: Partial<PromotionInput>) {
        input = validate(promotionSchema.partial(), input);
        const curRes = await query('SELECT * FROM promotions WHERE id = $1 AND tenant_id = $2', [promoId, tenantId]);
        if (curRes.rows.length === 0) {
            throw new Error('Không tìm thấy chương trình khuyến mãi');
        }
        const cur = curRes.rows[0];

        const code = input.code !== undefined ? (input.code ? input.code.toUpperCase().trim() : null) : cur.code;
        const title = input.title ?? cur.title;
        const description = input.description !== undefined ? input.description : cur.description;
        const discountType = input.discountType ?? cur.discount_type;
        const discountValue = input.discountValue !== undefined ? input.discountValue : parseInt(cur.discount_value, 10);
        if (discountType === 'PERCENT' && discountValue > 100) throw new Error('Giảm phần trăm không vượt quá 100');
        const minOrderAmount = input.minOrderAmount !== undefined ? input.minOrderAmount : parseInt(cur.min_order_amount, 10);
        const maxDiscountAmount = input.maxDiscountAmount !== undefined ? input.maxDiscountAmount : cur.max_discount_amount;
        const maxRedemptions = input.maxRedemptions !== undefined ? input.maxRedemptions : cur.max_redemptions;
        const priority = input.priority !== undefined ? input.priority : cur.priority;
        const isActive = input.isActive !== undefined ? input.isActive : cur.is_active;

        const res = await query(`
            UPDATE promotions
            SET code = $1, title = $2, description = $3, discount_type = $4, discount_value = $5,
                min_order_amount = $6, max_discount_amount = $7, max_redemptions = $8,
                priority = $9, is_active = $10, updated_at = NOW()
            WHERE id = $11 AND tenant_id = $12
            RETURNING *
        `, [
            code, title, description, discountType, discountValue,
            minOrderAmount, maxDiscountAmount, maxRedemptions, priority, isActive,
            promoId, tenantId
        ]);

        return res.rows[0];
    }

    static async deletePromotion(tenantId: string, promoId: string) {
        const res = await query('DELETE FROM promotions WHERE id = $1 AND tenant_id = $2 RETURNING id', [promoId, tenantId]);
        if (res.rows.length === 0) {
            throw new Error('Không tìm thấy chương trình khuyến mãi');
        }
        return { success: true };
    }
}
