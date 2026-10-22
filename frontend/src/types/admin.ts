export type ShopStatus = 'draft' | 'active' | 'suspended' | 'archived';
export type AdminTab = 'dashboard' | 'shops' | 'roles' | 'audit' | 'analytics';

export interface PlatformStats {
    totalShops: number;
    activeShops: number;
    suspendedShops: number;
    archivedShops: number;
    totalRevenue: number;
    totalSettlements: number;
    totalOrders: number;
}

export interface ShopOwner {
    id: string;
    email: string;
    fullName: string;
    phone?: string | null;
}

export interface ShopMetrics {
    tableCount: number;
    orderCount: number;
    totalRevenue: number;
}

export interface ShopSummary {
    id: string;
    name: string;
    slug: string;
    status: ShopStatus;
    phone?: string | null;
    address?: string | null;
    activeTemplateId: string;
    activePublishedVersion: number;
    createdAt: string;
    updatedAt?: string;
    owner: ShopOwner | null;
    tableCount: number;
    orderCount: number;
    totalRevenue: number;
    metrics?: ShopMetrics;
}

export interface ShopDetail extends ShopSummary {
    description?: string | null;
    metrics: ShopMetrics;
}

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface ShopsListResponse {
    shops: ShopSummary[];
    pagination: PaginationMeta;
}

export interface AuditLogItem {
    id: string;
    tenantId: string;
    tenantName?: string | null;
    userId: string | null;
    userName?: string | null;
    userEmail?: string | null;
    action: string;
    resourceType: string;
    resourceId: string;
    details: any;
    createdAt: string;
}

export interface AuditLogsResponse {
    logs: AuditLogItem[];
    pagination: PaginationMeta;
}

export interface AdminTemplate {
    id: string;
    name: string;
    description?: string | null;
    thumbnailUrl?: string | null;
    defaultBlocks: string[];
    editableFields: string[];
    isActive: boolean;
    createdAt: string;
}

export interface CreateShopPayload {
    name: string;
    slug: string;
    phone?: string | null;
    address?: string | null;
    ownerFullName: string;
    ownerEmail: string;
    ownerPassword?: string;
    linkExistingOwner?: boolean;
}

export interface UpdateShopPayload {
    name?: string;
    slug?: string;
    status?: ShopStatus;
    phone?: string | null;
    address?: string | null;
    description?: string | null;
}


export interface PermissionItem {
    id: string;
    label: string;
    description?: string;
    enabled: boolean;
}

export interface PermissionGroup {
    id: string;
    title: string;
    icon: string;
    permissions: PermissionItem[];
}

export interface SystemRole {
    id: string;
    name: string;
    code: 'superadmin' | 'admin' | 'cashier' | 'waiter';
    description: string;
    userCount: number;
    color: string;
    permissionGroups: PermissionGroup[];
}

export type AdminDrawerContent =
    | { type: 'permissions'; role: SystemRole }
    | { type: 'shop-detail'; shop: ShopDetail | ShopSummary }
    | { type: 'audit-detail'; log: AuditLogItem }
    | null;

// =========================================================================
// DEEP READ TYPES (Issue #46 [ADMINREAD])
// =========================================================================

export interface AdminTableItem {
    id: string;
    tenant_id: string;
    table_number: string;
    public_qr_id: string;
    capacity: number;
    readiness: string;
    is_enabled: boolean;
    created_at: string;
    updated_at?: string;
}

export interface AdminTablesResponse {
    tables: AdminTableItem[];
    pagination: PaginationMeta;
}

export interface AdminMenuItem {
    id: string;
    tenant_id: string;
    category_id: string;
    category_name?: string | null;
    name: string;
    description?: string | null;
    price: number;
    is_available: boolean;
    image_url?: string | null;
    created_at: string;
    updated_at?: string;
}

export interface AdminCategoryItem {
    id: string;
    tenant_id: string;
    name: string;
    sort_order: number;
    created_at: string;
}

export interface AdminMenuResponse {
    categories: AdminCategoryItem[];
    items: AdminMenuItem[];
    pagination: PaginationMeta;
}

export interface AdminOrderItem {
    id: string;
    tenant_id: string;
    table_id?: string | null;
    table_number?: string | null;
    session_id?: string | null;
    status: string;
    total_amount: number;
    created_at: string;
    updated_at?: string;
    item_count: number;
}

export interface AdminOrdersResponse {
    orders: AdminOrderItem[];
    pagination: PaginationMeta;
}

export interface AdminStaffItem {
    membership_id: string;
    tenant_id: string;
    role: string;
    joined_at: string;
    user_id: string;
    email: string;
    full_name: string;
    phone?: string | null;
}

export interface AdminStaffResponse {
    staff: AdminStaffItem[];
    pagination: PaginationMeta;
}

export interface AdminCmsResponse {
    draft: {
        id: string;
        tenant_id: string;
        template_id: string;
        theme_config: any;
        updated_at: string;
    } | null;
    publishedVersions: Array<{
        id: string;
        tenant_id: string;
        version: number;
        template_id: string;
        theme_config: any;
        change_note?: string | null;
        created_at: string;
    }>;
}

export interface AdminDailyStatsResponse {
    dailyStats: Array<{
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
    }>;
}

// =========================================================================
// ANALYTICS TYPES (Issue #91)
// =========================================================================

export interface AdminAnalyticsSummary {
    totalConfirmedSessions: number;
    totalGrossAmount: number;
    totalNetAmount: number;
    totalDiscountAmount: number;
    totalOrderItems: number;
}

export interface AdminDailyBreakdownItem {
    date: string;
    confirmedSessionsCount: number;
    grossAmount: number;
    netAmount: number;
    discountAmount: number;
    orderItemsCount: number;
}

export interface AdminTopShopItem {
    tenantId: string;
    shopName: string;
    shopSlug: string;
    netRevenue: number;
    confirmedSessions: number;
}

export interface AdminAnalyticsResponse {
    from: string | null;
    to: string | null;
    tenantId: string | null;
    summary: AdminAnalyticsSummary;
    dailyBreakdown: AdminDailyBreakdownItem[];
    topShops: AdminTopShopItem[];
}

// =========================================================================
// TABLE MANAGEMENT TYPES (Issue #94)
// =========================================================================

export interface AdminCreateTablePayload {
    table_number: string;
    capacity?: number;
    reason: string;
}

export interface AdminUpdateTablePayload {
    table_number?: string;
    capacity?: number;
    is_enabled?: boolean;
    expected_updated_at?: string;
    reason: string;
}

export interface AdminDeleteTablePayload {
    reason: string;
}

export interface AdminTableQrResponse {
    tableId: string;
    tableNumber: string;
    publicQrId: string;
    qrUrl: string;
    dataUrl: string;
}
