-- Migration 009: Protect menu categories and menu items from accidental cascade deletion (DATA-02 / Issue #100)
-- Prevent cascading deletion of menu items when a category is deleted.

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
        FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE RESTRICT;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_category ON menu_items (tenant_id, category_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_categories_tenant_name ON menu_categories (tenant_id, LOWER(TRIM(name)));
