-- Migration 005: Item Option Groups and Item Sort Order

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_cat_sort ON menu_items(tenant_id, category_id, sort_order ASC);

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

CREATE INDEX IF NOT EXISTS idx_item_option_groups_item ON item_option_groups(tenant_id, menu_item_id, sort_order ASC);

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

CREATE INDEX IF NOT EXISTS idx_item_options_group ON item_options(tenant_id, group_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_item_options_item ON item_options(tenant_id, menu_item_id);
