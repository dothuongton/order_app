-- Migration 011: Seed full Đà Lạt Phố menu (124+ items, 13 categories, sizes and options)
-- Automatically executed on Render deploy and fresh databases

DO $$
DECLARE
    v_tenant_id UUID := '11111111-1111-1111-1111-111111111111';
    v_cat_id UUID;
    v_item_id UUID;
    v_group_id UUID;
BEGIN
    -- 1. Ensure main tenant exists & name is updated to Đà Lạt Phố
    INSERT INTO tenants (id, slug, name, currency, timezone)
    VALUES (v_tenant_id, 'pho-co', 'Quán Trà Sữa & Ăn Vặt Đà Lạt Phố', 'VND', 'Asia/Ho_Chi_Minh')
    ON CONFLICT (id) DO UPDATE
    SET name = 'Quán Trà Sữa & Ăn Vặt Đà Lạt Phố',
        updated_at = NOW();

    -- 2. Clear old demo menu data for this tenant
    DELETE FROM item_options WHERE tenant_id = v_tenant_id;
    DELETE FROM item_option_groups WHERE tenant_id = v_tenant_id;
    DELETE FROM menu_item_variants WHERE tenant_id = v_tenant_id;
    DELETE FROM menu_items WHERE tenant_id = v_tenant_id;
    DELETE FROM menu_categories WHERE tenant_id = v_tenant_id;

    -- Category: Trà Sữa
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Trà Sữa', 1);

    -- Item: Trà Sữa Thái Xanh
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Sữa Thái Xanh', 'Trà Thái xanh đậm vị thơm béo thanh mát đặc trưng', 25000, '/images/menu/01_tra_sua_thai_xanh.jpg', true, 1);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Sữa Vị Dâu
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Sữa Vị Dâu', 'Trà sữa hương vị dâu tây ngọt ngào, thơm dịu', 25000, '/images/menu/02_tra_sua_vi_dau.jpg', true, 2);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Sữa Vị Việt Quất
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Sữa Vị Việt Quất', 'Trà sữa đậm đà kết hợp hương việt quất thanh ngọt', 25000, '/images/menu/03_tra_sua_vi_viet.jpg', true, 3);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Sữa Vị Dưa Lưới
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Sữa Vị Dưa Lưới', 'Trà sữa vị dưa lưới thanh mát, thơm dịu sảng khoái', 25000, '/images/menu/04_tra_sua_vi_dua.jpg', true, 4);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Sữa Truyền Thống Full Topping
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Sữa Truyền Thống Full Topping', 'Trà sữa truyền thống đậm đà đầy ắp trân châu, thạch giòn và pudding', 32000, '/images/menu/05_tra_sua_truyen_thong.jpg', true, 5);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Sữa Trân Châu Đường Đen
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Sữa Trân Châu Đường Đen', 'Trà sữa béo ngậy kèm trân châu đường đen dẻo dai nóng hổi', 32000, '/images/menu/06_tra_sua_tran_chau.jpg', true, 6);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Sữa Khoai Môn
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Sữa Khoai Môn', 'Trà sữa khoai môn bùi béo, thơm ngậy tự nhiên', 32000, '/images/menu/07_tra_sua_khoai_mon.jpg', true, 7);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Sữa Kem Dừa Nướng
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Sữa Kem Dừa Nướng', 'Trà sữa phủ lớp kem dừa thơm béo và dừa nướng giòn rụm', 32000, '/images/menu/08_tra_sua_kem_dua.jpg', true, 8);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Sữa Socola
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Sữa Socola', 'Trà sữa hòa quyện socola đậm đà, vị đắng ngọt hài hòa', 32000, '/images/menu/09_tra_sua_socola.jpg', true, 9);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Sữa Đậu Biếc Macchiato
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Sữa Đậu Biếc Macchiato', 'Trà hoa đậu biếc xanh mát phủ lớp macchiato kem mặn béo mịn', 32000, '/images/menu/10_tra_sua_dau_biec.jpg', true, 10);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Sữa Matcha
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Sữa Matcha', 'Matcha chuẩn vị trà xanh thanh mát, béo nhẹ êm dịu', 37000, '/images/menu/matcha_milk_tea_in_cup.jpg', true, 11);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Matcha Macchiato
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Matcha Macchiato', 'Trà xanh matcha thơm nồng phủ lớp milk foam macchiato mềm mịn', 37000, '/images/menu/12_matcha_macchiato.jpg', true, 12);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);


    -- Category: Trà Trái Cây
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Trà Trái Cây', 2);

    -- Item: Trà Chanh Nha Đam
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Chanh Nha Đam', 'Trà chanh tươi chua ngọt thanh mát kèm thạch nha đam giòn sần sật', 22000, '/images/menu/13_tra_chanh_nha_dam.jpg', true, 1);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Đào Cam Sả
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Đào Cam Sả', 'Hương vị cam sả thanh nhiệt, miếng đào giòn ngọt thơm mát', 27000, '/images/menu/14_tra_dao_cam_sa.jpg', true, 2);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Việt Quất
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Việt Quất', 'Trà thanh dịu kết hợp mứt việt quất chua ngọt đậm đà', 27000, '/images/menu/15_tra_viet_quat.jpg', true, 3);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Dâu
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Dâu', 'Trà dâu tây tươi mát, giải nhiệt cực đã', 27000, '/images/menu/16_tra_dau.jpg', true, 4);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Dưa Lưới
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Dưa Lưới', 'Trà dưa lưới thơm lừng ngọt ngào mát lành', 27000, '/images/menu/17_tra_dua_luoi.jpg', true, 5);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Vải
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Vải', 'Trà vải ngọt thanh thơm ngát kèm trái vải mọng nước', 27000, '/images/menu/18_tra_vai.jpg', true, 6);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Đậu Biếc
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Đậu Biếc', 'Sắc hoa đậu biếc tự nhiên thanh tao mát dịu', 27000, '/images/menu/19_tra_dau_biec.jpg', true, 7);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Mãng Cầu
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Mãng Cầu', 'Thịt mãng cầu xiêm tươi dầm chua ngọt đậm vị trên nền trà thanh mát', 32000, '/images/menu/20_tra_mang_cau.jpg', true, 8);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Quất Chanh Leo Mật Ong
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Quất Chanh Leo Mật Ong', 'Sự kết hợp chua dịu của tắc, thơm của chanh leo và mật ong ngọt thanh', 32000, '/images/menu/21_tra_quat_chanh_leo.jpg', true, 9);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Sen Vàng
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Sen Vàng', 'Trà ô long kết hợp hạt sen bùi ngậy và củ năng giòn ngọt', 37000, '/images/menu/22_tra_sen_vang.jpg', true, 10);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Xoài Chanh Leo
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Xoài Chanh Leo', 'Vị xoài chín thơm ngọt hòa quyện cùng cốt chanh leo chua thanh', 32000, '/images/menu/23_tra_xoai_chanh_leo.jpg', true, 11);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Dứa Chanh Leo
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Dứa Chanh Leo', 'Hương vị nhiệt đới bùng nổ từ dứa tươi và chanh leo mát lạnh', 32000, '/images/menu/24_tra_dua_chanh_leo.jpg', true, 12);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);


    -- Category: Đá Xay
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Đá Xay', 3);

    -- Item: Matcha Đá Xay
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Matcha Đá Xay', 'Matcha Nhật Bản xay tuyết mát lạnh phủ kem tươi whipping thơm béo', 37000, '/images/menu/25_matcha_da_xay.jpg', true, 1);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Khoai Môn Đá Xay
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Khoai Môn Đá Xay', 'Khoai môn xay mịn màng bùi ngậy thơm lừng', 32000, '/images/menu/26_khoai_mon_da_xay.jpg', true, 2);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Việt Quất Đá Xay
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Việt Quất Đá Xay', 'Việt quất xay tuyết mịn chua ngọt thanh mát cực sảng khoái', 32000, '/images/menu/27_viet_quat_da_xay.jpg', true, 3);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Dâu Đá Xay
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Dâu Đá Xay', 'Dâu tây tươi xay nhuyễn cùng đá tuyết mát lạnh ngọt dịu', 32000, '/images/menu/blended_strawberry_ice_drink_cup.jpg', true, 4);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Dưa Lưới Đá Xay
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Dưa Lưới Đá Xay', 'Đá xay dưa lưới hương thơm ngào ngạt tươi mát', 32000, '/images/menu/29_dua_luoi_da_xay.jpg', true, 5);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Đào Đá Xay
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Đào Đá Xay', 'Vị đào tươi ngọt ngào xay tuyết phủ kem tươi', 32000, '/images/menu/30_dao_da_xay.jpg', true, 6);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Socola Đá Xay
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Socola Đá Xay', 'Socola nguyên chất xay đá tuyết sánh mịn đậm đà thơm ngậy', 37000, '/images/menu/31_socola_da_xay.jpg', true, 7);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);


    -- Category: Sinh Tố
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Sinh Tố', 4);

    -- Item: Sinh Tố Mãng Cầu
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sinh Tố Mãng Cầu', 'Mãng cầu tươi xay cùng sữa đặc béo ngậy chua ngọt thanh mát', 37000, '/images/menu/32_sinh_to_mang_cau.jpg', true, 1);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sinh Tố Xoài
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sinh Tố Xoài', 'Xoài cát chín vàng xay sánh mịn thơm lừng ngào ngạt', 37000, '/images/menu/33_sinh_to_xoai.jpg', true, 2);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sinh Tố Bơ
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sinh Tố Bơ', 'Bơ sáp Đắk Lắk dẻo quánh, ngậy béo tự nhiên', 37000, '/images/menu/34_sinh_to_bo.jpg', true, 3);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sinh Tố Dâu
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sinh Tố Dâu', 'Dâu Đà Lạt đỏ mọng tươi mát xay nhuyễn cùng sữa thơm', 37000, '/images/menu/35_sinh_to_dau.jpg', true, 4);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);


    -- Category: Sữa Tươi
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Sữa Tươi', 5);

    -- Item: Sữa Tươi Trân Châu Đường Đen
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Tươi Trân Châu Đường Đen', 'Sữa tươi nguyên chất Đà Lạt cùng trân châu đường đen dẻo thơm nồng', 32000, '/images/menu/36_sua_tuoi_tran_chau.jpg', true, 1);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Tươi Việt Quất
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Tươi Việt Quất', 'Sữa tươi thanh mát hòa quyện sốt việt quất chua ngọt dịu', 32000, '/images/menu/37_sua_tuoi_viet_quat.jpg', true, 2);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Tươi Dâu
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Tươi Dâu', 'Sữa tươi béo nhẹ kết hợp sốt dâu tây ngọt thơm hấp dẫn', 32000, '/images/menu/38_sua_tuoi_dau.jpg', true, 3);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Tươi Dưa Lưới
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Tươi Dưa Lưới', 'Sữa tươi kết hợp hương vị dưa lưới thanh mát dịu ngọt', 32000, '/images/menu/39_sua_tuoi_dua_luoi.jpg', true, 4);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Tươi Xoài
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Tươi Xoài', 'Vị xoài nhiệt đới sánh vàng hòa quyện sữa tươi thanh lành', 32000, '/images/menu/40_sua_tuoi_xoai.jpg', true, 5);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Tươi Đậu Biếc
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Tươi Đậu Biếc', 'Màu xanh hoa đậu biếc phân tầng bắt mắt cùng sữa tươi thanh mát', 32000, '/images/menu/41_sua_tuoi_dau_biec.jpg', true, 6);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Tươi Trân Châu Caramel
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Tươi Trân Châu Caramel', 'Caramel nướng thơm nức quyện cùng sữa tươi và trân châu dai mềm', 32000, '/images/menu/42_sua_tuoi_tran_chau.jpg', true, 7);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Bơ Già Dừa Non
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Bơ Già Dừa Non', 'Sinh tố bơ sáp béo ngậy kèm cùi dừa non giòn bùi thanh mát', 37000, '/images/menu/43_bo_gia_dua_non.jpg', true, 8);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Xoài Già Dừa Non
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Xoài Già Dừa Non', 'Xoài chín ngọt sắc ăn kèm dừa non sần sật bùi béo', 37000, '/images/menu/44_xoai_gia_dua_non.jpg', true, 9);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);


    -- Category: Nước Ép
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Nước Ép', 6);

    -- Item: Nước Ép Dưa Hấu Nha Đam
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Nước Ép Dưa Hấu Nha Đam', 'Nước ép dưa hấu ngọt mát tự nhiên kèm thạch nha đam thanh lọc', 32000, '/images/menu/45_nuoc_ep_dua_hau.jpg', true, 1);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Nước Ép Cam Nha Đam
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Nước Ép Cam Nha Đam', 'Cam tươi vắt giàu vitamin C kết hợp nha đam giòn tươi', 32000, '/images/menu/46_nuoc_ep_cam_nha.jpg', true, 2);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Nước Ép Dứa Nha Đam
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Nước Ép Dứa Nha Đam', 'Nước ép dứa thơm chua ngọt kèm topping nha đam giòn sần sật', 32000, '/images/menu/47_nuoc_ep_dua_nha.jpg', true, 3);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Nước Ép Cam - Cà Rốt
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Nước Ép Cam - Cà Rốt', 'Nước ép cam sành kết hợp cà rốt tươi ngon bổ dưỡng, sáng da', 32000, '/images/menu/orange_carrot_juice_in_cup.jpg', true, 4);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Nước Ép Dứa - Cà Rốt
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Nước Ép Dứa - Cà Rốt', 'Sự kết hợp thanh lọc cơ thể hoàn hảo từ dứa và cà rốt tươi', 32000, '/images/menu/49_nuoc_ep_dua.jpg', true, 5);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Nước Ép Táo - Ổi
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Nước Ép Táo - Ổi', 'Nước ép táo giòn ngọt cùng ổi hồng thơm lừng giàu vitamin', 32000, '/images/menu/50_nuoc_ep_tao.jpg', true, 6);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Nước Ép Táo - Lê
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Nước Ép Táo - Lê', 'Hương vị thanh khiết, ngọt mát dịu dàng từ táo và lê tươi', 32000, '/images/menu/51_nuoc_ep_tao.jpg', true, 7);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);


    -- Category: Kem Tươi & Tráng Miệng
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Kem Tươi & Tráng Miệng', 7);

    -- Item: Kem Dừa Đà Lạt
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Kem Dừa Đà Lạt', 'Kem dừa béo ngậy phục vụ trong trái dừa non với lạc rang và dừa khô', 35000, '/images/menu/52_kem_dua_da_lat.jpg', true, 1);

    -- Item: Kem Thuyền 4 Vị
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Kem Thuyền 4 Vị', 'Thuyền kem 4 viên vị đặc biệt mát lạnh ăn kèm sốt socola và bánh quế', 45000, '/images/menu/four_flavor_ice_cream_in_boat.jpg', true, 2);

    -- Item: Kem Bơ Dừa Non
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Kem Bơ Dừa Non', 'Đặc sản Đà Lạt kem dừa mát lạnh phủ trên lớp sinh tố bơ sáp béo ngậy', 35000, '/images/menu/avocado_ice_cream_in_coconut.jpg', true, 3);

    -- Item: Kem Xoài Dừa Non
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Kem Xoài Dừa Non', 'Kem xoài chua ngọt tươi mới phủ sốt xoài và cùi dừa non', 35000, '/images/menu/mango_ice_cream_in_coconut.jpg', true, 4);

    -- Item: Kem Dừa Vị Sầu Riêng
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Kem Dừa Vị Sầu Riêng', 'Kem dừa thơm nồng sầu riêng hảo hạng đậm đà béo ngậy', 40000, '/images/menu/durian_coconut_ice_cream_serving.jpg', true, 5);

    -- Item: Kem Dừa Socola
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Kem Dừa Socola', 'Kem dừa thơm bùi phủ ngập sốt socola đắng ngọt quyến rũ', 40000, '/images/menu/57_kem_dua_socola.jpg', true, 6);

    -- Item: Kem Dâu
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Kem Dâu', 'Kem dâu tây chua chua ngọt ngọt tươi mát sảng khoái', 35000, '/images/menu/58_kem_dau.jpg', true, 7);

    -- Item: Kem Matcha
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Kem Matcha', 'Kem trà xanh matcha thanh mát thơm dịu chuẩn vị Nhật Bản', 40000, '/images/menu/59_kem_matcha.jpg', true, 8);


    -- Category: Cà Phê
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Cà Phê', 8);

    -- Item: Cà Phê Đen Đá
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Cà Phê Đen Đá', 'Cà phê Robusta rang mộc pha phin truyền thống đậm đà tinh thần Việt', 22000, '/images/menu/60_ca_phe_den_da.jpg', true, 1);

    -- Item: Cà Phê Đen Nóng
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Cà Phê Đen Nóng', 'Cà phê đen nguyên chất pha nóng thơm nồng nàn đánh thức ngày mới', 22000, '/images/menu/61_ca_phe_den_nong.jpg', true, 2);

    -- Item: Cà Phê Sữa
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Cà Phê Sữa', 'Cà phê sữa nâu truyền thống hài hòa đắng béo ngọt ngào', 27000, '/images/menu/62_ca_phe_sua.jpg', true, 3);

    -- Item: Cà Phê Muối
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Cà Phê Muối', 'Vị đắng cà phê pha lớp kem muối mặn mòi béo ngậy độc đáo xứ Huế', 32000, '/images/menu/63_ca_phe_muoi.jpg', true, 4);

    -- Item: Cà Phê Kem Trứng
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Cà Phê Kem Trứng', 'Lớp kem trứng đánh bông vàng óng mịn màng phủ trên cà phê đậm đặc', 32000, '/images/menu/64_ca_phe_kem_trung.jpg', true, 5);

    -- Item: Bạc Xỉu 3 Tầng
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Bạc Xỉu 3 Tầng', 'Phân tầng sữa đặc, sữa tươi và cà phê thơm béo dễ uống', 32000, '/images/menu/65_bac_xiu_3_tang.jpg', true, 6);

    -- Item: Cà Phê Caramel
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Cà Phê Caramel', 'Cà phê sữa quyện sốt caramel nướng thơm ngậy quyến rũ', 32000, '/images/menu/66_ca_phe_caramel.jpg', true, 7);

    -- Item: Cacao Sữa Đá
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Cacao Sữa Đá', 'Cacao nguyên chất pha sữa thơm béo mát lạnh sánh mịn', 32000, '/images/menu/67_cacao_sua_da.jpg', true, 8);


    -- Category: Soda
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Soda', 9);

    -- Item: Soda Dưa Hấu Yakult
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Soda Dưa Hấu Yakult', 'Soda dưa hấu sủi bọt mát lạnh kết hợp men vi sinh Yakult sảng khoái', 32000, '/images/menu/68_soda_dua_hau_yakult.jpg', true, 1);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Soda Biển Xanh Yakult
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Soda Biển Xanh Yakult', 'Sắc xanh đại dương mát mắt, vị ngọt mát cùng Yakult lên men', 32000, '/images/menu/69_soda_bien_xanh_yakult.jpg', true, 2);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Soda Dâu Yakult
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Soda Dâu Yakult', 'Soda dâu tươi sủi bọt chua ngọt hòa quyện Yakult', 32000, '/images/menu/70_soda_dau_yakult.jpg', true, 3);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Soda Việt Quất Yakult
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Soda Việt Quất Yakult', 'Sốt việt quất thơm dịu, bọt soda tê lưỡi và vị Yakult thơm ngon', 32000, '/images/menu/71_soda_viet_quat_yakult.jpg', true, 4);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Soda Bạc Hà Yakult
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Soda Bạc Hà Yakult', 'Hương bạc hà the mát sảng khoái kết hợp Yakult chua nhẹ', 32000, '/images/menu/72_soda_bac_ha_yakult.jpg', true, 5);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Soda Dứa Yakult
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Soda Dứa Yakult', 'Hương vị dứa chua ngọt tự nhiên sủi bọt mát lạnh giải nhiệt', 32000, '/images/menu/73_soda_dua_yakult.jpg', true, 6);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);


    -- Category: Sữa Chua
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Sữa Chua', 10);

    -- Item: Milo Dầm
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Milo Dầm', 'Milo cacao dầm sữa đặc phủ bột milo đậm đặc và trân châu giòn', 32000, '/images/menu/74_milo_dam.jpg', true, 1);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Chua Đánh Đá
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Chua Đánh Đá', 'Sữa chua lên men tự nhiên đánh đá mát lạnh chua dịu thơm ngon', 30000, '/images/menu/75_sua_chua_danh_da.jpg', true, 2);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Chua Dâu
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Chua Dâu', 'Sữa chua sánh mịn hòa quyện mứt dâu tây ngọt thơm hấp dẫn', 32000, '/images/menu/76_sua_chua_dau.jpg', true, 3);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Chua Việt Quất
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Chua Việt Quất', 'Sữa chua dầm sốt quả việt quất chua ngọt bổ dưỡng', 32000, '/images/menu/77_sua_chua_viet_quat.jpg', true, 4);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Chua Dưa Lưới
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Chua Dưa Lưới', 'Sữa chua dưa lưới mát lành thơm ngát vị trái cây tươi', 32000, '/images/menu/78_sua_chua_dua_luoi.jpg', true, 5);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Chua Cà Phê
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Chua Cà Phê', 'Vị chua thanh mát của sữa chua hòa trộn cốt cà phê đậm thơm', 32000, '/images/menu/79_sua_chua_ca_phe.jpg', true, 6);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Chua Đào Yến Mạch
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Chua Đào Yến Mạch', 'Sữa chua kèm miếng đào giòn ngọt và yến mạch giòn bùi bổ dưỡng', 35000, '/images/menu/80_sua_chua_dao_yen.jpg', true, 7);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Mãng Cầu Dầm Sữa Chua
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Mãng Cầu Dầm Sữa Chua', 'Thịt mãng cầu xiêm tươi dầm sữa chua và sữa đặc chua ngọt gây nghiện', 35000, '/images/menu/81_mang_cau_dam_sua.jpg', true, 8);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Chua Lắc Chanh Leo
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Chua Lắc Chanh Leo', 'Sữa chua lắc cốt chanh leo tươi chua thanh thơm mát cực đã', 32000, '/images/menu/82_sua_chua_lac_chanh.jpg', true, 9);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Sữa Chua Xoài
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Sữa Chua Xoài', 'Sữa chua mịn màng ăn kèm sốt xoài chín ngọt thơm lừng', 32000, '/images/menu/83_sua_chua_xoai.jpg', true, 10);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);


    -- Category: Latte
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Latte', 11);

    -- Item: Matcha Latte
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Matcha Latte', 'Trà xanh matcha cao cấp hòa quyện sữa tươi thơm béo êm dịu', 37000, '/images/menu/84_matcha_latte.jpg', true, 1);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Matcha Latte Dâu
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Matcha Latte Dâu', 'Sự kết hợp quyến rũ giữa matcha đắng nhẹ và sốt dâu ngọt ngào', 37000, '/images/menu/85_matcha_latte_dau.jpg', true, 2);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Cacao Latte Kem Trứng
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Cacao Latte Kem Trứng', 'Cacao sữa đậm đà phủ lớp kem trứng béo ngậy mềm mịn khó cưỡng', 37000, '/images/menu/86_cacao_latte_kem_trung.jpg', true, 3);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Chocolate Dâu
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Chocolate Dâu', 'Chocolate hảo hạng hòa quyện sốt dâu thơm nồng ngọt ngào', 37000, '/images/menu/87_chocolate_dau.jpg', true, 4);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);


    -- Category: Đồ Uống Nóng
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Đồ Uống Nóng', 12);

    -- Item: Cacao Sữa Nóng
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Cacao Sữa Nóng', 'Ly cacao nóng hổi thơm nồng ấm áp sưởi ấm ngày lạnh', 32000, '/images/menu/88_cacao_sua_nong.jpg', true, 1);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Bạc Xỉu Nóng
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Bạc Xỉu Nóng', 'Bạc xỉu nóng ngậy béo hương sữa quyện chút đắng cà phê', 32000, '/images/menu/89_bac_xiu_nong.jpg', true, 2);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Gừng Táo Đỏ
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Gừng Táo Đỏ', 'Trà thảo mộc gừng tươi ấm nồng nấu cùng táo đỏ dưỡng nhan ấm bụng', 32000, '/images/menu/90_tra_gung_tao_do.jpg', true, 3);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Cam Quế Long Nhãn
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Cam Quế Long Nhãn', 'Hương quế nồng ấm, lát cam khô thanh lọc và long nhãn ngọt bùi', 32000, '/images/menu/91_tra_cam_que_long.jpg', true, 4);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);

    -- Item: Trà Đào Cam Quế
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Trà Đào Cam Quế', 'Vị đào thơm ngọt kết hợp tinh dầu cam và thanh quế nướng thơm lừng', 32000, '/images/menu/92_tra_dao_cam_que.jpg', true, 5);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES
        (v_tenant_id, v_group_id, v_item_id, 'Size M', 0, true, true, 1),
        (v_tenant_id, v_group_id, v_item_id, 'Size L', 5000, false, true, 2);


    -- Category: Đồ Ăn Vặt
    v_cat_id := gen_random_uuid();
    INSERT INTO menu_categories (id, tenant_id, name, sort_order)
    VALUES (v_cat_id, v_tenant_id, 'Đồ Ăn Vặt', 13);

    -- Item: Bánh Tráng Trộn Đặc Biệt
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Bánh Tráng Trộn Đặc Biệt', 'Bánh tráng phơi sương, trứng cút, khô bò, xoài non, rau răm, sốt tắc cay ngọt', 25000, '/images/menu/01_tra_sua_thai_xanh.jpg', true, 1);

    -- Item: Bánh Tráng Nướng Đà Lạt
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Bánh Tráng Nướng Đà Lạt', 'Trứng cút, tép khô, hành hoa, xúc xích, phô mai nướng giòn rụm', 25000, '/images/menu/01_tra_sua_thai_xanh.jpg', true, 2);

    -- Item: Hướng Dương Mộc
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Hướng Dương Mộc', 'Hạt hướng dương rang mộc tự nhiên giòn thơm bùi bùi', 12000, '/images/menu/93_huong_duong_moc.jpg', true, 3);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Kích cỡ gói', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES (v_tenant_id, v_group_id, v_item_id, 'Gói nhỏ', 0, true, true, 1),
           (v_tenant_id, v_group_id, v_item_id, 'Gói lớn', 5000, false, true, 2);

    -- Item: Hướng Dương Dừa
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Hướng Dương Dừa', 'Hạt hướng dương tẩm vị nước cốt dừa thơm ngọt ngậy béo', 17000, '/images/menu/94_huong_duong_dua.jpg', true, 4);

    -- Item: Ô Mai
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Ô Mai', 'Đĩa ô mai xí muội dẻo chua ngọt cay mặn đặc sản Hà Nội', 27000, '/images/menu/95_o_mai.jpg', true, 5);

    -- Item: Xí Muội Chua Cay
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Xí Muội Chua Cay', 'Xí muội mặn mà cay nồng kích thích vị giác ăn vặt', 27000, '/images/menu/96_xi_muoi_chua_cay.jpg', true, 6);

    -- Item: Xúc Xích Chiên
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Xúc Xích Chiên', 'Xúc xích Đức rán thơm nức ăn kèm tương cà và tương ớt', 12000, '/images/menu/97_xuc_xich.jpg', true, 7);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Số lượng', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES (v_tenant_id, v_group_id, v_item_id, '1 cây', 0, true, true, 1),
           (v_tenant_id, v_group_id, v_item_id, '2 cây', 8000, false, true, 2);

    -- Item: Lạp Xưởng Nướng Đá
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Lạp Xưởng Nướng Đá', 'Lạp xưởng tươi nướng đá núi lửa giòn sần sật rắc bột ớt thơm lừng', 17000, '/images/menu/98_lap_xuong.jpg', true, 8);

    -- Item: Bò Viên Chiên
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Bò Viên Chiên', 'Bò viên giòn dai thơm mùi tiêu chiên vàng chấm tương đen sốt cay', 30000, '/images/menu/99_bo_vien.jpg', true, 9);

    -- Item: Cá Viên Chiên
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Cá Viên Chiên', 'Đĩa cá viên tròn xoe chiên phồng giòn rụm chấm tương đậm đà', 32000, '/images/menu/100_ca_vien.jpg', true, 10);

    -- Item: Tôm Viên Chiên
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Tôm Viên Chiên', 'Tôm viên tươi thơm ngọt tự nhiên chiên vàng ruộm thơm phức', 32000, '/images/menu/101_tom_vien.jpg', true, 11);

    -- Item: Rau Củ Quả Viên
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Rau Củ Quả Viên', 'Viên rau củ thanh đạm chiên giòn thơm ngon lạ miệng', 32000, '/images/menu/102_rau_cu_qua_vien.jpg', true, 12);

    -- Item: Nem Chua Rán Hà Nội
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Nem Chua Rán Hà Nội', 'Nem chua lăn bột xù chiên giòn rụm vỏ ngoài, bên trong dẻo dai thơm bùi', 37000, '/images/menu/103_nem_chua_ran.jpg', true, 13);

    -- Item: Phô Mai Que
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Phô Mai Que', 'Phô mai que mozzarella chiên giòn tan kéo sợi thơm béo ngậy', 37000, '/images/menu/104_pho_mai_que.jpg', true, 14);

    -- Item: Khoai Tây Lắc Phô Mai
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Khoai Tây Lắc Phô Mai', 'Khoai tây chiên vàng giòn rụm lắc đẫm bột phô mai mặn béo', 37000, '/images/menu/105_khoai_tay_lac_pho.jpg', true, 15);

    -- Item: Ngô Chiên Bơ
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Ngô Chiên Bơ', 'Ngô ngọt tách hạt tẩm bột chiên bơ vàng giòn thơm lừng nức mũi', 37000, '/images/menu/106_ngo_chien.jpg', true, 16);

    -- Item: Khoai Lang Kén
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Khoai Lang Kén', 'Khoai lang kén nước cốt dừa thơm nức, vỏ ngoài giòn trong mềm dẻo', 37000, '/images/menu/107_khoai_lang_ken.jpg', true, 17);

    -- Item: Khoai Môn Lệ Phố
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Khoai Môn Lệ Phố', 'Khoai môn nhân trứng sữa tan chảy ngọt bùi thơm nức tiếng', 37000, '/images/menu/108_khoai_mon_le_pho.jpg', true, 18);

    -- Item: Đùi Gà KFC
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Đùi Gà KFC', 'Đùi gà tẩm bột chiên xù giòn tan rụm, thịt gà mọng nước thơm ngọt', 37000, '/images/menu/109_dui_ga_kfc.jpg', true, 19);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Khẩu phần', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES (v_tenant_id, v_group_id, v_item_id, 'Phần tiêu chuẩn (37k)', 0, true, true, 1),
           (v_tenant_id, v_group_id, v_item_id, 'Phần lớn (42k)', 5000, false, true, 2);

    -- Item: Cánh Gà KFC
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Cánh Gà KFC', 'Cánh gà chiên giòn đậm đà sốt chấm đặc biệt', 37000, '/images/menu/110_canh_ga_kfc.jpg', true, 20);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Khẩu phần', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES (v_tenant_id, v_group_id, v_item_id, 'Phần tiêu chuẩn (37k)', 0, true, true, 1),
           (v_tenant_id, v_group_id, v_item_id, 'Phần lớn (42k)', 5000, false, true, 2);

    -- Item: Má Đùi Gà KFC
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Má Đùi Gà KFC', 'Má đùi gà chiên xù nhiều nạc mềm ngon vỏ giòn rụm', 37000, '/images/menu/111_ma_dui_ga_kfc.jpg', true, 21);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Khẩu phần', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES (v_tenant_id, v_group_id, v_item_id, 'Phần tiêu chuẩn (37k)', 0, true, true, 1),
           (v_tenant_id, v_group_id, v_item_id, 'Phần lớn (42k)', 5000, false, true, 2);

    -- Item: Bò Khô Xé Sợi
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Bò Khô Xé Sợi', 'Thịt bò khô miếng xé sợi ướp ớt cay nồng vắt chanh chua tuyệt hảo', 32000, '/images/menu/112_bo_kho.jpg', true, 22);

    -- Item: Gà Khô Lá Chanh
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Gà Khô Lá Chanh', 'Khô gà cay giòn thơm lừng mùi lá chanh thơm nức mũi', 32000, '/images/menu/113_ga_kho.jpg', true, 23);

    -- Item: Mẹt Thập Cẩm
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Mẹt Thập Cẩm', 'Mẹt ăn vặt tổng hợp các món viên chiên, nem chua, xúc xích và khoai lắc', 52000, '/images/menu/114_met_thap_cam.jpg', true, 24);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Cỡ mẹt', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES (v_tenant_id, v_group_id, v_item_id, 'Mẹt Nhỏ (52k)', 0, true, true, 1),
           (v_tenant_id, v_group_id, v_item_id, 'Mẹt Vừa (72k)', 20000, false, true, 2),
           (v_tenant_id, v_group_id, v_item_id, 'Mẹt Lớn (102k)', 50000, false, true, 3);

    -- Item: Mỳ Cay Xúc Xích
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Mỳ Cay Xúc Xích', 'Mỳ cay chuẩn vị Hàn Quốc nước súp chua cay đậm đà kèm xúc xích', 37000, '/images/menu/115_my_cay_xuc_xich.jpg', true, 25);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Cấp độ cay', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES (v_tenant_id, v_group_id, v_item_id, 'Cấp 0 (Không cay)', 0, false, true, 1),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 1 (Cay nhẹ)', 0, true, true, 2),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 2 (Cay vừa)', 0, false, true, 3),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 3 (Cay nồng)', 0, false, true, 4),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 5 (Siêu cay)', 0, false, true, 5),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 7 (Thử thách)', 0, false, true, 6);

    -- Item: Mỳ Cay Bò
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Mỳ Cay Bò', 'Mỳ cay Hàn Quốc sợi dai ngon ăn kèm thịt bò Mỹ mềm ngọt và nấm kim châm', 42000, '/images/menu/116_my_cay_bo.jpg', true, 26);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Cấp độ cay', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES (v_tenant_id, v_group_id, v_item_id, 'Cấp 0 (Không cay)', 0, false, true, 1),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 1 (Cay nhẹ)', 0, true, true, 2),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 2 (Cay vừa)', 0, false, true, 3),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 3 (Cay nồng)', 0, false, true, 4),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 5 (Siêu cay)', 0, false, true, 5),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 7 (Thử thách)', 0, false, true, 6);

    -- Item: Mỳ Cay Hải Sản
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Mỳ Cay Hải Sản', 'Tô mỳ cay đầy đặn tôm, mực tươi giòn cùng nước dùng kim chi cay nồng', 52000, '/images/menu/117_my_cay_hai_san.jpg', true, 27);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Cấp độ cay', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES (v_tenant_id, v_group_id, v_item_id, 'Cấp 0 (Không cay)', 0, false, true, 1),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 1 (Cay nhẹ)', 0, true, true, 2),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 2 (Cay vừa)', 0, false, true, 3),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 3 (Cay nồng)', 0, false, true, 4),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 5 (Siêu cay)', 0, false, true, 5),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 7 (Thử thách)', 0, false, true, 6);

    -- Item: Mỳ Cay Thập Cẩm
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Mỳ Cay Thập Cẩm', 'Mỳ cay thập cẩm bò Mỹ, tôm mực hải sản, xúc xích và chả cá thơm ngon', 52000, '/images/menu/118_my_cay_thap_cam.jpg', true, 28);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Cấp độ cay', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES (v_tenant_id, v_group_id, v_item_id, 'Cấp 0 (Không cay)', 0, false, true, 1),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 1 (Cay nhẹ)', 0, true, true, 2),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 2 (Cay vừa)', 0, false, true, 3),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 3 (Cay nồng)', 0, false, true, 4),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 5 (Siêu cay)', 0, false, true, 5),
           (v_tenant_id, v_group_id, v_item_id, 'Cấp 7 (Thử thách)', 0, false, true, 6);

    -- Item: Pizza Thập Cẩm (Bò, Ngô, Xúc Xích)
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Pizza Thập Cẩm (Bò, Ngô, Xúc Xích)', 'Đế bánh nướng giòn rụm phủ đẫm sốt cà chua, thịt bò, xúc xích, ngô ngọt và phô mai kéo sợi', 82000, '/images/menu/119_pizza_thap_cam_bo.jpg', true, 29);

    -- Item: Pizza Xúc Xích Ngô
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Pizza Xúc Xích Ngô', 'Pizza xúc xích nướng cùng ngô ngọt vàng ươm và lớp phô mai dày béo ngậy', 82000, '/images/menu/120_pizza_xuc_xich_ngo.jpg', true, 30);

    -- Item: Gà Viên Chiên Giòn
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Gà Viên Chiên Giòn', 'Thịt gà viên popcorn tẩm bột chiên giòn rụm vừa ăn lắc chút muối ớt', 45000, '/images/menu/121_ga_vien.jpg', true, 31);

    -- Item: Kimbap Chiên (Cơm Cuộn)
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Kimbap Chiên (Cơm Cuộn)', 'Cơm cuộn rong biển nhân rau củ xúc xích tẩm bột xù chiên vàng', 45000, '/images/menu/122_kimbap_chien_com_cuon.jpg', true, 32);
    v_group_id := gen_random_uuid();
    INSERT INTO item_option_groups (id, tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active)
    VALUES (v_group_id, v_tenant_id, v_item_id, 'Khẩu phần', 'SINGLE', 1, 1, 'ADDITIVE', 1, true);
    INSERT INTO item_options (tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order)
    VALUES (v_tenant_id, v_group_id, v_item_id, 'Phần Thường (45k)', 0, true, true, 1),
           (v_tenant_id, v_group_id, v_item_id, 'Phần Đặc Biệt (65k)', 20000, false, true, 2);

    -- Item: Nem Viên Phô Mai
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Nem Viên Phô Mai', 'Viên nem thơm ngọt nhân phô mai dẻo chảy béo ngậy giòn tan', 45000, '/images/menu/123_nem_vien_pho_mai.jpg', true, 33);

    -- Item: Cá Viên Hải Sản Sốt Mayoleo
    v_item_id := gen_random_uuid();
    INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, image_url, is_available, sort_order)
    VALUES (v_item_id, v_tenant_id, v_cat_id, 'Cá Viên Hải Sản Sốt Mayoleo', 'Cá viên hải sản hảo hạng sốt béo ngậy mayo kết hợp chút chua cay đặc sắc', 50000, '/images/menu/124_ca_vien_hai_san.jpg', true, 34);


END $$;