import { request } from './client.js';
import {
    PlatformStats,
    ShopsListResponse,
    ShopDetail,
    ShopSummary,
    AdminTemplate,
    AuditLogsResponse,
    CreateShopPayload,
    UpdateShopPayload,
    AdminTablesResponse,
    AdminMenuResponse,
    AdminOrdersResponse,
    AdminStaffResponse,
    AdminCmsResponse,
    AdminDailyStatsResponse,
    AdminAnalyticsResponse
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
    userId?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
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
    async getShops(params: FetchShopsParams = {}, signal?: AbortSignal): Promise<ShopsListResponse> {
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
            headers: getAdminHeaders(),
            signal
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
        if (params.userId) queryParams.set('userId', params.userId);
        if (params.action && params.action.trim()) queryParams.set('action', params.action.trim());
        if (params.startDate) queryParams.set('startDate', params.startDate);
        if (params.endDate) queryParams.set('endDate', params.endDate);

        const qs = queryParams.toString();
        const endpoint = qs ? `/admin/audit-logs?${qs}` : '/admin/audit-logs';
        return request<AuditLogsResponse>(endpoint, {
            headers: getAdminHeaders()
        });
    },

    /**
     * Export audit logs as CSV (bounded limit <= 1,000 rows)
     */
    async exportAuditLogsCsv(params: FetchAuditLogsParams = {}): Promise<Blob> {
        const queryParams = new URLSearchParams();
        if (params.tenantId) queryParams.set('tenantId', params.tenantId);
        if (params.userId) queryParams.set('userId', params.userId);
        if (params.action && params.action.trim()) queryParams.set('action', params.action.trim());
        if (params.startDate) queryParams.set('startDate', params.startDate);
        if (params.endDate) queryParams.set('endDate', params.endDate);
        queryParams.set('_t', Date.now().toString());

        const apiBase = (import.meta as any).env?.VITE_API_URL || '';
        const endpoint = `/admin/audit-logs/export?${queryParams.toString()}`;
        const fullUrl = endpoint.startsWith('http') ? endpoint : `${apiBase}/api/v1${endpoint}`;

        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                ...getAdminHeaders(),
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            cache: 'no-store',
            credentials: 'include'
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || data.error || `Tải dữ liệu thất bại (${response.status})`);
        }

        return await response.blob();
    },

    /**
     * Deep read of shop tables (Issue #46)
     */
    async getShopTables(shopId: string, params: { page?: number; limit?: number; status?: string } = {}): Promise<AdminTablesResponse> {
        const queryParams = new URLSearchParams();
        if (params.page) queryParams.set('page', params.page.toString());
        if (params.limit) queryParams.set('limit', params.limit.toString());
        if (params.status) queryParams.set('status', params.status);
        const query = queryParams.toString();
        return request<AdminTablesResponse>(`/admin/shops/${shopId}/tables${query ? `?${query}` : ''}`, {
            headers: getAdminHeaders()
        });
    },

    /**
     * Deep read of shop menu (Issue #46)
     */
    async getShopMenu(shopId: string, params: { page?: number; limit?: number; categoryId?: string; isAvailable?: boolean } = {}): Promise<AdminMenuResponse> {
        const queryParams = new URLSearchParams();
        if (params.page) queryParams.set('page', params.page.toString());
        if (params.limit) queryParams.set('limit', params.limit.toString());
        if (params.categoryId) queryParams.set('categoryId', params.categoryId);
        if (params.isAvailable !== undefined) queryParams.set('isAvailable', params.isAvailable.toString());
        const query = queryParams.toString();
        return request<AdminMenuResponse>(`/admin/shops/${shopId}/menu${query ? `?${query}` : ''}`, {
            headers: getAdminHeaders()
        });
    },

    /**
     * Deep read of shop orders (Issue #46)
     */
    async getShopOrders(shopId: string, params: { page?: number; limit?: number; status?: string } = {}): Promise<AdminOrdersResponse> {
        const queryParams = new URLSearchParams();
        if (params.page) queryParams.set('page', params.page.toString());
        if (params.limit) queryParams.set('limit', params.limit.toString());
        if (params.status) queryParams.set('status', params.status);
        const query = queryParams.toString();
        return request<AdminOrdersResponse>(`/admin/shops/${shopId}/orders${query ? `?${query}` : ''}`, {
            headers: getAdminHeaders()
        });
    },

    /**
     * Deep read of shop staff (Issue #46)
     */
    async getShopStaff(shopId: string, params: { page?: number; limit?: number; role?: string } = {}): Promise<AdminStaffResponse> {
        const queryParams = new URLSearchParams();
        if (params.page) queryParams.set('page', params.page.toString());
        if (params.limit) queryParams.set('limit', params.limit.toString());
        if (params.role) queryParams.set('role', params.role);
        const query = queryParams.toString();
        return request<AdminStaffResponse>(`/admin/shops/${shopId}/staff${query ? `?${query}` : ''}`, {
            headers: getAdminHeaders()
        });
    },

    /**
     * Deep read of shop CMS configuration (Issue #46)
     */
    async getShopCms(shopId: string): Promise<AdminCmsResponse> {
        return request<AdminCmsResponse>(`/admin/shops/${shopId}/cms`, {
            headers: getAdminHeaders()
        });
    },

    /**
     * Deep read of shop daily business stats (Issue #46, Contract #45)
     */
    async getShopDailyStats(shopId: string, params: { from?: string; to?: string } = {}): Promise<AdminDailyStatsResponse> {
        const queryParams = new URLSearchParams();
        if (params.from) queryParams.set('from', params.from);
        if (params.to) queryParams.set('to', params.to);
        const query = queryParams.toString();
        return request<AdminDailyStatsResponse>(`/admin/shops/${shopId}/daily-stats${query ? `?${query}` : ''}`, {
            headers: getAdminHeaders()
        });
    },

    /**
     * Get platform and shop-scoped analytics (Issue #91)
     */
    async getAnalytics(params: { tenantId?: string; from?: string; to?: string } = {}): Promise<AdminAnalyticsResponse> {
        const queryParams = new URLSearchParams();
        if (params.tenantId) queryParams.set('tenantId', params.tenantId);
        if (params.from) queryParams.set('from', params.from);
        if (params.to) queryParams.set('to', params.to);
        const query = queryParams.toString();
        return request<AdminAnalyticsResponse>(`/admin/analytics${query ? `?${query}` : ''}`, {
            headers: getAdminHeaders()
        });
    }
};
