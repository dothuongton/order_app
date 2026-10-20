export type ShopStatus = 'draft' | 'active' | 'suspended' | 'archived';

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
