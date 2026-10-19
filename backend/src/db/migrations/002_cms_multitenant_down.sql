-- Rollback Migration 002: Multi-Tenant CMS

DROP TABLE IF EXISTS promotion_redemptions CASCADE;
DROP TABLE IF EXISTS promotions CASCADE;
DROP TABLE IF EXISTS banners CASCADE;
DROP TABLE IF EXISTS cms_published_versions CASCADE;
DROP TABLE IF EXISTS cms_drafts CASCADE;
DROP TABLE IF EXISTS cms_templates CASCADE;

ALTER TABLE order_items DROP COLUMN IF EXISTS discount_amount;
ALTER TABLE order_items DROP COLUMN IF EXISTS applied_promotion_id;
ALTER TABLE order_items DROP COLUMN IF EXISTS final_price;

ALTER TABLE orders DROP COLUMN IF EXISTS applied_promotion_id;
ALTER TABLE orders DROP COLUMN IF EXISTS discount_total;

ALTER TABLE tenants DROP COLUMN IF EXISTS status;
ALTER TABLE tenants DROP COLUMN IF EXISTS description;
ALTER TABLE tenants DROP COLUMN IF EXISTS logo_url;
ALTER TABLE tenants DROP COLUMN IF EXISTS cover_url;
ALTER TABLE tenants DROP COLUMN IF EXISTS phone;
ALTER TABLE tenants DROP COLUMN IF EXISTS address;
ALTER TABLE tenants DROP COLUMN IF EXISTS opening_hours;
ALTER TABLE tenants DROP COLUMN IF EXISTS active_template_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS active_theme_config;
ALTER TABLE tenants DROP COLUMN IF EXISTS active_published_version;
