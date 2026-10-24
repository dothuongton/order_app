import { pool, withTransaction } from '../db/pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RawOption {
    name: string;
    delta: number;
    default?: boolean;
}

interface RawOptionGroup {
    group: string;
    options: RawOption[];
}

interface RawMenuItem {
    num: number;
    name: string;
    price: number;
    image: string;
    desc: string;
    options?: RawOptionGroup[];
}

interface RawCategory {
    category: string;
    sort_order: number;
    is_drink: boolean;
    items: RawMenuItem[];
}

export async function seedDalatPhoMenu(targetTenantId: string = '11111111-1111-1111-1111-111111111111') {
    const jsonPath = path.resolve(__dirname, '../db/data/dalat_pho_menu.json');
    if (!fs.existsSync(jsonPath)) {
        throw new Error(`Data file not found at: ${jsonPath}`);
    }

    const categories: RawCategory[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    console.log(`🌱 Loading Đà Lạt Phố menu into tenant ${targetTenantId}...`);

    await withTransaction(async (client) => {
        // 1. Ensure tenant exists & update name
        const tenantRes = await client.query(`
            SELECT id, name FROM tenants WHERE id = $1
        `, [targetTenantId]);

        if (tenantRes.rows.length === 0) {
            console.log(`Creating tenant ${targetTenantId}...`);
            await client.query(`
                INSERT INTO tenants (id, slug, name, currency, timezone)
                VALUES ($1, 'da-lat-pho', 'Quán Trà Sữa & Ăn Vặt Đà Lạt Phố', 'VND', 'Asia/Ho_Chi_Minh')
            `, [targetTenantId]);
        } else {
            console.log(`Updating tenant ${targetTenantId} name to 'Quán Trà Sữa & Ăn Vặt Đà Lạt Phố'...`);
            await client.query(`
                UPDATE tenants
                SET name = 'Quán Trà Sữa & Ăn Vặt Đà Lạt Phố',
                    updated_at = NOW()
                WHERE id = $1
            `, [targetTenantId]);
        }

        // 2. Remove existing option groups, menu items, categories, and uploaded images for this tenant
        console.log(`Cleaning old menu items & categories for tenant ${targetTenantId}...`);
        await client.query(`DELETE FROM item_options WHERE tenant_id = $1`, [targetTenantId]);
        await client.query(`DELETE FROM item_option_groups WHERE tenant_id = $1`, [targetTenantId]);
        await client.query(`DELETE FROM menu_item_variants WHERE tenant_id = $1`, [targetTenantId]);
        await client.query(`DELETE FROM menu_items WHERE tenant_id = $1`, [targetTenantId]);
        await client.query(`DELETE FROM menu_categories WHERE tenant_id = $1`, [targetTenantId]);
        await client.query(`DELETE FROM uploaded_images WHERE tenant_id = $1`, [targetTenantId]);

        let totalItems = 0;
        let totalOptionGroups = 0;
        let totalOptions = 0;
        let totalImagesUploaded = 0;

        for (const cat of categories) {
            const catRes = await client.query(`
                INSERT INTO menu_categories (tenant_id, name, sort_order)
                VALUES ($1, $2, $3)
                RETURNING id, name
            `, [targetTenantId, cat.category, cat.sort_order]);

            const catId = catRes.rows[0].id;

            for (let i = 0; i < cat.items.length; i++) {
                const item = cat.items[i];
                const itemSortOrder = i + 1;

                // Store image directly in PostgreSQL uploaded_images table
                let finalImageUrl = item.image;
                const localFilePath = path.resolve(__dirname, '../../../frontend/public', item.image.replace(/^\//, ''));
                if (fs.existsSync(localFilePath)) {
                    const fileBuf = fs.readFileSync(localFilePath);
                    const mimeType = item.image.endsWith('.png') ? 'image/png' : 'image/jpeg';
                    const base64Data = `data:${mimeType};base64,${fileBuf.toString('base64')}`;
                    const filename = path.basename(item.image);

                    const imgRes = await client.query(`
                        INSERT INTO uploaded_images (tenant_id, filename, mime_type, size_bytes, data_base64)
                        VALUES ($1, $2, $3, $4, $5)
                        RETURNING id
                    `, [targetTenantId, filename, mimeType, fileBuf.length, base64Data]);

                    finalImageUrl = `/api/v1/public/images/${imgRes.rows[0].id}`;
                    totalImagesUploaded++;
                }

                const itemRes = await client.query(`
                    INSERT INTO menu_items (
                        tenant_id, category_id, name, description, price, image_url, is_available, sort_order
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, true, $7)
                    RETURNING id, name
                `, [
                    targetTenantId,
                    catId,
                    item.name,
                    item.desc || '',
                    item.price,
                    finalImageUrl,
                    itemSortOrder
                ]);

                const itemId = itemRes.rows[0].id;
                totalItems++;

                // If item is a drink: add standard Size M / Size L option group (+5000đ for Size L)
                if (cat.is_drink) {
                    const groupRes = await client.query(`
                        INSERT INTO item_option_groups (
                            tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active
                        )
                        VALUES ($1, $2, 'Kích cỡ', 'SINGLE', 1, 1, 'ADDITIVE', 1, true)
                        RETURNING id
                    `, [targetTenantId, itemId]);

                    const groupId = groupRes.rows[0].id;
                    totalOptionGroups++;

                    await client.query(`
                        INSERT INTO item_options (
                            tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order
                        )
                        VALUES
                            ($1, $2, $3, 'Size M', 0, true, true, 1),
                            ($1, $2, $3, 'Size L', 5000, false, true, 2)
                    `, [targetTenantId, groupId, itemId]);

                    totalOptions += 2;
                }

                // If item has specific custom option groups
                if (item.options && item.options.length > 0) {
                    for (let gIdx = 0; gIdx < item.options.length; gIdx++) {
                        const optGroup = item.options[gIdx];
                        const groupRes = await client.query(`
                            INSERT INTO item_option_groups (
                                tenant_id, menu_item_id, name, selection_mode, min_selections, max_selections, pricing_mode, sort_order, is_active
                            )
                            VALUES ($1, $2, $3, 'SINGLE', 1, 1, 'ADDITIVE', $4, true)
                            RETURNING id
                        `, [targetTenantId, itemId, optGroup.group, gIdx + (cat.is_drink ? 2 : 1)]);

                        const groupId = groupRes.rows[0].id;
                        totalOptionGroups++;

                        for (let oIdx = 0; oIdx < optGroup.options.length; oIdx++) {
                            const opt = optGroup.options[oIdx];
                            await client.query(`
                                INSERT INTO item_options (
                                    tenant_id, group_id, menu_item_id, name, price_delta, is_default, is_available, sort_order
                                )
                                VALUES ($1, $2, $3, $4, $5, $6, true, $7)
                            `, [
                                targetTenantId,
                                groupId,
                                itemId,
                                opt.name,
                                opt.delta,
                                !!opt.default,
                                oIdx + 1
                            ]);
                            totalOptions++;
                        }
                    }
                }
            }
        }

        console.log(`✅ Successfully seeded Đà Lạt Phố menu for tenant ${targetTenantId}:`);
        console.log(`   - ${categories.length} Categories`);
        console.log(`   - ${totalItems} Menu Items`);
        console.log(`   - ${totalImagesUploaded} Images Stored Directly in PostgreSQL (uploaded_images)`);
        console.log(`   - ${totalOptionGroups} Option Groups`);
        console.log(`   - ${totalOptions} Options (Sizes, Portions, Spicy levels)`);
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    seedDalatPhoMenu()
        .then(() => {
            console.log('🎉 Menu import completed.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('❌ Menu import failed:', err);
            process.exit(1);
        });
}
