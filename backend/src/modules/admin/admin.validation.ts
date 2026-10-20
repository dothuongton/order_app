import { z } from 'zod';

export const listShopsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    status: z.enum(['all', 'active', 'suspended', 'draft', 'archived']).default('all'),
    sortBy: z.enum(['created_at', 'name', 'revenue', 'orders']).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc')
}).strict();

export type ListShopsQueryInput = z.infer<typeof listShopsQuerySchema>;

export const createShopSchema = z.object({
    name: z.string().trim().min(1, 'Tên quán không được để trống').max(200, 'Tên quán tối đa 200 ký tự'),
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang').max(100, 'Slug tối đa 100 ký tự'),
    phone: z.string().trim().max(30, 'Số điện thoại tối đa 30 ký tự').optional().nullable(),
    address: z.string().trim().max(1000, 'Địa chỉ tối đa 1000 ký tự').optional().nullable(),
    ownerFullName: z.string().trim().min(1, 'Tên chủ quán không được để trống').max(200, 'Tên chủ quán tối đa 200 ký tự'),
    ownerEmail: z.string().trim().email('Email chủ quán không hợp lệ').max(254).transform(v => v.toLowerCase()),
    ownerPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').refine(v => Buffer.byteLength(v) <= 72, 'Mật khẩu tối đa 72 bytes')
}).strict();

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

export const listAuditLogsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    tenantId: z.string().uuid('ID quán không hợp lệ').optional(),
    action: z.string().trim().max(64).optional()
}).strict();

export type ListAuditLogsQueryInput = z.infer<typeof listAuditLogsQuerySchema>;
