import { useState, useEffect, useCallback } from 'react';
import { AdminTab } from '../../types/admin.js';

export const ALLOWED_ADMIN_TABS: AdminTab[] = ['dashboard', 'shops', 'roles', 'audit', 'analytics'];
export const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface UseAdminNavigationReturn {
    activeTab: AdminTab;
    selectedShopId: string | null;
    setActiveTab: (tab: AdminTab, options?: { replace?: boolean }) => void;
    openShopDetail: (shopId: string) => void;
    closeShopDetail: () => void;
}

export function parseAdminUrlParams(): { tab: AdminTab; shopId: string | null } {
    try {
        if (typeof window === 'undefined') {
            return { tab: 'dashboard', shopId: null };
        }
        const params = new URLSearchParams(window.location.search);
        const rawTab = params.get('tab') as AdminTab;
        const validTab = ALLOWED_ADMIN_TABS.includes(rawTab) ? rawTab : 'dashboard';

        const rawShopId = params.get('shopId');
        const validShopId = rawShopId && UUID_V4_REGEX.test(rawShopId) ? rawShopId : null;

        return {
            tab: validTab,
            shopId: validShopId
        };
    } catch {
        return { tab: 'dashboard', shopId: null };
    }
}

export function useAdminNavigation(): UseAdminNavigationReturn {
    const initial = parseAdminUrlParams();
    const [activeTab, setActiveTabState] = useState<AdminTab>(initial.tab);
    const [selectedShopId, setSelectedShopId] = useState<string | null>(initial.shopId);

    // Sync browser URL search params safely
    const updateUrl = useCallback((tab: AdminTab, shopId: string | null, replace: boolean = false) => {
        try {
            if (typeof window === 'undefined') return;

            const url = new URL(window.location.href);
            if (tab === 'dashboard') {
                url.searchParams.delete('tab');
            } else {
                url.searchParams.set('tab', tab);
            }

            if (shopId && UUID_V4_REGEX.test(shopId)) {
                url.searchParams.set('shopId', shopId);
            } else {
                url.searchParams.delete('shopId');
            }

            const newUrl = url.pathname + url.search;
            const currentUrl = window.location.pathname + window.location.search;

            if (newUrl !== currentUrl) {
                if (replace) {
                    window.history.replaceState({ tab, shopId }, '', newUrl);
                } else {
                    window.history.pushState({ tab, shopId }, '', newUrl);
                }
            }
        } catch {
            // Gracefully ignore history errors in embedded frames
        }
    }, []);

    // Switch tab
    const setActiveTab = useCallback((newTab: AdminTab, options?: { replace?: boolean }) => {
        const validTab = ALLOWED_ADMIN_TABS.includes(newTab) ? newTab : 'dashboard';
        setActiveTabState(validTab);
        setSelectedShopId(null);
        updateUrl(validTab, null, options?.replace ?? false);
    }, [updateUrl]);

    // Open shop detail with deep link
    const openShopDetail = useCallback((shopId: string) => {
        if (!UUID_V4_REGEX.test(shopId)) return;
        setActiveTabState('shops');
        setSelectedShopId(shopId);
        updateUrl('shops', shopId, false);
    }, [updateUrl]);

    // Close shop detail drawer
    const closeShopDetail = useCallback(() => {
        setSelectedShopId(null);
        updateUrl(activeTab, null, true);
    }, [activeTab, updateUrl]);

    // Handle browser Back / Forward events (popstate)
    useEffect(() => {
        const handlePopState = () => {
            const parsed = parseAdminUrlParams();
            setActiveTabState(parsed.tab);
            setSelectedShopId(parsed.shopId);
        };

        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, []);

    return {
        activeTab,
        selectedShopId,
        setActiveTab,
        openShopDetail,
        closeShopDetail
    };
}
