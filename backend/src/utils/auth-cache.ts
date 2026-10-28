import { config } from '../config/index.js';

interface CacheEntry {
    row: any;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

let isCacheEnabledInTest = false;

export function setAuthCacheEnabledForTest(enabled: boolean) {
    isCacheEnabledInTest = enabled;
    if (!enabled) cache.clear();
}

const DEFAULT_TTL_MS = 5000;

export function getCachedStaffAuth(tokenHash: string, tenantId: string): any | null {
    if (config.nodeEnv === 'test' && !isCacheEnabledInTest) {
        return null;
    }
    const key = `${tokenHash}:${tenantId}`;
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.row;
}

export function setCachedStaffAuth(tokenHash: string, tenantId: string, row: any, ttlMs: number = DEFAULT_TTL_MS): void {
    if (config.nodeEnv === 'test' && !isCacheEnabledInTest) {
        return;
    }
    const key = `${tokenHash}:${tenantId}`;
    cache.set(key, {
        row,
        expiresAt: Date.now() + ttlMs
    });
}

export function invalidateStaffAuth(tokenHash?: string): void {
    if (!tokenHash) {
        cache.clear();
        return;
    }
    for (const key of cache.keys()) {
        if (key.startsWith(tokenHash)) {
            cache.delete(key);
        }
    }
}
