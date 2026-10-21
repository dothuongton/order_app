import { useState, useRef, useEffect, useCallback } from 'react';
import { AdminDrawerContent, ShopDetail, ShopSummary, SystemRole, AuditLogItem } from '../../types/admin.js';

export interface ShopDrawerState {
    isOpen: boolean;
    content: AdminDrawerContent | null;
}

/**
 * Headless state coordinator for admin right drawer and deep-link selection.
 * Guarantees request & selection generation tracking across:
 * - Direct-link navigation (?tab=shops&shopId=A)
 * - Tab switching (?tab=roles, ?tab=audit, etc.)
 * - Browser history navigation (Back / Forward popstate)
 * - Explicit drawer dismissal (Escape key, close button, backdrop)
 * - Table row selection (immediate summary presentation)
 * - Out-of-order network responses & late failures
 */
export class ShopDrawerCoordinator {
    private generation = 0;
    private activeShopId: string | null = null;
    private state: ShopDrawerState = {
        isOpen: false,
        content: null
    };
    private listeners = new Set<(state: ShopDrawerState) => void>();

    getState(): ShopDrawerState {
        return this.state;
    }

    getGeneration(): number {
        return this.generation;
    }

    getActiveShopId(): string | null {
        return this.activeShopId;
    }

    subscribe(listener: (state: ShopDrawerState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private setState(next: Partial<ShopDrawerState>) {
        this.state = { ...this.state, ...next };
        this.listeners.forEach((listener) => listener(this.state));
    }

    /**
     * Invalidate any in-flight selection or detail requests unconditionally.
     * Called on tab change, popstate, selection reset, or drawer close.
     */
    invalidateSelection(): number {
        this.activeShopId = null;
        return ++this.generation;
    }

    /**
     * Cancel / invalidate only if the coordinator is still on the specified generation.
     * Prevents an unmounting or cleaning up effect from destroying a subsequent request
     * registered by another user action or table click.
     */
    cancelRequest(generation: number): void {
        if (this.generation === generation) {
            this.activeShopId = null;
            this.generation++;
        }
    }

    /**
     * Open shop detail drawer immediately with summary, then fetch deep metrics asynchronously.
     * (Fix #105: Generation & active shop guards ensure late/stale responses do not corrupt state).
     */
    async openShopDetail(
        shop: ShopSummary,
        fetchDetail: (id: string) => Promise<ShopDetail>
    ): Promise<void> {
        const currentGen = ++this.generation;
        this.activeShopId = shop.id;

        // Open immediately with summary so UI is responsive
        this.setState({
            isOpen: true,
            content: { type: 'shop-detail', shop }
        });

        try {
            const detail = await fetchDetail(shop.id);
            // Guard: only apply if this request matches active shop and generation
            if (this.generation === currentGen && this.activeShopId === shop.id) {
                this.setState({
                    content: { type: 'shop-detail', shop: detail }
                });
            }
        } catch {
            // Guard: on error, retain existing summary without fallback to 0
            if (this.generation === currentGen && this.activeShopId === shop.id) {
                if (this.state.content?.type === 'shop-detail' && this.state.content.shop.id === shop.id) {
                    this.setState({
                        content: this.state.content
                    });
                }
            }
        }
    }

    /**
     * Deep-link shop detail fetch by ID without initial summary.
     * Guarantees that if the user leaves the tab, closes drawer, navigates back/forward,
     * or selects another shop before this resolves, the late response is dropped and
     * will NOT open the drawer or alter navigation.
     * Throws error only if the request failed WHILE still the active selection.
     */
    async openShopDetailById(
        shopId: string,
        fetchDetail: (id: string) => Promise<ShopDetail>
    ): Promise<ShopDetail | null> {
        const currentGen = ++this.generation;
        this.activeShopId = shopId;

        try {
            const detail = await fetchDetail(shopId);
            if (this.generation === currentGen && this.activeShopId === shopId) {
                this.setState({
                    isOpen: true,
                    content: { type: 'shop-detail', shop: detail }
                });
                return detail;
            }
            return null;
        } catch (err) {
            if (this.generation === currentGen && this.activeShopId === shopId) {
                throw err;
            }
            return null;
        }
    }

    openRolePermissions(role: SystemRole): void {
        this.generation++;
        this.activeShopId = null;
        this.setState({
            isOpen: true,
            content: { type: 'permissions', role }
        });
    }

    openShopDetailDirectly(detail: ShopDetail): void {
        this.generation++;
        this.activeShopId = detail.id;
        this.setState({
            isOpen: true,
            content: { type: 'shop-detail', shop: detail }
        });
    }

    openAuditDetail(log: AuditLogItem): void {
        this.generation++;
        this.activeShopId = null;
        this.setState({
            isOpen: true,
            content: { type: 'audit-detail', log }
        });
    }

    closeDrawer(): void {
        this.generation++;
        this.activeShopId = null;
        this.setState({
            isOpen: false,
            content: null
        });
    }

    setContent(content: AdminDrawerContent | null): void {
        this.setState({ content });
    }
}

/**
 * React hook integrating ShopDrawerCoordinator into React lifecycle.
 * Single source of truth guaranteeing generation isolation and deep-link resilience.
 */
export function useAdminShopDrawer() {
    const coordinatorRef = useRef<ShopDrawerCoordinator | null>(null);
    if (!coordinatorRef.current) {
        coordinatorRef.current = new ShopDrawerCoordinator();
    }
    const coordinator = coordinatorRef.current;

    const [drawerState, setDrawerState] = useState<ShopDrawerState>(() => coordinator.getState());

    useEffect(() => {
        return coordinator.subscribe((nextState) => {
            setDrawerState(nextState);
        });
    }, [coordinator]);

    const openShopDetail = useCallback(
        (shop: ShopSummary, fetchDetail: (id: string) => Promise<ShopDetail>) => {
            return coordinator.openShopDetail(shop, fetchDetail);
        },
        [coordinator]
    );

    const openShopDetailById = useCallback(
        (shopId: string, fetchDetail: (id: string) => Promise<ShopDetail>) => {
            return coordinator.openShopDetailById(shopId, fetchDetail);
        },
        [coordinator]
    );

    const openShopDetailDirectly = useCallback(
        (detail: ShopDetail) => {
            coordinator.openShopDetailDirectly(detail);
        },
        [coordinator]
    );

    const openRolePermissions = useCallback(
        (role: SystemRole) => {
            coordinator.openRolePermissions(role);
        },
        [coordinator]
    );

    const openAuditDetail = useCallback(
        (log: AuditLogItem) => {
            coordinator.openAuditDetail(log);
        },
        [coordinator]
    );

    const closeDrawer = useCallback(() => {
        coordinator.closeDrawer();
    }, [coordinator]);

    const invalidateSelection = useCallback(() => {
        return coordinator.invalidateSelection();
    }, [coordinator]);

    const cancelRequest = useCallback(
        (generation: number) => {
            coordinator.cancelRequest(generation);
        },
        [coordinator]
    );

    const getGeneration = useCallback(() => {
        return coordinator.getGeneration();
    }, [coordinator]);

    const setIsDrawerOpen = useCallback(
        (isOpen: boolean) => {
            if (!isOpen) {
                coordinator.closeDrawer();
            }
        },
        [coordinator]
    );

    const setDrawerContent = useCallback(
        (content: AdminDrawerContent | null) => {
            coordinator.setContent(content);
        },
        [coordinator]
    );

    return {
        isDrawerOpen: drawerState.isOpen,
        drawerContent: drawerState.content,
        openShopDetail,
        openShopDetailById,
        openShopDetailDirectly,
        openRolePermissions,
        openAuditDetail,
        closeDrawer,
        invalidateSelection,
        cancelRequest,
        getGeneration,
        setDrawerContent,
        setIsDrawerOpen,
        coordinator
    };
}
