import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './pool.js';
import { fileURLToPath } from 'url';

export async function seed(force: boolean = false) {
    console.log('🌱 Checking database seed status...');

    await withTransaction(async (client) => {
        // In production/runtime, avoid wiping live operational data on server restart
        const isTest = process.env.NODE_ENV === 'test';
        if (!isTest && !force && process.env.FORCE_SEED !== 'true') {
            const tenantCheck = await client.query(`SELECT COUNT(*) FROM tenants`);
            const userCheck = await client.query(`SELECT COUNT(*) FROM users`);
            if (parseInt(tenantCheck.rows[0].count, 10) > 0 && parseInt(userCheck.rows[0].count, 10) > 0) {
                console.log('✅ Database already initialized with tenants & users. Preserving operational data.');
                return;
            }
        }

        console.log('🌱 Seeding fresh demo data...');
        // Clear old data in reverse dependency order
        await client.query(`
            TRUNCATE TABLE 
                manual_settlement_confirmations,
                bill_lines,
                bills,
                service_requests,
                order_item_events,
                order_item_parts,
                order_items,
                orders,
                guest_sessions,
                table_sessions,
                tables,
                menu_item_variants,
                menu_items,
                menu_categories,
                memberships,
                users,
                tenants,
                idempotency_records,
                audit_logs
            CASCADE;
        `);

        // 1. Tenants
        const tenantRes = await client.query(`
            INSERT INTO tenants (id, slug, name, currency, timezone)
            VALUES 
                ('11111111-1111-1111-1111-111111111111', 'pho-co', 'Quán Ăn Vặt & Trà Sữa Phố Cổ', 'VND', 'Asia/Ho_Chi_Minh'),
                ('22222222-2222-2222-2222-222222222222', 'sakura', 'Trà Sữa & Ăn Vặt Sakura', 'VND', 'Asia/Ho_Chi_Minh')
            RETURNING id, slug, name;
        `);
        const phoCoId = tenantRes.rows[0].id;
        const sakuraId = tenantRes.rows[1].id;

        // 2. Users
        const passwordHash = await bcrypt.hash('123456', 10);
        const usersRes = await client.query(`
            INSERT INTO users (id, email, password_hash, full_name, phone, is_platform_admin)
            VALUES
                ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@phoco.vn', $1, 'Nguyễn Quản Lý', '0901234567', false),
                ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'phucvu@phoco.vn', $1, 'Trần Phục Vụ', '0902345678', false),
                ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'thungan@phoco.vn', $1, 'Lê Thu Ngân', '0903456789', false)
            RETURNING id, email, full_name;
        `, [passwordHash]);

        const adminUser = usersRes.rows[0];
        const waiterUser = usersRes.rows[1];
        const cashierUser = usersRes.rows[2];

        // 3. Memberships
        // Manager: full permissions
        await client.query(`
            INSERT INTO memberships (tenant_id, user_id, role, permissions)
            VALUES
                ($1, $2, 'manager', ARRAY[
                    'session.open',
                    'session.confirm_payment_close',
                    'session.close_without_charge',
                    'order.manage',
                    'order.serve',
                    'order.cancel',
                    'menu.manage',
                    'table.manage',
                    'report.view'
                ]),
                ($1, $3, 'waiter', ARRAY[
                    'session.open',
                    'session.confirm_payment_close',
                    'session.close_without_charge',
                    'order.manage',
                    'order.serve',
                    'order.cancel',
                    'table.manage'
                ]),
                ($1, $4, 'cashier', ARRAY[
                    'session.confirm_payment_close',
                    'session.close_without_charge',
                    'report.view'
                ]);
        `, [phoCoId, adminUser.id, waiterUser.id, cashierUser.id]);

        // 4. Tables for Pho Co
        const tablesRes = await client.query(`
            INSERT INTO tables (id, tenant_id, table_number, public_qr_id, capacity, readiness)
            VALUES
                ('10000000-0000-0000-0000-000000000001', $1, 'A01', 'qr-phoco-a01', 4, 'READY'),
                ('10000000-0000-0000-0000-000000000002', $1, 'A02', 'qr-phoco-a02', 4, 'READY'),
                ('10000000-0000-0000-0000-000000000003', $1, 'A03', 'qr-phoco-a03', 2, 'READY'),
                ('10000000-0000-0000-0000-000000000004', $1, 'B01', 'qr-phoco-b01', 6, 'READY'),
                ('10000000-0000-0000-0000-000000000005', $1, 'B02', 'qr-phoco-b02', 8, 'READY')
            RETURNING id, table_number, public_qr_id;
        `, [phoCoId]);

        // Tables for Sakura (to verify multi-tenant isolation)
        await client.query(`
            INSERT INTO tables (id, tenant_id, table_number, public_qr_id, capacity, readiness)
            VALUES
                ('20000000-0000-0000-0000-000000000001', $1, 'A01', 'qr-sakura-a01', 4, 'READY'),
                ('20000000-0000-0000-0000-000000000002', $1, 'A02', 'qr-sakura-a02', 2, 'READY')
        `, [sakuraId]);

        // 5. Menu Categories for Snack Shop
        const catRes = await client.query(`
            INSERT INTO menu_categories (tenant_id, name, sort_order)
            VALUES
                ($1, 'Đồ Ăn Vặt', 1),
                ($1, 'Đồ Uống & Trà Sữa', 2),
                ($1, 'Topping Ăn Vặt', 3)
            RETURNING id, name;
        `, [phoCoId]);

        const catSnacks = catRes.rows[0].id;
        const catDrinks = catRes.rows[1].id;
        const catToppings = catRes.rows[2].id;

        // 6. Menu Items (Đồ ăn vặt & Đồ uống)
        const itemsRes = await client.query(`
            INSERT INTO menu_items (tenant_id, category_id, name, description, price, is_available)
            VALUES
                ($1, $2, 'Bánh Tráng Trộn Đặc Biệt', 'Bánh tráng phơi sương, trứng cút, khô bò, xoài non, rau răm, sốt tắc cay ngọt', 25000, true),
                ($1, $2, 'Bánh Tráng Nướng Đà Lạt', 'Trứng cút, tép khô, hành hoa, xúc xích, phô mai nướng giòn rụm', 25000, true),
                ($1, $2, 'Khoai Tây Lắc Phô Mai', 'Khoai tây chiên vàng giòn rụm lắc bột phô mai béo ngậy', 30000, true),
                ($1, $2, 'Nem Chua Rán Hà Nội', 'Đĩa 5 chiếc nem chua lăn bột xù chiên giòn rụm, thơm bùi', 35000, true),
                ($1, $2, 'Cá Viên Chiên Thập Cẩm', 'Combo cá viên, bò viên, tôm viên, đậu bắp chiên kèm tương đen sốt cay', 35000, true),
                ($1, $2, 'Gà Xiên Que Sốt Cay', 'Gà xiên que nướng than hoa quết sốt cay ngọt Hàn Quốc', 20000, true),
                ($1, $2, 'Xoài Lắc Muối Tôm', 'Xoài non giòn rụm lắc muối tôm Tây Ninh chua cay đậm đà', 20000, true),
                ($1, $2, 'Cơm Cháy Chà Bông Mỡ Hành', 'Cơm cháy đáy nồi giòn tan phủ đẫm chà bông gà cay và sốt mỡ hành', 25000, true),
                ($1, $3, 'Trà Sữa Trân Châu Đường Đen', 'Trà sữa đậm vị thơm béo kết hợp trân châu đen dai giòn dẻo', 30000, true),
                ($1, $3, 'Trà Đào Cam Sả', 'Trà thanh nhiệt với đào tươi giòn, hương cam sả thơm mát', 30000, true),
                ($1, $3, 'Trà Tắc Xí Muội Khổng Lồ', 'Ly 700ml trà lài tươi pha tắc vàng và xí muội mặn ngọt giải nhiệt cực đã', 25000, true),
                ($1, $3, 'Trà Chanh Giã Tay', 'Trà Ô Long thơm nồng giã tay cùng chanh tươi Quảng Đông mát lạnh', 25000, true),
                ($1, $3, 'Trà Dâu Tằm Macchiato', 'Trà dâu tằm chua ngọt thanh mát phủ lớp kem cheese béo mịn', 35000, true),
                ($1, $3, 'Sữa Tươi Trân Châu Đường Đen', 'Sữa tươi tiệt trùng Đà Lạt hòa quyện đường đen organic dẻo quánh', 35000, true),
                ($1, $3, 'Coca-Cola Ướp Lạnh', 'Lon 330ml ướp lạnh sảng khoái', 15000, true),
                ($1, $3, 'Nước Suối Tinh Khiết', 'Chai 500ml ướp lạnh sảng khoái', 10000, true),
                ($1, $4, 'Thêm Trân Châu Đen', 'Phần trân châu đen hoàng kim dẻo dai', 5000, true),
                ($1, $4, 'Thêm Phô Mai Tươi', 'Viên phô mai tươi béo ngậy tan chảy', 8000, true),
                ($1, $4, 'Thêm Bánh Flan Trứng', 'Bánh flan caramen trứng gà thơm ngậy', 10000, true)
            RETURNING id, name, price;
        `, [phoCoId, catSnacks, catDrinks, catToppings]);

        // 7. Super Admin User
        const superAdminHash = await bcrypt.hash('admin123', 10);
        await client.query(`
            INSERT INTO users (id, email, password_hash, full_name, phone, is_platform_admin)
            VALUES ('99999999-9999-9999-9999-999999999999', 'superadmin@qrorder.vn', $1, 'Hệ Thống Super Admin', '0999999999', true)
            ON CONFLICT (email) DO UPDATE SET is_platform_admin = true;
        `, [superAdminHash]);

        // 8. Banners for Pho Co
        await client.query(`
            INSERT INTO banners (tenant_id, title, description, image_url, cta_link, sort_order, is_active)
            VALUES
                ($1, 'Đại Tiệc Ăn Vặt Giảm 20%', 'Thưởng thức bánh tráng nướng & nem chua rán giòn rụm', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&auto=format&fit=crop', '#category-snacks', 1, true),
                ($1, 'Trà Sữa Phố Cổ Tươi Mát', 'Trà sữa trân châu đường đen & trà đào cam sả thanh nhiệt', 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=800&auto=format&fit=crop', '#category-drinks', 2, true)
            ON CONFLICT DO NOTHING;
        `, [phoCoId]);

        // 9. Promotions for Pho Co
        await client.query(`
            INSERT INTO promotions (tenant_id, code, title, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_redemptions, priority, is_active)
            VALUES
                ($1, 'GIAM10', 'Giảm 10% Cho Đơn Từ 50K', 'Áp dụng cho mọi món ăn vặt & trà sữa', 'PERCENT', 10, 50000, 20000, 100, 1, true),
                ($1, 'TIEC20K', 'Giảm Ngay 20.000đ Đơn Từ 100K', 'Ưu đãi đặc biệt cho nhóm đông người', 'FIXED_AMOUNT', 20000, 100000, NULL, 50, 2, true)
            ON CONFLICT DO NOTHING;
        `, [phoCoId]);

        // 10. CMS Draft and Published Version 1 for Pho Co
        const initialThemeConfig = {
            primaryColor: '#ea580c',
            fontFamily: 'Inter',
            layout: 'classic',
            showBanner: true,
            showPromotions: true,
            blockOrder: ['header', 'banners', 'promotions', 'categories', 'product_grid', 'cart_footer']
        };

        await client.query(`
            INSERT INTO cms_drafts (tenant_id, template_id, theme_config, content_config, version)
            VALUES ($1, 'classic', $2, '{"bannerIds":[]}'::jsonb, 1)
            ON CONFLICT (tenant_id) DO UPDATE SET
                theme_config = EXCLUDED.theme_config,
                updated_at = NOW();
        `, [phoCoId, JSON.stringify(initialThemeConfig)]);

        await client.query(`
            INSERT INTO cms_published_versions (tenant_id, version, template_id, theme_config, content_config, changelog)
            VALUES ($1, 1, 'classic', $2, '{"bannerIds":[]}'::jsonb, 'Khởi tạo giao diện mặc định v1.0')
            ON CONFLICT (tenant_id, version) DO NOTHING;
        `, [phoCoId, JSON.stringify(initialThemeConfig)]);

        console.log(`✅ Seeded ${tablesRes.rows.length} tables and ${itemsRes.rows.length} snack menu items for ${phoCoId}`);
        console.log(`💡 Demo Credentials:`);
        console.log(`   - Super Admin: superadmin@qrorder.vn / admin123`);
        console.log(`   - Quản lý / Manager: admin@phoco.vn / 123456`);
        console.log(`   - Phục vụ / Waiter: phucvu@phoco.vn / 123456`);
        console.log(`   - Thu ngân / Cashier: thungan@phoco.vn / 123456`);
        console.log(`   - Bàn A01 QR ID: qr-phoco-a01`);
        console.log(`   - Bàn A02 QR ID: qr-phoco-a02`);
    });

    console.log('🌱 Seeding finished successfully.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    seed().then(() => process.exit(0)).catch((err) => {
        console.error('Seed error:', err);
        process.exit(1);
    });
}
