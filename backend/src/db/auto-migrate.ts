import { pool } from './pool.js';

export async function ensureSchemaOnBoot() {
    console.log('🔄 Checking and applying auto-migrations...');
    let client;
    try {
        client = await pool.connect();

        // 1. group_name in menu_item_variants & product sort_order
        await client.query(`
            ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS group_name VARCHAR(100) DEFAULT 'Biến thể';
            ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
            CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_cat_sort ON menu_items(tenant_id, category_id, sort_order);
        `);

        // 1b. Option Groups (Nhóm tùy chọn) & Options (Lựa chọn)
        await client.query(`
            CREATE TABLE IF NOT EXISTS item_option_groups (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                selection_mode VARCHAR(32) NOT NULL DEFAULT 'SINGLE', -- 'SINGLE' | 'MULTIPLE'
                min_selections INT NOT NULL DEFAULT 0,
                max_selections INT NOT NULL DEFAULT 1,
                pricing_mode VARCHAR(32) NOT NULL DEFAULT 'ADDITIVE', -- 'FREE' | 'ADDITIVE'
                sort_order INT NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_item_option_groups_item ON item_option_groups(tenant_id, menu_item_id, sort_order);

            CREATE TABLE IF NOT EXISTS item_options (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                group_id UUID NOT NULL REFERENCES item_option_groups(id) ON DELETE CASCADE,
                menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                price_delta BIGINT NOT NULL DEFAULT 0,
                is_default BOOLEAN NOT NULL DEFAULT FALSE,
                is_available BOOLEAN NOT NULL DEFAULT TRUE,
                sort_order INT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_item_options_group ON item_options(tenant_id, group_id, sort_order);
            CREATE INDEX IF NOT EXISTS idx_item_options_item ON item_options(tenant_id, menu_item_id);

            -- Backfill existing groups from menu_item_variants if any
            INSERT INTO item_option_groups (tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order)
            SELECT 
                v.tenant_id, 
                v.menu_item_id, 
                COALESCE(NULLIF(TRIM(v.group_name), ''), 'Biến thể') as name,
                'SINGLE' as selection_mode,
                0 as min_selections,
                1 as max_selections,
                CASE WHEN MAX(v.price_adjustment) > 0 THEN 'ADDITIVE' ELSE 'FREE' END as pricing_mode,
                0 as sort_order
            FROM menu_item_variants v
            WHERE NOT EXISTS (
                SELECT 1 FROM item_option_groups g 
                WHERE g.tenant_id = v.tenant_id AND g.menu_item_id = v.menu_item_id AND g.name = COALESCE(NULLIF(TRIM(v.group_name), ''), 'Biến thể')
            )
            GROUP BY v.tenant_id, v.menu_item_id, COALESCE(NULLIF(TRIM(v.group_name), ''), 'Biến thể')
            ON CONFLICT DO NOTHING;

            -- Backfill existing options preserving option ID = variant ID
            INSERT INTO item_options (id, tenant_id, group_id, menu_item_id, name, price_delta, is_available, sort_order)
            SELECT 
                v.id,
                v.tenant_id,
                g.id as group_id,
                v.menu_item_id,
                v.name,
                GREATEST(0, v.price_adjustment) as price_delta,
                v.is_available,
                0 as sort_order
            FROM menu_item_variants v
            JOIN item_option_groups g ON g.tenant_id = v.tenant_id AND g.menu_item_id = v.menu_item_id AND g.name = COALESCE(NULLIF(TRIM(v.group_name), ''), 'Biến thể')
            ON CONFLICT (id) DO NOTHING;
        `);

        // 2. uploaded_images table for database-persisted media storage
        await client.query(`
            CREATE TABLE IF NOT EXISTS uploaded_images (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                filename VARCHAR(255) NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                size_bytes INT NOT NULL,
                data_base64 TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_uploaded_images_tenant ON uploaded_images(tenant_id);
        `);

        // 3. banners table
        await client.query(`
            CREATE TABLE IF NOT EXISTS banners (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                image_url TEXT NOT NULL,
                cta_link TEXT,
                sort_order INT NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                start_time TIMESTAMPTZ DEFAULT NULL,
                end_time TIMESTAMPTZ DEFAULT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            ALTER TABLE banners ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
            ALTER TABLE banners ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ DEFAULT NULL;
            ALTER TABLE banners ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ DEFAULT NULL;
            CREATE INDEX IF NOT EXISTS idx_banners_tenant_active ON banners(tenant_id, is_active, sort_order);
        `);

        // 4. promotions and promotion_redemptions tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS promotions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                code VARCHAR(64),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                discount_type VARCHAR(32) NOT NULL DEFAULT 'PERCENT',
                discount_value BIGINT NOT NULL,
                min_order_amount BIGINT NOT NULL DEFAULT 0,
                max_discount_amount BIGINT,
                max_redemptions INT,
                current_redemptions INT NOT NULL DEFAULT 0,
                priority INT NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                start_time TIMESTAMPTZ DEFAULT NOW(),
                end_time TIMESTAMPTZ DEFAULT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            ALTER TABLE promotions ADD COLUMN IF NOT EXISTS current_redemptions INT NOT NULL DEFAULT 0;
            ALTER TABLE promotions ADD COLUMN IF NOT EXISTS min_order_amount BIGINT NOT NULL DEFAULT 0;
            ALTER TABLE promotions ADD COLUMN IF NOT EXISTS max_discount_amount BIGINT;
            ALTER TABLE promotions ADD COLUMN IF NOT EXISTS max_redemptions INT;
            ALTER TABLE promotions ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;
            ALTER TABLE promotions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
            ALTER TABLE promotions ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ DEFAULT NOW();
            ALTER TABLE promotions ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ DEFAULT NULL;
            CREATE INDEX IF NOT EXISTS idx_promotions_tenant_active ON promotions(tenant_id, is_active);

            CREATE TABLE IF NOT EXISTS promotion_redemptions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
                order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
                discount_amount BIGINT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            ALTER TABLE orders ADD COLUMN IF NOT EXISTS applied_promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_total BIGINT NOT NULL DEFAULT 0;

            ALTER TABLE order_items ADD COLUMN IF NOT EXISTS applied_promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;
            ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_amount BIGINT NOT NULL DEFAULT 0;
            ALTER TABLE order_items ADD COLUMN IF NOT EXISTS final_price BIGINT NOT NULL DEFAULT 0;
        `);

        // 5. cms_drafts and cms_published_versions tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS cms_drafts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
                template_id VARCHAR(64) NOT NULL DEFAULT 'classic',
                theme_config JSONB NOT NULL DEFAULT '{}'::jsonb,
                content_config JSONB NOT NULL DEFAULT '{}'::jsonb,
                version INT NOT NULL DEFAULT 1,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS cms_published_versions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                version INT NOT NULL,
                template_id VARCHAR(64) NOT NULL,
                theme_config JSONB NOT NULL DEFAULT '{}'::jsonb,
                content_config JSONB NOT NULL DEFAULT '{}'::jsonb,
                changelog TEXT,
                published_by UUID REFERENCES users(id) ON DELETE SET NULL,
                published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // 6. tenant CMS & Branding columns
        await client.query(`
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_template_id VARCHAR(50) DEFAULT 'classic';
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_theme_config JSONB DEFAULT '{}';
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_published_version INT DEFAULT 1;
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS description TEXT;
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cover_url TEXT;
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT;
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS opening_hours VARCHAR(100);
        `);

        // 4. push subscriptions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS staff_push_subscriptions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_success_at TIMESTAMPTZ,
                failed_attempts INT DEFAULT 0,
                CONSTRAINT uq_staff_push_endpoint UNIQUE (endpoint)
            );
        `);

        // 5. revoked tokens table
        await client.query(`
            CREATE TABLE IF NOT EXISTS revoked_tokens (
                jti VARCHAR(255) PRIMARY KEY,
                user_id UUID NOT NULL,
                revoked_at TIMESTAMPTZ DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL
            );
        `);

        // 6. Super Admin user
        await client.query(`
            INSERT INTO users (id, email, password_hash, full_name, phone, is_platform_admin)
            VALUES (
                '99999999-9999-9999-9999-999999999999',
                'superadmin@qrorder.vn',
                '$2a$10$cweMWdM3s.7gdRP1Mi5ulexKStDHK0qpYvk7mVeVKtHZaf1vU3Hva',
                'Hệ Thống Super Admin',
                '0999999999',
                true
            )
            ON CONFLICT (email) DO UPDATE SET
                is_platform_admin = true,
                password_hash = EXCLUDED.password_hash,
                full_name = 'Hệ Thống Super Admin';
        `);

        console.log('✅ Auto-migrations completed successfully.');
    } catch (err) {
        console.error('⚠️ Auto-migration error:', err);
    } finally {
        if (client) client.release();
    }
}
