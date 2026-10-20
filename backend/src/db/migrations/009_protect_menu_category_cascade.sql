-- Migration 009: Protect menu categories and menu items from accidental cascade deletion (DATA-02 / Issue #100)
-- Prevent cascading deletion of menu items when a category is deleted.

DO $$
DECLARE
    r RECORD;
    v_has_duplicates BOOLEAN;
BEGIN
    -- 1. Preflight: Check if there are duplicate category names within any tenant (normalized)
    SELECT EXISTS (
        SELECT 1
        FROM menu_categories
        GROUP BY tenant_id, LOWER(TRIM(name))
        HAVING COUNT(*) > 1
    ) INTO v_has_duplicates;

    IF v_has_duplicates THEN
        RAISE EXCEPTION 'Cannot apply migration 009: Found duplicate category names within tenant. Operator intervention required to resolve duplicates before applying unique constraint.';
    END IF;

    -- 2. Find and drop ALL foreign keys on menu_items that reference menu_categories from category_id
    -- This handles default constraint names as well as legacy/custom names (e.g. legacy_category_fk)
    FOR r IN (
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        JOIN pg_class ref_t ON c.confrelid = ref_t.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE n.nspname = CURRENT_SCHEMA
          AND t.relname = 'menu_items'
          AND ref_t.relname = 'menu_categories'
          AND c.contype = 'f'
          AND a.attname = 'category_id'
    ) LOOP
        EXECUTE 'ALTER TABLE menu_items DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;

    -- 3. Add canonical constraint with ON DELETE RESTRICT
    ALTER TABLE menu_items
        ADD CONSTRAINT menu_items_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE RESTRICT;

    -- 4. Postcondition verification: ensure NO CASCADE remains on menu_items(category_id) -> menu_categories
    IF EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        JOIN pg_class ref_t ON c.confrelid = ref_t.oid
        WHERE n.nspname = CURRENT_SCHEMA
          AND t.relname = 'menu_items'
          AND ref_t.relname = 'menu_categories'
          AND c.contype = 'f'
          AND c.confdeltype = 'c'
    ) THEN
        RAISE EXCEPTION 'Postcondition failed: CASCADE foreign key constraint still exists on menu_items(category_id)';
    END IF;

    -- Ensure canonical menu_items_category_id_fkey exists with confdeltype = 'r' (RESTRICT)
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = CURRENT_SCHEMA
          AND t.relname = 'menu_items'
          AND c.conname = 'menu_items_category_id_fkey'
          AND c.confdeltype = 'r'
    ) THEN
        RAISE EXCEPTION 'Postcondition failed: menu_items_category_id_fkey ON DELETE RESTRICT was not properly created';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_category ON menu_items (tenant_id, category_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_categories_tenant_name ON menu_categories (tenant_id, LOWER(TRIM(name)));
