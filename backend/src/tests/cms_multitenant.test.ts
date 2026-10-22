import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../app.js';
import { pool, query } from '../db/pool.js';
import { seed } from '../db/seed.js';

describe('Multi-Tenant CMS & Security Test Suite', () => {
    let server: http.Server;
    let baseUrl: string;
    let superAdminToken: string;
    let shopAAdminToken: string;
    let shopBAdminToken: string;
    let tenantAId: string;
    let tenantBId: string;

    beforeAll(async () => {
        await seed(true);

        // Start server on an ephemeral port
        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        // 1. Super Admin Login
        const superRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'superadmin@qrorder.vn', password: 'admin123' })
        });
        expect(superRes.status).toBe(200);
        const superData: any = await superRes.json();
        superAdminToken = superData.token;

        // 2. Shop A (Pho Co) Login
        const shopARes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@phoco.vn', password: '123456' })
        });
        expect(shopARes.status).toBe(200);
        const shopAData: any = await shopARes.json();
        shopAAdminToken = shopAData.token;
        tenantAId = shopAData.currentTenant.id;
    });

    afterAll(async () => {
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
        await pool.end();
    });

    // ==========================================
    // 1. SUPER ADMIN TESTS
    // ==========================================
    describe('Super Admin Portal & Management', () => {
        it('allows super admin to view platform stats', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/stats`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.totalShops).toBeGreaterThanOrEqual(1);
            expect(data.activeShops).toBeGreaterThanOrEqual(1);
        });

        it('denies non-super admin from accessing admin stats (RBAC)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/stats`, {
                headers: { 'Authorization': `Bearer ${shopAAdminToken}` }
            });
            expect(res.status).toBe(403);
            const data: any = await res.json();
            expect(data.error).toBe('FORBIDDEN');
        });

        it('allows super admin to create a new shop (Shop B)', async () => {
            const newShopPayload = {
                name: 'Trà Sữa Matcha Kyoto',
                slug: 'matcha-kyoto',
                phone: '0988776655',
                address: '123 Phố Nhật, Hà Nội',
                ownerEmail: 'owner@kyoto.vn',
                ownerFullName: 'Yamada Ken',
                ownerPassword: 'password123'
            };

            const res = await fetch(`${baseUrl}/api/v1/admin/shops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify(newShopPayload)
            });

            expect(res.status).toBe(201);
            const data: any = await res.json();
            expect(data.shop.slug).toBe('matcha-kyoto');
            tenantBId = data.shop.id;

            // Login as new owner to get shopBAdminToken
            const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'owner@kyoto.vn', password: 'password123' })
            });
            expect(loginRes.status).toBe(200);
            const loginData: any = await loginRes.json();
            shopBAdminToken = loginData.token;
        });

        it('rejects duplicate shop slug', async () => {
            const dupPayload = {
                name: 'Trà Sữa Trùng Slug',
                slug: 'matcha-kyoto', // already exists
                ownerEmail: 'other@kyoto.vn',
                ownerFullName: 'Nguyen Van A'
            };

            const res = await fetch(`${baseUrl}/api/v1/admin/shops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify(dupPayload)
            });

            expect(res.status).toBe(400);
            const data: any = await res.json();
            expect(data.error).toBe('BAD_REQUEST');
        });

        it('allows super admin to list available layout templates', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/templates`, {
                headers: { 'Authorization': `Bearer ${superAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(Array.isArray(data.templates)).toBe(true);
            expect(data.templates.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ==========================================
    // 2. SHOP CMS (DRAFT, PUBLISH, ROLLBACK)
    // ==========================================
    describe('Shop CMS Draft, Publish & Rollback', () => {
        it('allows shop owner to view current CMS draft', async () => {
            const res = await fetch(`${baseUrl}/api/v1/cms/draft`, {
                headers: { 'Authorization': `Bearer ${shopAAdminToken}` }
            });
            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.draft).toBeDefined();
            expect(data.draft.templateId).toBe('classic');
        });

        it('allows shop owner to save new theme tokens in draft', async () => {
            const updatedTheme = {
                primaryColor: '#059669', // Emerald
                fontFamily: 'Inter',
                layout: 'modern_grid',
                showBanner: true,
                showPromotions: true,
                blockOrder: ['header', 'banners', 'categories', 'product_grid', 'cart_footer']
            };

            const res = await fetch(`${baseUrl}/api/v1/cms/draft`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({
                    templateId: 'modern_grid',
                    themeConfig: updatedTheme,
                    contentConfig: { bannerIds: [] }
                })
            });

            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.draft.template_id).toBe('modern_grid');
        });

        it('publishes draft atomically creating a new version (v2)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/cms/publish`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({ changelog: 'Cập nhật màu xanh ngọc lục bảo và layout 2 cột' })
            });

            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.publishedVersion).toBe(2);
            expect(data.templateId).toBe('modern_grid');

            // Verify Storefront now reflects published version 2
            const profileRes = await fetch(`${baseUrl}/api/v1/cms/profile`, {
                headers: { 'Authorization': `Bearer ${shopAAdminToken}` }
            });
            const profileData: any = await profileRes.json();
            expect(profileData.profile.activePublishedVersion).toBe(2);
            expect(profileData.profile.activeTemplateId).toBe('modern_grid');
            expect(profileData.profile.activeThemeConfig.primaryColor).toBe('#059669');
        });

        it('allows rollback to version 1', async () => {
            const res = await fetch(`${baseUrl}/api/v1/cms/rollback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({ version: 1 })
            });

            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.rolledBackTo).toBe(1);
            expect(data.templateId).toBe('classic');

            // Verify active configuration is reverted
            const profileRes = await fetch(`${baseUrl}/api/v1/cms/profile`, {
                headers: { 'Authorization': `Bearer ${shopAAdminToken}` }
            });
            const profileData: any = await profileRes.json();
            expect(profileData.profile.activePublishedVersion).toBe(1);
            expect(profileData.profile.activeTemplateId).toBe('classic');
        });

        it('normalizes staffTheme and staffDensity defaults on existing profile and draft', async () => {
            const profileRes = await fetch(`${baseUrl}/api/v1/cms/profile`, {
                headers: { 'Authorization': `Bearer ${shopAAdminToken}` }
            });
            const profileData: any = await profileRes.json();
            expect(profileData.profile.activeThemeConfig.staffTheme).toEqual({
                accentColor: '#244f3c',
                textColor: '#27382e'
            });
            expect(profileData.profile.activeThemeConfig.staffDensity).toBe('comfortable');

            const draftRes = await fetch(`${baseUrl}/api/v1/cms/draft`, {
                headers: { 'Authorization': `Bearer ${shopAAdminToken}` }
            });
            const draftData: any = await draftRes.json();
            expect(draftData.draft.themeConfig.staffTheme).toEqual({
                accentColor: '#244f3c',
                textColor: '#27382e'
            });
            expect(draftData.draft.themeConfig.staffDensity).toBe('comfortable');
        });

        it('saves and publishes staffTheme with uppercase hex and verifies normalization to lowercase', async () => {
            const saveRes = await fetch(`${baseUrl}/api/v1/cms/draft`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({
                    templateId: 'classic',
                    themeConfig: {
                        primaryColor: '#059669',
                        fontFamily: 'Inter',
                        layout: 'classic',
                        showBanner: true,
                        showPromotions: true,
                        blockOrder: ['header', 'banners', 'promotions', 'categories', 'product_grid', 'cart_footer'],
                        staffTheme: {
                            accentColor: '#244F3C',
                            textColor: '#27382E'
                        },
                        staffDensity: 'compact'
                    },
                    contentConfig: { bannerIds: [] }
                })
            });
            expect(saveRes.status).toBe(200);

            const publishRes = await fetch(`${baseUrl}/api/v1/cms/publish`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({ changelog: 'Cập nhật theme xanh lá và mật độ gọn' })
            });
            expect(publishRes.status).toBe(200);
            const publishData: any = await publishRes.json();
            expect(publishData.themeConfig.staffTheme).toEqual({
                accentColor: '#244f3c',
                textColor: '#27382e'
            });
            expect(publishData.themeConfig.staffDensity).toBe('compact');

            // Verify /auth/me returns activeThemeConfig with staffTheme and staffDensity
            const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
                headers: { 'Authorization': `Bearer ${shopAAdminToken}` }
            });
            expect(meRes.status).toBe(200);
            const meData: any = await meRes.json();
            expect(meData.user.activeThemeConfig.staffTheme).toEqual({
                accentColor: '#244f3c',
                textColor: '#27382e'
            });
            expect(meData.user.activeThemeConfig.staffDensity).toBe('compact');
        });

        it('rejects invalid staffTheme and invalid staffDensity', async () => {
            const invalidColorRes = await fetch(`${baseUrl}/api/v1/cms/draft`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({
                    templateId: 'classic',
                    themeConfig: {
                        primaryColor: '#059669',
                        fontFamily: 'Inter',
                        layout: 'classic',
                        showBanner: true,
                        showPromotions: true,
                        blockOrder: ['header', 'banners', 'promotions', 'categories', 'product_grid', 'cart_footer'],
                        staffTheme: {
                            accentColor: 'not-a-hex',
                            textColor: '#27382e'
                        }
                    }
                })
            });
            expect(invalidColorRes.status).toBe(400);

            const invalidDensityRes = await fetch(`${baseUrl}/api/v1/cms/draft`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({
                    templateId: 'classic',
                    themeConfig: {
                        primaryColor: '#059669',
                        fontFamily: 'Inter',
                        layout: 'classic',
                        showBanner: true,
                        showPromotions: true,
                        blockOrder: ['header', 'banners', 'promotions', 'categories', 'product_grid', 'cart_footer'],
                        staffDensity: 'ultra-compact'
                    }
                })
            });
            expect(invalidDensityRes.status).toBe(400);
        });
    });

    // ==========================================
    // 3. CROSS-TENANT ISOLATION & IDOR DEFENSE
    // ==========================================
    describe('Cross-Tenant Data Isolation & IDOR Defense', () => {
        let shopABannerId: string;

        it('creates a banner in Shop A', async () => {
            const res = await fetch(`${baseUrl}/api/v1/cms/banners`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({
                    title: 'Banner Độc Quyền Shop A',
                    imageUrl: 'https://example.com/banner-a.jpg',
                    sortOrder: 1
                })
            });
            expect(res.status).toBe(201);
            const data: any = await res.json();
            shopABannerId = data.banner.id;
        });

        it('prevents Shop B admin from modifying Shop A banner (IDOR Defense)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/cms/banners/${shopABannerId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopBAdminToken}`
                },
                body: JSON.stringify({ title: 'Hacked by Shop B' })
            });

            expect(res.status).toBe(400); // Fails ownership check in query WHERE id = $1 AND tenant_id = $2
            const data: any = await res.json();
            expect(data.message).toContain('Không tìm thấy banner');
        });

        it('prevents Shop B admin from deleting Shop A banner (IDOR Defense)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/cms/banners/${shopABannerId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${shopBAdminToken}` }
            });

            expect(res.status).toBe(400);
            const data: any = await res.json();
            expect(data.message).toContain('Không tìm thấy banner để xóa');
        });
    });

    // ==========================================
    // 4. PROMOTIONS & PRICING ENGINE TESTS
    // ==========================================
    describe('Promotions & Pricing Engine', () => {
        it('creates percentage and fixed amount promotions for Shop A', async () => {
            // Percent promo: 10% off for orders >= 50k, max 15k cap
            const resP = await fetch(`${baseUrl}/api/v1/cms/promotions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({
                    title: 'Giảm 10% Tối Đa 15K',
                    discountType: 'PERCENT',
                    discountValue: 10,
                    minOrderAmount: 50000,
                    maxDiscountAmount: 15000,
                    priority: 1
                })
            });
            expect(resP.status).toBe(201);

            // Fixed promo: 20k off for orders >= 100k
            const resF = await fetch(`${baseUrl}/api/v1/cms/promotions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({
                    title: 'Giảm 20K Cho Đơn 100K',
                    discountType: 'FIXED_AMOUNT',
                    discountValue: 20000,
                    minOrderAmount: 100000,
                    priority: 2
                })
            });
            expect(resF.status).toBe(201);
        });

        it('rejects invalid percentage values (> 100 or <= 0)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/cms/promotions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({
                    title: 'Giảm 150%',
                    discountType: 'PERCENT',
                    discountValue: 150
                })
            });
            expect(res.status).toBe(400);
        });

        it('applies single best deal (non-stacking) when guest orders', async () => {
            // 1. Staff opens table A01 session
            const tableA01 = (await query(`SELECT id FROM tables WHERE public_qr_id = 'qr-phoco-a01'`)).rows[0];
            const openRes = await fetch(`${baseUrl}/api/v1/staff/tables/${tableA01.id}/open`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                }
            });
            expect(openRes.status).toBe(201);

            // 2. Guest joins session
            const joinRes = await fetch(`${baseUrl}/api/v1/public/tables/qr-phoco-a01/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            expect(joinRes.status).toBe(200);
            const joinData: any = await joinRes.json();
            const guestToken = joinData.token;

            // 3. Guest orders items: 4 x Nem chua rán (35k x 4 = 140,000đ)
            // Eligible for promos:
            // - 10% promo: 140k * 10% = 14,000đ
            // - 20k fixed promo: 20,000đ
            // Best deal policy MUST pick 20,000đ!
            const nemChua = (await query(`SELECT id FROM menu_items WHERE name = 'Nem Chua Rán Hà Nội'`)).rows[0];

            const orderRes = await fetch(`${baseUrl}/api/v1/guest/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-guest-token': guestToken
                },
                body: JSON.stringify({
                    idempotencyKey: `order-promo-test-${Date.now()}`,
                    items: [{ menuItemId: nemChua.id, quantity: 4 }]
                })
            });

            expect(orderRes.status).toBe(201);
            const orderData: any = await orderRes.json();
            expect(orderData.subtotal).toBe(140000);
            expect(orderData.discountTotal).toBe(20000); // 20k discount
            expect(orderData.finalTotal).toBe(120000);   // 140k - 20k = 120k
            expect(orderData.appliedPromotion).toBeDefined();
            expect(orderData.appliedPromotion.discountAmount).toBe(20000);

            // Verify order item snapshots
            expect(orderData.items[0].discountAmount).toBe(20000);
            expect(orderData.items[0].finalPrice).toBe(120000);
        });

        it('supports Contract #6 nullable maxDiscountAmount and clearing promotion code (Issue #71 R1 & R2)', async () => {
            // 1. Create a promo with code 'SUMMER50' and cap 50,000đ
            const createRes = await fetch(`${baseUrl}/api/v1/cms/promotions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({
                    code: 'SUMMER50',
                    title: 'Giảm 20% Có Trần và Code',
                    discountType: 'PERCENT',
                    discountValue: 20,
                    minOrderAmount: 30000,
                    maxDiscountAmount: 50000,
                    priority: 5
                })
            });
            expect(createRes.status).toBe(201);
            const created = (await createRes.json() as any).promotion;
            expect(created.code).toBe('SUMMER50');
            expect(Number(created.max_discount_amount)).toBe(50000);

            // 2. Reject maxDiscountAmount: 0 (must be positive or null)
            const rejectZeroRes = await fetch(`${baseUrl}/api/v1/cms/promotions/${created.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({ maxDiscountAmount: 0 })
            });
            expect(rejectZeroRes.status).toBe(400);

            // 3. Clear cap by sending maxDiscountAmount: null (R1 Contract #6)
            const patchCapRes = await fetch(`${baseUrl}/api/v1/cms/promotions/${created.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({ maxDiscountAmount: null })
            });
            expect(patchCapRes.status).toBe(200);
            const patchedCap = (await patchCapRes.json() as any).promotion;
            expect(patchedCap.max_discount_amount).toBeNull();
            // Code was omitted so it must remain intact
            expect(patchedCap.code).toBe('SUMMER50');

            // 4. Clear promo code by sending code: null (R2)
            const patchCodeRes = await fetch(`${baseUrl}/api/v1/cms/promotions/${created.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${shopAAdminToken}`
                },
                body: JSON.stringify({ code: null })
            });
            expect(patchCodeRes.status).toBe(200);
            const patchedCode = (await patchCodeRes.json() as any).promotion;
            expect(patchedCode.code).toBeNull();
            // maxDiscountAmount was omitted so it must remain null
            expect(patchedCode.max_discount_amount).toBeNull();

            // 5. Read back via GET /cms/promotions to verify list semantics
            const listRes = await fetch(`${baseUrl}/api/v1/cms/promotions`, {
                headers: { 'Authorization': `Bearer ${shopAAdminToken}` }
            });
            expect(listRes.status).toBe(200);
            const listData = await listRes.json() as any;
            const fetchedPromo = (listData.promotions || listData).find((p: any) => p.id === created.id);
            expect(fetchedPromo).toBeDefined();
            expect(fetchedPromo.code).toBeNull();
            expect(fetchedPromo.maxDiscountAmount).toBeUndefined(); // listPromotions converts null to undefined

            // Cleanup
            await fetch(`${baseUrl}/api/v1/cms/promotions/${created.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${shopAAdminToken}` }
            });
        });
    });

    // ==========================================
    // 5. SHOP SUSPENSION ENFORCEMENT
    // ==========================================
    describe('Shop Suspension Enforcement', () => {
        it('allows super admin to suspend a shop', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops/${tenantBId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({ status: 'suspended' })
            });

            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.shop.status).toBe('suspended');
        });

        it('blocks guest from joining table session when shop is suspended', async () => {
            const bTableQr = (await query(`SELECT public_qr_id FROM tables WHERE tenant_id = $1 LIMIT 1`, [tenantBId])).rows[0].public_qr_id;

            const res = await fetch(`${baseUrl}/api/v1/public/tables/${bTableQr}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(403);
            const data: any = await res.json();
            expect(data.error).toBe('SHOP_SUSPENDED');
        });

        it('allows super admin to reactivate suspended shop', async () => {
            const res = await fetch(`${baseUrl}/api/v1/admin/shops/${tenantBId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${superAdminToken}`
                },
                body: JSON.stringify({ status: 'active' })
            });

            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.shop.status).toBe('active');
        });
    });
});
