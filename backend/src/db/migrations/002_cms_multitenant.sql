-- Migration 002: Multi-Tenant CMS (Super Admin, Templates, Drafts, Published Versions, Banners, Promotions)

-- 1. Tenants enhancements
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS opening_hours VARCHAR(128);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_template_id VARCHAR(64) NOT NULL DEFAULT 'classic';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_theme_config JSONB NOT NULL DEFAULT '{"primaryColor":"#ea580c","fontFamily":"Inter","layout":"classic","showBanner":true,"showPromotions":true,"blockOrder":["header","banners","promotions","categories","product_grid","cart_footer"]}'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_published_version INT NOT NULL DEFAULT 1;

-- 2. CMS Templates
CREATE TABLE IF NOT EXISTS cms_templates (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    default_blocks JSONB NOT NULL DEFAULT '["header", "banners", "promotions", "categories", "product_grid", "cart_footer"]'::jsonb,
    editable_fields JSONB NOT NULL DEFAULT '["primaryColor", "fontFamily", "logo", "cover", "showBanner", "showPromotions", "blockOrder"]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default templates
INSERT INTO cms_templates (id, name, description, default_blocks, editable_fields)
VALUES 
('classic', 'Classic Storefront', 'Mẫu truyền thống tối ưu cho nhà hàng & quán ăn, dễ xem và thao tác', '["header", "banners", "promotions", "categories", "product_grid", "cart_footer"]'::jsonb, '["primaryColor", "fontFamily", "logo", "cover", "showBanner", "showPromotions", "blockOrder"]'::jsonb),
('modern_grid', 'Modern Grid 2-Column', 'Mẫu lưới hiện đại 2 cột cho đồ uống, trà sữa & ăn vặt', '["header", "banners", "categories", "promotions", "product_grid", "cart_footer"]'::jsonb, '["primaryColor", "fontFamily", "logo", "cover", "showBanner", "showPromotions", "blockOrder"]'::jsonb),
('compact_list', 'Compact List Minimal', 'Mẫu danh sách siêu gọn nhẹ, tốc độ cao cho quán đông khách', '["header", "categories", "product_grid", "cart_footer"]'::jsonb, '["primaryColor", "fontFamily", "logo", "cover", "showBanner", "showPromotions", "blockOrder"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- 3. CMS Drafts (Lưu bản nháp cấu hình shop)
CREATE TABLE IF NOT EXISTS cms_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id VARCHAR(64) NOT NULL DEFAULT 'classic',
    theme_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    content_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INT NOT NULL DEFAULT 1,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_cms_draft UNIQUE (tenant_id)
);

-- 4. CMS Published Versions (Lịch sử các phiên bản đã xuất bản - hỗ trợ Rollback)
CREATE TABLE IF NOT EXISTS cms_published_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    version INT NOT NULL,
    template_id VARCHAR(64) NOT NULL,
    theme_config JSONB NOT NULL,
    content_config JSONB NOT NULL,
    changelog TEXT,
    published_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_cms_version UNIQUE (tenant_id, version)
);

-- 5. Banners (Quản lý banner quảng cáo / khuyến mãi theo shop)
CREATE TABLE IF NOT EXISTS banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT NOT NULL,
    cta_link TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Promotions (Quản lý chương trình khuyến mãi)
CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    discount_type VARCHAR(32) NOT NULL, -- 'PERCENT', 'FIXED_AMOUNT'
    discount_value BIGINT NOT NULL,      -- Số % (ví dụ 10, 20) hoặc số tiền (ví dụ 20000)
    min_order_amount BIGINT NOT NULL DEFAULT 0,
    max_discount_amount BIGINT,          -- Trần giảm tối đa (nếu là PERCENT)
    max_redemptions INT,                 -- Giới hạn tổng số lượt dùng (null: không giới hạn)
    current_redemptions INT NOT NULL DEFAULT 0,
    priority INT NOT NULL DEFAULT 0,     -- Độ ưu tiên (cao hơn sẽ được chọn khi không cộng dồn)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Promotion Redemptions (Theo dõi lượt sử dụng khuyến mãi atomic)
CREATE TABLE IF NOT EXISTS promotion_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
    discount_amount BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Order Items & Orders enhancements (Snapshot khuyến mãi và chiết khấu)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS applied_promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS final_price BIGINT NOT NULL DEFAULT 0;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS applied_promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_total BIGINT NOT NULL DEFAULT 0;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_banners_tenant_active ON banners(tenant_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_promotions_tenant_active ON promotions(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cms_versions_tenant ON cms_published_versions(tenant_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo ON promotion_redemptions(promotion_id);
