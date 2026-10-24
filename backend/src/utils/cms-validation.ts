import { z } from 'zod';

export const safeUrl = z.string().max(4096).refine(value => {
    if (!value) return true;
    if (/^\/(?!\/)[^\\\s]*$/.test(value)) return true;
    try { const url = new URL(value); return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password; } catch { return false; }
}, 'URL phải là đường dẫn nội bộ hoặc URL hợp lệ');

export const staffThemeSchema = z.object({
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Màu accent phải là mã hex 6 ký tự dạng #rrggbb').transform(v => v.toLowerCase()),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Màu text phải là mã hex 6 ký tự dạng #rrggbb').transform(v => v.toLowerCase())
}).strict();

export const themeSchema = z.object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    fontFamily: z.enum(['Inter', 'Roboto', 'Be Vietnam Pro', 'Nunito', 'system-ui']),
    layout: z.enum(['classic', 'modern_grid', 'compact_list', 'banner_featured']),
    showBanner: z.boolean(), showPromotions: z.boolean(),
    bannerDisplayMode: z.enum(['slide', 'stack']).optional().default('stack'),
    blockOrder: z.array(z.enum(['header', 'banners', 'promotions', 'categories', 'product_grid', 'cart_footer'])).max(6),
    staffTheme: staffThemeSchema.optional(),
    staffDensity: z.enum(['compact', 'comfortable']).optional()
}).strict();
export const bannerSchema = z.object({
    title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(),
    imageUrl: safeUrl, ctaLink: safeUrl.optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(), isActive: z.boolean().optional(),
    startTime: z.string().datetime({ offset: true }).optional(), endTime: z.string().datetime({ offset: true }).optional()
}).strict();
export const promotionSchema = z.object({
    code: z.string().max(100).nullable().optional(), title: z.string().trim().min(1).max(200), description: z.string().max(2000).nullable().optional(),
    discountType: z.enum(['PERCENT', 'FIXED_AMOUNT']), discountValue: z.number().int().positive().max(1000000000),
    minOrderAmount: z.number().int().nonnegative().max(1000000000).optional(),
    maxDiscountAmount: z.number().int().positive().max(1000000000).nullable().optional(),
    maxRedemptions: z.number().int().positive().optional(), priority: z.number().int().min(0).max(10000).optional(),
    isActive: z.boolean().optional(), startTime: z.string().datetime({ offset: true }).optional(), endTime: z.string().datetime({ offset: true }).optional()
}).strict();
