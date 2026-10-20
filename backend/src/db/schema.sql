-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tenants (Quán)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'VND',
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users (Nhân viên, Quản lý)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(32),
    is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Memberships (Phân quyền nhân viên theo quán)
CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL DEFAULT 'waiter', -- 'owner', 'manager', 'waiter', 'cashier'
    permissions TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_user UNIQUE (tenant_id, user_id)
);

-- 4. Tables (Bàn vật lý của quán)
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    table_number VARCHAR(64) NOT NULL,
    public_qr_id VARCHAR(64) UNIQUE NOT NULL,
    capacity INT NOT NULL DEFAULT 4,
    readiness VARCHAR(32) NOT NULL DEFAULT 'READY', -- 'READY', 'NEEDS_CLEANING', 'DISABLED'
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_table_number UNIQUE (tenant_id, table_number)
);

-- 5. Table Sessions (Phiên phục vụ bàn)
CREATE TABLE IF NOT EXISTS table_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- 'PENDING_APPROVAL', 'OPEN', 'CLOSED'
    settlement_version INT NOT NULL DEFAULT 1,
    opened_by UUID REFERENCES users(id) ON DELETE SET NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    close_reason VARCHAR(64), -- 'CONFIRMED_SETTLED', 'WITHOUT_CHARGE', 'CANCELLED', 'STAFF_REJECTED', 'EXPIRED', 'CUSTOMER_WITHDRAWN'
    requested_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    requester_guest_name VARCHAR(80),
    requester_device_hash VARCHAR(128),
    claimed_device_hash VARCHAR(128),
    claim_version INT NOT NULL DEFAULT 1,
    request_id VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index: Tối đa 1 phiên PENDING_APPROVAL hoặc OPEN trên một bàn tại một thời điểm
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_session_per_table
ON table_sessions (table_id)
WHERE status IN ('PENDING_APPROVAL', 'OPEN');

CREATE INDEX IF NOT EXISTS idx_table_sessions_pending_expiry
ON table_sessions (expires_at)
WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS idx_table_sessions_requester_device
ON table_sessions (tenant_id, requester_device_hash)
WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS idx_table_sessions_claimed_device
ON table_sessions (tenant_id, claimed_device_hash)
WHERE status = 'OPEN';

-- 6. Guest Sessions (Quyền truy cập phiên qua trình duyệt khách)
CREATE TABLE IF NOT EXISTS guest_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) UNIQUE NOT NULL,
    device_fingerprint VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Menu Categories
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price BIGINT NOT NULL, -- Số nguyên VND
    image_url TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Menu Item Variants (Legacy)
CREATE TABLE IF NOT EXISTS menu_item_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    group_name VARCHAR(100) DEFAULT 'Biến thể',
    name VARCHAR(255) NOT NULL,
    price_adjustment BIGINT NOT NULL DEFAULT 0,
    is_available BOOLEAN NOT NULL DEFAULT TRUE
);

-- 9b. Item Option Groups & Options (Flexible Options System)
CREATE TABLE IF NOT EXISTS item_option_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    selection_mode VARCHAR(20) NOT NULL DEFAULT 'SINGLE',
    min_selections INT NOT NULL DEFAULT 0,
    max_selections INT NOT NULL DEFAULT 1,
    pricing_mode VARCHAR(20) NOT NULL DEFAULT 'ADDITIVE',
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS item_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES item_option_groups(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price_delta BIGINT NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_available BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Orders (Mỗi lần khách bấm gửi món là 1 order riêng, đánh số trong phiên: Lần 1, Lần 2...)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
    order_number INT NOT NULL, -- 1, 2, 3...
    idempotency_key VARCHAR(128) NOT NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'GUEST_WEB', -- 'GUEST_WEB', 'STAFF_POS'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_order_number UNIQUE (session_id, order_number),
    CONSTRAINT uq_session_idempotency UNIQUE (session_id, idempotency_key)
);

-- 11. Order Items (Mỗi dòng món gửi đi, snapshot giá và tên bất biến)
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
    snapshot_name VARCHAR(255) NOT NULL,
    snapshot_price BIGINT NOT NULL,
    snapshot_variant_name VARCHAR(255),
    snapshot_category_name VARCHAR(255),
    quantity INT NOT NULL CHECK (quantity > 0),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Order Item Parts (Hỗ trợ phục vụ/hủy một phần theo số lượng)
-- Trạng thái: PENDING -> ACCEPTED -> SERVED; hoặc CANCELLED khi hết món/nguyên liệu
CREATE TABLE IF NOT EXISTS order_item_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL, -- 'PENDING', 'ACCEPTED', 'SERVED', 'CANCELLED'
    quantity INT NOT NULL CHECK (quantity > 0),
    cancel_reason VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Order Item Events (Audit lịch sử đổi trạng thái món)
CREATE TABLE IF NOT EXISTS order_item_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    from_status VARCHAR(32) NOT NULL,
    to_status VARCHAR(32) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Service Requests (Gọi nhân viên hỗ trợ / Yêu cầu thanh toán)
CREATE TABLE IF NOT EXISTS service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL, -- 'ASSISTANCE', 'CHECKOUT'
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED'
    note TEXT,
    accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    cancel_reason VARCHAR(255),
    call_count INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS call_count INT NOT NULL DEFAULT 1;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Partial index: Tối đa 1 yêu cầu mở (PENDING hoặc ACCEPTED) cho mỗi loại trong một phiên
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_service_request
ON service_requests (session_id, type)
WHERE status IN ('PENDING', 'ACCEPTED');

-- 15. Bills (Một phiên chỉ có đúng 1 bill tổng duy nhất)
CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id UUID NOT NULL UNIQUE REFERENCES table_sessions(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'CONFIRMED', 'CANCELLED'
    total_amount BIGINT NOT NULL DEFAULT 0,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Bill Lines (Snapshot cố định các món tính tiền khi bill CONFIRMED)
CREATE TABLE IF NOT EXISTS bill_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    item_name VARCHAR(255) NOT NULL,
    variant_name VARCHAR(255),
    quantity_served INT NOT NULL CHECK (quantity_served > 0),
    unit_price BIGINT NOT NULL,
    subtotal BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Manual Settlement Confirmations (Ghi nhận xác nhận thủ công của nhân viên ngoài hệ thống)
-- KHÔNG có trường cổng thanh toán, webhook, hoặc ngân hàng
CREATE TABLE IF NOT EXISTS manual_settlement_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL UNIQUE REFERENCES bills(id) ON DELETE CASCADE,
    session_id UUID NOT NULL UNIQUE REFERENCES table_sessions(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    confirmed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_id VARCHAR(128),
    note TEXT
);

-- 18. Idempotency Records (Chống trùng lặp request theo mục 11.4)
CREATE TABLE IF NOT EXISTS idempotency_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    action VARCHAR(64) NOT NULL,
    scope VARCHAR(128) NOT NULL,
    key VARCHAR(128) NOT NULL,
    payload_fingerprint VARCHAR(128) NOT NULL,
    result_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_idempotency_record UNIQUE (tenant_id, action, scope, key)
);

-- 19. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. Staff Push Subscriptions (Web Push cho nhân viên)
CREATE TABLE IF NOT EXISTS staff_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_success_at TIMESTAMPTZ,
    CONSTRAINT uq_staff_push_endpoint UNIQUE (endpoint)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tables_tenant ON tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_table ON table_sessions(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_item_parts_item ON order_item_parts(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_parts_status ON order_item_parts(status);
CREATE INDEX IF NOT EXISTS idx_service_requests_session ON service_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_tenant_status ON service_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_token ON guest_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_staff_push_user ON staff_push_subscriptions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tables_tenant_num ON tables(tenant_id, table_number);

-- =========================================================================
-- Multi-Tenant CMS, Templates, Drafts, Published Versions, Banners, Promotions
-- (Safe and idempotent ALTER TABLE & CREATE TABLE IF NOT EXISTS)
-- =========================================================================

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

-- 7. Promotion Redemptions (Theo dõi lượt sử dụng khuyến mãi atomic & snapshot)
CREATE TABLE IF NOT EXISTS promotion_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
    discount_amount BIGINT NOT NULL,
    snapshot_title VARCHAR(255),
    snapshot_code VARCHAR(64),
    snapshot_discount_type VARCHAR(32),
    snapshot_discount_value BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Order Items & Orders enhancements (Snapshot khuyến mãi và chiết khấu)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS applied_promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS final_price BIGINT NOT NULL DEFAULT 0;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS applied_promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_total BIGINT NOT NULL DEFAULT 0;

-- Additional Indexes
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_banners_tenant_active ON banners(tenant_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_promotions_tenant_active ON promotions(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cms_versions_tenant ON cms_published_versions(tenant_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo ON promotion_redemptions(promotion_id);

-- 9. Uploaded Images (Lưu trữ ảnh trực tiếp an toàn, không phụ thuộc ổ đĩa tạm thời)
CREATE TABLE IF NOT EXISTS uploaded_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    filename VARCHAR(255),
    mime_type VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
    size_bytes INT NOT NULL DEFAULT 0,
    data_base64 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_images_tenant ON uploaded_images(tenant_id);
-- 10. Revoked Staff Tokens & Schema Migrations Tracking
CREATE TABLE IF NOT EXISTS revoked_staff_tokens (
    token_hash VARCHAR(64) PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revoked_staff_tokens_expiry ON revoked_staff_tokens (expires_at);

CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
