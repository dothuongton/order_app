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

        // 2. banner columns
        await client.query(`
            ALTER TABLE banners ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
            ALTER TABLE banners ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ DEFAULT NULL;
            ALTER TABLE banners ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ DEFAULT NULL;
        `);

        // 3. tenant CMS columns
        await client.query(`
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_template_id VARCHAR(50) DEFAULT 'classic';
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_theme_config JSONB DEFAULT '{}';
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_published_version INT DEFAULT 1;
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
