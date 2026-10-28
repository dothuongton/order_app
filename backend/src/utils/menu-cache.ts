import { config } from '../config/index.js';

interface CatalogData {
    categories: any[];
    menuItems: any[];
    banners: any[];
    promotions: any[];
}

interface CatalogCacheEntry {
    data: CatalogData;
    expiresAt: number;
}

const catalogCache = new Map<string, CatalogCacheEntry>();

// In test environment, keep TTL short (500ms) or allow clearTenantMenuCatalogCache to clear instantly.
// In production, 15 seconds saves massive repeated database queries when guests scan QR codes simultaneously.
const DEFAULT_CATALOG_TTL_MS = config.nodeEnv === 'test' ? 500 : 15000;

export function getCachedTenantCatalog(tenantId: string): CatalogData | null {
    const entry = catalogCache.get(tenantId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        catalogCache.delete(tenantId);
        return null;
    }
    return entry.data;
}

export function setCachedTenantCatalog(tenantId: string, data: CatalogData, ttlMs: number = DEFAULT_CATALOG_TTL_MS): void {
    catalogCache.set(tenantId, {
        data,
        expiresAt: Date.now() + ttlMs
    });
}

export function clearTenantMenuCatalogCache(tenantId?: string): void {
    if (tenantId) {
        catalogCache.delete(tenantId);
    } else {
        catalogCache.clear();
    }
}
