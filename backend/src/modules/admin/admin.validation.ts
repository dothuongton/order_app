import { z } from 'zod';

export const listShopsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    status: z.enum(['all', 'active', 'suspended', 'draft', 'archived']).default('all'),
    sortBy: z.enum(['created_at', 'name', 'revenue', 'orders']).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc'),
    _t: z.any().optional()
});

export type ListShopsQueryInput = z.infer<typeof listShopsQuerySchema>;

export const createShopSchema = z.object({
    name: z.string().trim().min(1, 'Tên quán không được để trống').max(200, 'Tên quán tối đa 200 ký tự'),
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang').max(100, 'Slug tối đa 100 ký tự'),
    phone: z.string().trim().max(30, 'Số điện thoại tối đa 30 ký tự').optional().nullable(),
    address: z.string().trim().max(1000, 'Địa chỉ tối đa 1000 ký tự').optional().nullable(),
    ownerFullName: z.string().trim().min(1, 'Tên chủ quán không được để trống').max(200, 'Tên chủ quán tối đa 200 ký tự'),
    ownerEmail: z.string().trim().email('Email chủ quán không hợp lệ').max(254).transform(v => v.toLowerCase()),
    ownerPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').refine(v => Buffer.byteLength(v) <= 72, 'Mật khẩu tối đa 72 bytes').optional(),
    linkExistingOwner: z.boolean().optional()
}).strict().refine(data => {
    if (!data.linkExistingOwner && !data.ownerPassword) {
        return false;
    }
    return true;
}, {
    message: 'Mật khẩu khởi tạo bắt buộc khi tạo tài khoản chủ quán mới',
    path: ['ownerPassword']
});

export type CreateShopInput = z.infer<typeof createShopSchema>;

export const updateShopSchema = z.object({
    name: z.string().trim().min(1, 'Tên quán không được để trống').max(200, 'Tên quán tối đa 200 ký tự').optional(),
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang').max(100, 'Slug tối đa 100 ký tự').optional(),
    status: z.enum(['draft', 'active', 'suspended', 'archived']).optional(),
    phone: z.string().trim().max(30, 'Số điện thoại tối đa 30 ký tự').optional().nullable(),
    address: z.string().trim().max(1000, 'Địa chỉ tối đa 1000 ký tự').optional().nullable(),
    description: z.string().trim().max(2000, 'Mô tả tối đa 2000 ký tự').optional().nullable()
}).strict();

export type UpdateShopInput = z.infer<typeof updateShopSchema>;

export function isValidCalendarDate(str: string): boolean {
    if (isNaN(Date.parse(str))) return false;
    const datePart = str.split('T')[0];
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    if (!match) return false;
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const d = parseInt(match[3], 10);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const daysInMonth = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= daysInMonth[m - 1];
}

export function parseDateFilter(dateStr: string, isEnd: boolean, timezoneOffsetHours = 7): string {
    const trimmed = dateStr.trim();
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
    if (isDateOnly) {
        const offsetSign = timezoneOffsetHours >= 0 ? '+' : '-';
        const offsetAbs = Math.abs(timezoneOffsetHours);
        const offsetPad = String(offsetAbs).padStart(2, '0');
        const offsetStr = `${offsetSign}${offsetPad}:00`;

        if (isEnd) {
            return new Date(`${trimmed}T23:59:59.999${offsetStr}`).toISOString();
        } else {
            return new Date(`${trimmed}T00:00:00.000${offsetStr}`).toISOString();
        }
    }
    return new Date(trimmed).toISOString();
}

export const listAuditLogsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    tenantId: z.string().uuid('ID quán không hợp lệ').optional(),
    userId: z.string().uuid('ID người dùng không hợp lệ').optional(),
    action: z.string().trim().max(64).optional(),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    _t: z.any().optional()
}).refine(data => {
    // 1. Alias consistency
    if (data.startDate && data.from && data.startDate !== data.from) {
        return false;
    }
    if (data.endDate && data.to && data.endDate !== data.to) {
        return false;
    }

    // 2. Real calendar dates
    const dates = [data.startDate, data.endDate, data.from, data.to].filter(Boolean) as string[];
    for (const d of dates) {
        if (!isValidCalendarDate(d)) {
            return false;
        }
    }

    // 3. Chronological order (from <= to)
    const effectiveFrom = data.startDate || data.from;
    const effectiveTo = data.endDate || data.to;
    if (effectiveFrom && effectiveTo) {
        const fromIso = parseDateFilter(effectiveFrom, false);
        const toIso = parseDateFilter(effectiveTo, true);
        if (fromIso > toIso) {
            return false;
        }
    }

    return true;
}, {
    message: 'Bộ lọc ngày không hợp lệ hoặc khoảng thời gian bắt đầu lớn hơn kết thúc'
});

export type ListAuditLogsQueryInput = z.infer<typeof listAuditLogsQuerySchema>;

export const exportAuditLogsQuerySchema = z.object({
    tenantId: z.string().uuid('ID quán không hợp lệ').optional(),
    userId: z.string().uuid('ID người dùng không hợp lệ').optional(),
    action: z.string().trim().max(64).optional(),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    _t: z.any().optional()
}).refine(data => {
    // 1. Alias consistency
    if (data.startDate && data.from && data.startDate !== data.from) {
        return false;
    }
    if (data.endDate && data.to && data.endDate !== data.to) {
        return false;
    }

    // 2. Real calendar dates
    const dates = [data.startDate, data.endDate, data.from, data.to].filter(Boolean) as string[];
    for (const d of dates) {
        if (!isValidCalendarDate(d)) {
            return false;
        }
    }

    // 3. Chronological order (from <= to)
    const effectiveFrom = data.startDate || data.from;
    const effectiveTo = data.endDate || data.to;
    if (effectiveFrom && effectiveTo) {
        const fromIso = parseDateFilter(effectiveFrom, false);
        const toIso = parseDateFilter(effectiveTo, true);
        if (fromIso > toIso) {
            return false;
        }
    }

    return true;
}, {
    message: 'Bộ lọc ngày không hợp lệ hoặc khoảng thời gian bắt đầu lớn hơn kết thúc'
});

export type ExportAuditLogsQueryInput = z.infer<typeof exportAuditLogsQuerySchema>;

// =========================================================================
// DEEP READ QUERY SCHEMAS (Issue #46)
// =========================================================================

export const getShopTablesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    readiness: z.enum(['READY', 'NEEDS_CLEANING', 'DISABLED']).optional(),
    isEnabled: z.coerce.boolean().optional()
});
export type GetShopTablesQueryInput = z.infer<typeof getShopTablesQuerySchema>;

export const getShopMenuQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    categoryId: z.string().uuid('Mã danh mục không đúng định dạng UUID').optional(),
    isAvailable: z.coerce.boolean().optional()
});
export type GetShopMenuQueryInput = z.infer<typeof getShopMenuQuerySchema>;

export const getShopOrdersQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sessionStatus: z.enum(['OPEN', 'CLOSED']).optional()
});
export type GetShopOrdersQueryInput = z.infer<typeof getShopOrdersQuerySchema>;

export const getShopStaffQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    role: z.enum(['owner', 'manager', 'waiter', 'cashier']).optional()
});
export type GetShopStaffQueryInput = z.infer<typeof getShopStaffQuerySchema>;

export const getShopDailyStatsQuerySchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày bắt đầu YYYY-MM-DD không hợp lệ').optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày kết thúc YYYY-MM-DD không hợp lệ').optional()
});
export type GetShopDailyStatsQueryInput = z.infer<typeof getShopDailyStatsQuerySchema>;

// =========================================================================
// ANALYTICS QUERY SCHEMA (Issue #91)
// =========================================================================

export const getAnalyticsQuerySchema = z.object({
    tenantId: z.string().uuid('Mã quán không đúng định dạng UUID').optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày bắt đầu YYYY-MM-DD không hợp lệ').optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày kết thúc YYYY-MM-DD không hợp lệ').optional()
}).refine(data => {
    if (data.from && !isValidCalendarDate(data.from)) return false;
    if (data.to && !isValidCalendarDate(data.to)) return false;
    if (data.from && data.to && data.from > data.to) return false;
    return true;
}, {
    message: 'Khoảng thời gian không hợp lệ hoặc ngày bắt đầu lớn hơn ngày kết thúc'
});
export type GetAnalyticsQueryInput = z.infer<typeof getAnalyticsQuerySchema>;

// =========================================================================
// TABLE MANAGEMENT SCHEMAS (Issue #94)
// =========================================================================

export const adminCreateTableSchema = z.object({
    table_number: z.string().trim().min(1, 'Số bàn không được để trống').max(64, 'Số bàn tối đa 64 ký tự'),
    capacity: z.coerce.number().int().min(1, 'Sức chứa tối thiểu 1 người').max(100, 'Sức chứa tối đa 100 người').default(4),
    reason: z.string().trim().min(1, 'Lý do hỗ trợ là bắt buộc').max(500, 'Lý do hỗ trợ tối đa 500 ký tự')
});
export type AdminCreateTableInput = z.infer<typeof adminCreateTableSchema>;

export const adminUpdateTableSchema = z.object({
    table_number: z.string().trim().min(1, 'Số bàn không được để trống').max(64, 'Số bàn tối đa 64 ký tự').optional(),
    capacity: z.coerce.number().int().min(1, 'Sức chứa tối thiểu 1 người').max(100, 'Sức chứa tối đa 100 người').optional(),
    is_enabled: z.boolean().optional(),
    expected_updated_at: z.string().optional(),
    reason: z.string().trim().min(1, 'Lý do hỗ trợ là bắt buộc').max(500, 'Lý do hỗ trợ tối đa 500 ký tự')
});
export type AdminUpdateTableInput = z.infer<typeof adminUpdateTableSchema>;

export const adminDeleteTableSchema = z.object({
    reason: z.string().trim().min(1, 'Lý do hỗ trợ là bắt buộc').max(500, 'Lý do hỗ trợ tối đa 500 ký tự')
});
export type AdminDeleteTableInput = z.infer<typeof adminDeleteTableSchema>;
