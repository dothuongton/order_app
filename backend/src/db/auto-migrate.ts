import { pool } from './pool.js';

export async function ensureSchemaOnBoot() {
    console.log('🔄 Checking and applying auto-migrations...');
    let client;
    try {
        client = await pool.connect();

        // 1. group_name in menu_item_variants
        await client.query(`
            ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS group_name VARCHAR(100) DEFAULT 'Biến thể';
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

        // 4. promotions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS promotions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                code VARCHAR(64),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                discount_type VARCHAR(32) NOT NULL DEFAULT 'PERCENT',
                discount_value INT NOT NULL,
                min_order_amount INT NOT NULL DEFAULT 0,
                max_discount_amount INT,
                max_redemptions INT,
                times_redeemed INT NOT NULL DEFAULT 0,
                priority INT NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                start_time TIMESTAMPTZ DEFAULT NOW(),
                end_time TIMESTAMPTZ DEFAULT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
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
