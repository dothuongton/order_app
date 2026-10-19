import { z } from 'zod';

export function validate<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
    const result = schema.safeParse(value);
    if (!result.success) {
        throw { status: 400, code: 'INVALID_INPUT', message: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
    }
    return result.data;
}
export const orderInputSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(128),
    items: z.array(z.object({
        menuItemId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
        variantIds: z.array(z.string().uuid()).optional(),
        quantity: z.number().int().min(1).max(999),
        note: z.string().max(1000).optional()
    })).min(1).max(100)
});
export function requestedQuantity(value: unknown, available: number): number {
    const qty = value === undefined ? available : validate(z.number().int().positive().max(999), value);
    if (qty > available) throw { status: 400, code: 'INVALID_QUANTITY', message: 'Số lượng vượt quá số món có thể xử lý' };
    return qty;
}
