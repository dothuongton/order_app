import { query } from '../../db/pool.js';

export interface DailyShopStat {
    id: string;
    tenantId: string;
    statDate: string;
    confirmedSessionsCount: number;
    grossAmount: number;
    netAmount: number;
    discountAmount: number;
    orderItemsCount: number;
    createdAt: string;
    updatedAt: string;
}

export class ReportingService {
    /**
     * Compute and persist daily stats for a specific tenant and date idempotently.
     * Uses Asia/Ho_Chi_Minh (UTC+7) timezone to align business days consistently.
     */
    static async computeDailyShopStats(tenantId: string, statDate: string): Promise<DailyShopStat> {
        const aggSql = `
            WITH settled_sessions AS (
                SELECT 
                    ts.id as session_id,
                    b.id as bill_id,
                    COALESCE(msc.amount, b.total_amount, 0) as net_amount,
                    COALESCE(
                        (SELECT SUM(bl.subtotal) FROM bill_lines bl WHERE bl.bill_id = b.id),
                        COALESCE(msc.amount, b.total_amount, 0)
                    ) as gross_amount
                FROM table_sessions ts
                JOIN bills b ON b.session_id = ts.id
                LEFT JOIN manual_settlement_confirmations msc ON msc.session_id = ts.id
                WHERE ts.tenant_id = $1
                  AND (b.status = 'CONFIRMED' OR msc.id IS NOT NULL OR ts.close_reason = 'CONFIRMED_SETTLED')
                  AND (COALESCE(msc.confirmed_at, ts.closed_at, ts.updated_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $2::date
                  AND COALESCE(msc.amount, b.total_amount, 0) > 0
            ),
            served_items AS (
                SELECT 
                    COALESCE(SUM(bl.quantity_served), 0) as total_items
                FROM bill_lines bl
                JOIN settled_sessions ss ON ss.bill_id = bl.bill_id
            )
            SELECT 
                COUNT(ss.session_id)::int as confirmed_sessions_count,
                COALESCE(SUM(ss.gross_amount), 0)::bigint as gross_amount,
                COALESCE(SUM(ss.net_amount), 0)::bigint as net_amount,
                GREATEST(0, COALESCE(SUM(ss.gross_amount) - SUM(ss.net_amount), 0))::bigint as discount_amount,
                COALESCE((SELECT total_items FROM served_items), 0)::int as order_items_count
            FROM settled_sessions ss
        `;

        const aggRes = await query(aggSql, [tenantId, statDate]);
        const agg = aggRes.rows[0] || {
            confirmed_sessions_count: 0,
            gross_amount: 0,
            net_amount: 0,
            discount_amount: 0,
            order_items_count: 0
        };

        const upsertSql = `
            INSERT INTO daily_shop_stats (
                tenant_id,
                stat_date,
                confirmed_sessions_count,
                gross_amount,
                net_amount,
                discount_amount,
                order_items_count,
                updated_at
            )
            VALUES ($1, $2::date, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (tenant_id, stat_date)
            DO UPDATE SET
                confirmed_sessions_count = EXCLUDED.confirmed_sessions_count,
                gross_amount = EXCLUDED.gross_amount,
                net_amount = EXCLUDED.net_amount,
                discount_amount = EXCLUDED.discount_amount,
                order_items_count = EXCLUDED.order_items_count,
                updated_at = NOW()
            RETURNING 
                id,
                tenant_id,
                stat_date::text as stat_date,
                confirmed_sessions_count,
                gross_amount::text as gross_amount,
                net_amount::text as net_amount,
                discount_amount::text as discount_amount,
                order_items_count,
                created_at,
                updated_at
        `;

        const upsertRes = await query(upsertSql, [
            tenantId,
            statDate,
            Number(agg.confirmed_sessions_count) || 0,
            Number(agg.gross_amount) || 0,
            Number(agg.net_amount) || 0,
            Number(agg.discount_amount) || 0,
            Number(agg.order_items_count) || 0
        ]);

        const row = upsertRes.rows[0];
        return {
            id: row.id,
            tenantId: row.tenant_id,
            statDate: row.stat_date,
            confirmedSessionsCount: Number(row.confirmed_sessions_count),
            grossAmount: Number(row.gross_amount),
            netAmount: Number(row.net_amount),
            discountAmount: Number(row.discount_amount),
            orderItemsCount: Number(row.order_items_count),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    /**
     * Get daily stats for a tenant within a date range.
     * Supports zero-day lookup: returns empty list or stats within bounded dates.
     */
    static async getDailyShopStats(
        tenantId: string,
        fromDate?: string,
        toDate?: string
    ): Promise<DailyShopStat[]> {
        const conditions: string[] = ['tenant_id = $1'];
        const params: any[] = [tenantId];

        if (fromDate) {
            params.push(fromDate);
            conditions.push(`stat_date >= $${params.length}::date`);
        }

        if (toDate) {
            params.push(toDate);
            conditions.push(`stat_date <= $${params.length}::date`);
        }

        const sql = `
            SELECT 
                id,
                tenant_id,
                stat_date::text as stat_date,
                confirmed_sessions_count,
                gross_amount::text as gross_amount,
                net_amount::text as net_amount,
                discount_amount::text as discount_amount,
                order_items_count,
                created_at,
                updated_at
            FROM daily_shop_stats
            WHERE ${conditions.join(' AND ')}
            ORDER BY stat_date DESC
            LIMIT 365
        `;

        const res = await query(sql, params);
        return res.rows.map(row => ({
            id: row.id,
            tenantId: row.tenant_id,
            statDate: row.stat_date,
            confirmedSessionsCount: Number(row.confirmed_sessions_count),
            grossAmount: Number(row.gross_amount),
            netAmount: Number(row.net_amount),
            discountAmount: Number(row.discount_amount),
            orderItemsCount: Number(row.order_items_count),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
    }
}
