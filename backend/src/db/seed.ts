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
                ('11111111-1111-1111-1111-111111111111', 'pho-co', 'Phở & Cà Phê Phố Cổ', 'VND', 'Asia/Ho_Chi_Minh'),
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

        // 5. Menu Categories for Pho Co
        const catRes = await client.query(`
            INSERT INTO menu_categories (tenant_id, name, sort_order)
            VALUES
                ($1, 'Món chính (Phở & Cơm)', 1),
                ($1, 'Đồ uống & Giải khát', 2),
                ($1, 'Món ăn kèm', 3)
            RETURNING id, name;
        `, [phoCoId]);

        const catMain = catRes.rows[0].id;
        const catDrinks = catRes.rows[1].id;
        const catSides = catRes.rows[2].id;

        // 6. Menu Items
        const itemsRes = await client.query(`
            INSERT INTO menu_items (tenant_id, category_id, name, description, price, is_available)
            VALUES
                ($1, $2, 'Cơm Gà Xối Mỡ', 'Cơm vàng hạt dẻo thơm kèm đùi gà xối mỡ da giòn rụm', 65000, true),
                ($1, $2, 'Phở Bò Tái Nạm', 'Bánh phở tươi, nước dùng hầm xương 12 tiếng, thịt bò tươi ngon', 65000, true),
                ($1, $2, 'Phở Gà Đồi Lá Chanh', 'Thịt gà ta thả vườn dai ngọt kèm lá chanh tươi thái sợi', 60000, true),
                ($1, $3, 'Trà Đào Cam Sả', 'Trà thanh nhiệt với đào tươi giòn, hương cam sả thơm mát', 35000, true),
                ($1, $3, 'Cà Phê Sữa Đá Phố Cổ', 'Cà phê Robusta rang mộc đậm đà pha sữa đặc truyền thống', 28000, true),
                ($1, $3, 'Nước Suối Tinh Khiết', 'Chai 500ml ướp lạnh sảng khoái', 15000, true),
                ($1, $4, 'Quẩy Giòn Phở', 'Đĩa 3 chiếc quẩy vàng giòn rụm chấm nước phở', 10000, true),
                ($1, $4, 'Trứng Chần Lòng Đào', 'Trứng gà ta chần lòng đào béo ngậy', 8000, true)
            RETURNING id, name, price;
        `, [phoCoId, catMain, catDrinks, catSides]);

        const comGa = itemsRes.rows[0];
        const phoBo = itemsRes.rows[1];
        const traDao = itemsRes.rows[3];
        const nuocSuoi = itemsRes.rows[5];

        console.log(`✅ Seeded ${tablesRes.rows.length} tables and ${itemsRes.rows.length} menu items for ${phoCoId}`);
        console.log(`💡 Demo Credentials:`);
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
