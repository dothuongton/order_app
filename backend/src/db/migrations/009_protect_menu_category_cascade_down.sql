-- Rollback Migration 009: Restore ON DELETE CASCADE on menu_items.category_id

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all foreign keys on menu_items(category_id) referencing menu_categories
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

    -- Restore canonical ON DELETE CASCADE
    ALTER TABLE menu_items
        ADD CONSTRAINT menu_items_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE;
END $$;

DROP INDEX IF EXISTS idx_menu_items_tenant_category;
DROP INDEX IF EXISTS idx_menu_categories_tenant_name;
