-- 004_promotion_scope_and_items.sql
-- Thêm phạm vi áp dụng (Cả sàn / Toàn đơn vs Từng món được chọn) cho khuyến mãi

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS scope VARCHAR(32) NOT NULL DEFAULT 'ALL';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS applicable_item_ids UUID[] DEFAULT '{}';
