export interface CmsTemplate {
    id: string;
    name: string;
    description: string;
    thumbnailUrl?: string;
    defaultBlocks: string[];
    editableFields: string[];
    isActive: boolean;
}

export interface CmsThemeConfig {
    primaryColor: string;
    fontFamily: string;
    layout: 'classic' | 'modern_grid' | 'compact_list';
    showBanner: boolean;
    showPromotions: boolean;
    bannerDisplayMode?: 'slide' | 'stack';
    blockOrder: string[];
}

export interface CmsDraft {
    id?: string;
    tenantId?: string;
    templateId: string;
    themeConfig: CmsThemeConfig;
    contentConfig: {
        bannerIds?: string[];
        featuredItemIds?: string[];
    };
    version: number;
    updatedAt?: string;
}

export interface CmsPublishedVersion {
    id: string;
    version: number;
    templateId: string;
    themeConfig: CmsThemeConfig;
    changelog: string;
    publishedAt: string;
    publishedByName?: string;
}

export interface Banner {
    id: string;
    title: string;
    description?: string;
    imageUrl: string;
    ctaLink?: string;
    sortOrder: number;
    isActive: boolean;
    startTime?: string;
    endTime?: string;
}

export interface Promotion {
    id: string;
    code?: string;
    title: string;
    description?: string;
    discountType: 'PERCENT' | 'FIXED_AMOUNT';
    discountValue: number;
    minOrderAmount: number;
    maxDiscountAmount?: number;
    maxRedemptions?: number;
    currentRedemptions: number;
    priority: number;
    isActive: boolean;
    startTime?: string;
    endTime?: string;
}

export interface ShopDetail {
    id: string;
    name: string;
    slug: string;
    status: 'draft' | 'active' | 'suspended' | 'archived';
    phone?: string;
    address?: string;
    description?: string;
    logoUrl?: string;
    coverUrl?: string;
    openingHours?: string;
    activeTemplateId: string;
    activeThemeConfig: CmsThemeConfig;
    activePublishedVersion: number;
    createdAt: string;
    tableCount?: number;
    orderCount?: number;
    totalRevenue?: number;
    owner?: {
        id: string;
        email: string;
        fullName: string;
    };
}
