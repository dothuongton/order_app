import { request } from './client.js';
import {
    PlatformStats,
    ShopsListResponse,
    ShopDetail,
    ShopSummary,
    AdminTemplate,
    AuditLogsResponse,
    CreateShopPayload,
    UpdateShopPayload
} from '../types/admin.js';

function getAdminHeaders(): HeadersInit {
    const token = localStorage.getItem('admin_token') || '';
    return {
        Authorization: `Bearer ${token}`
    };
}

export interface FetchShopsParams {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    sortBy?: 'created_at' | 'name' | 'revenue' | 'orders';
    order?: 'asc' | 'desc';
}

export interface FetchAuditLogsParams {
    page?: number;
    limit?: number;
    tenantId?: string;
    action?: string;
}

export const AdminApi = {
    /**
     * Get platform statistics
     */
    async getStats(): Promise<PlatformStats> {
        return request<PlatformStats>('/admin/stats', {
            headers: getAdminHeaders()
        });
    },

    /**
     * List shops with search, status filtering, and pagination
     */
    async getShops(params: FetchShopsParams = {}): Promise<ShopsListResponse> {
        const queryParams = new URLSearchParams();
        if (params.page) queryParams.set('page', params.page.toString());
        if (params.limit) queryParams.set('limit', params.limit.toString());
        if (params.search && params.search.trim()) queryParams.set('search', params.search.trim());
        if (params.status && params.status !== 'all') queryParams.set('status', params.status);
        if (params.sortBy) queryParams.set('sortBy', params.sortBy);
        if (params.order) queryParams.set('order', params.order);

        const qs = queryParams.toString();
        const endpoint = qs ? `/admin/shops?${qs}` : '/admin/shops';
        return request<ShopsListResponse>(endpoint, {
            headers: getAdminHeaders()
        });
    },

    /**
     * Get single shop detail by ID
     */
    async getShopDetail(id: string): Promise<ShopDetail> {
        const res = await request<{ shop: ShopDetail }>(`/admin/shops/${id}`, {
            headers: getAdminHeaders()
        });
        return res.shop;
    },

    /**
     * Create a new shop with initial owner
     */
    async createShop(payload: CreateShopPayload): Promise<{ message: string; shop: ShopSummary }> {
        return request<{ message: string; shop: ShopSummary }>('/admin/shops', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify(payload)
        });
    },

    /**
     * Update shop metadata or lifecycle status
     */
    async updateShop(id: string, payload: UpdateShopPayload): Promise<{ message: string; shop: ShopSummary }> {
        return request<{ message: string; shop: ShopSummary }>(`/admin/shops/${id}`, {
            method: 'PATCH',
            headers: getAdminHeaders(),
            body: JSON.stringify(payload)
        });
    },

    /**
     * Get layout templates list
     */
    async getTemplates(): Promise<AdminTemplate[]> {
        const res = await request<{ templates: AdminTemplate[] }>('/admin/templates', {
            headers: getAdminHeaders()
        });
        return res.templates || [];
    },

    /**
     * Get audit logs with pagination and filters
     */
    async getAuditLogs(params: FetchAuditLogsParams = {}): Promise<AuditLogsResponse> {
        const queryParams = new URLSearchParams();
        if (params.page) queryParams.set('page', params.page.toString());
        if (params.limit) queryParams.set('limit', params.limit.toString());
        if (params.tenantId) queryParams.set('tenantId', params.tenantId);
        if (params.action && params.action.trim()) queryParams.set('action', params.action.trim());

        const qs = queryParams.toString();
        const endpoint = qs ? `/admin/audit-logs?${qs}` : '/admin/audit-logs';
        return request<AuditLogsResponse>(endpoint, {
            headers: getAdminHeaders()
        });
    }
};
