-- Down migration: 011_seed_dalat_pho_menu_down.sql
DELETE FROM item_options WHERE tenant_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM item_option_groups WHERE tenant_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM menu_items WHERE tenant_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM menu_categories WHERE tenant_id = '11111111-1111-1111-1111-111111111111';
