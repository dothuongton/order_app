-- Migration: 010_daily_shop_stats.sql
-- Description: Idempotent daily reporting read model derived from settled bills and confirmations (Issue #45)

CREATE TABLE IF NOT EXISTS daily_shop_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    confirmed_sessions_count INT NOT NULL DEFAULT 0,
    gross_amount BIGINT NOT NULL DEFAULT 0,
    net_amount BIGINT NOT NULL DEFAULT 0,
    discount_amount BIGINT NOT NULL DEFAULT 0,
    order_items_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_daily_shop_stats UNIQUE (tenant_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_shop_stats_tenant_date ON daily_shop_stats(tenant_id, stat_date DESC);
