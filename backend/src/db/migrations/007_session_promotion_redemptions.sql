-- Migration 007: Allow session-level promotion redemptions (BUS-02, BUS-05, BUS-06)
-- Allow order_id in promotion_redemptions to be nullable when promotions are applied to the total table session at checkout.

ALTER TABLE promotion_redemptions ALTER COLUMN order_id DROP NOT NULL;
