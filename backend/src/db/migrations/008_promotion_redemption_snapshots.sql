-- 008_promotion_redemption_snapshots.sql
-- Snapshot metadata for promotions and prevent cascade deletions from deleting financial traces (R7)

ALTER TABLE promotion_redemptions ALTER COLUMN promotion_id DROP NOT NULL;
ALTER TABLE promotion_redemptions DROP CONSTRAINT IF EXISTS promotion_redemptions_promotion_id_fkey;
ALTER TABLE promotion_redemptions ADD CONSTRAINT promotion_redemptions_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE SET NULL;

ALTER TABLE promotion_redemptions ADD COLUMN IF NOT EXISTS snapshot_title VARCHAR(255);
ALTER TABLE promotion_redemptions ADD COLUMN IF NOT EXISTS snapshot_code VARCHAR(64);
ALTER TABLE promotion_redemptions ADD COLUMN IF NOT EXISTS snapshot_discount_type VARCHAR(32);
ALTER TABLE promotion_redemptions ADD COLUMN IF NOT EXISTS snapshot_discount_value BIGINT;
