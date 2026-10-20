-- Rollback Migration 009: Restore ON DELETE CASCADE on menu_items.category_id

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'menu_items_category_id_fkey'
    ) THEN
        ALTER TABLE menu_items DROP CONSTRAINT menu_items_category_id_fkey;
    END IF;
    ALTER TABLE menu_items
        ADD CONSTRAINT menu_items_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

DROP INDEX IF EXISTS idx_menu_items_tenant_category;
DROP INDEX IF EXISTS idx_menu_categories_tenant_name;
