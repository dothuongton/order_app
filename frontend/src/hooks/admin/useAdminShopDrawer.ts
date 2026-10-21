import { useState, useRef, useCallback } from 'react';
import { AdminDrawerContent, ShopDetail, ShopSummary, SystemRole, AuditLogItem } from '../../types/admin.js';

export interface ShopDrawerState {
    isOpen: boolean;
    content: AdminDrawerContent | null;
}

/**
 * Headless state coordinator for admin right drawer.
 * Guarantees request & selection generation tracking to prevent race conditions:
 * - A -> đóng -> B: out-of-order responses do not overwrite current drawer
 * - Rejected prior requests do not corrupt current drawer state
 * - Failed active request retains summary metrics truthfully without fallback to 0
 * - Explicit drawer close invalidates any in-flight detail requests
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
            // Guard: only apply fallback if still the active selection
            if (this.generation === currentGen && this.activeShopId === shop.id) {
                // Retain existing summary content (do not fallback to 0 or lose data)
                if (this.state.content?.type === 'shop-detail' && this.state.content.shop.id === shop.id) {
                    this.setState({
                        content: this.state.content
                    });
                }
            }
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
 */
export function useAdminShopDrawer() {
    const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
    const [drawerContent, setDrawerContent] = useState<AdminDrawerContent | null>(null);

    const drawerGenerationRef = useRef<number>(0);
    const activeShopIdRef = useRef<string | null>(null);

    const openShopDetail = useCallback(
        async (shop: ShopSummary, fetchDetail: (id: string) => Promise<ShopDetail>) => {
            const currentGen = ++drawerGenerationRef.current;
            activeShopIdRef.current = shop.id;

            // 1. Immediately open drawer with summary metrics
            setDrawerContent({ type: 'shop-detail', shop });
            setIsDrawerOpen(true);

            try {
                // 2. Fetch deep metrics asynchronously
                const detail = await fetchDetail(shop.id);

                // 3. Guard: only apply if still viewing this shop and generation
                if (
                    drawerGenerationRef.current === currentGen &&
                    activeShopIdRef.current === shop.id
                ) {
                    setDrawerContent({ type: 'shop-detail', shop: detail });
                }
            } catch {
                // 4. Guard: on error, retain existing summary without fallback to 0
                if (
                    drawerGenerationRef.current === currentGen &&
                    activeShopIdRef.current === shop.id
                ) {
                    setDrawerContent((prev: AdminDrawerContent) => {
                        if (prev?.type === 'shop-detail' && prev.shop.id === shop.id) {
                            return prev;
                        }
                        return { type: 'shop-detail', shop };
                    });
                }
            }
        },
        []
    );

    const openRolePermissions = useCallback((role: SystemRole) => {
        drawerGenerationRef.current++;
        activeShopIdRef.current = null;
        setDrawerContent({ type: 'permissions', role });
        setIsDrawerOpen(true);
    }, []);

    const openShopDetailDirectly = useCallback((detail: ShopDetail) => {
        drawerGenerationRef.current++;
        activeShopIdRef.current = detail.id;
        setDrawerContent({ type: 'shop-detail', shop: detail });
        setIsDrawerOpen(true);
    }, []);

    const openAuditDetail = useCallback((log: AuditLogItem) => {
        drawerGenerationRef.current++;
        activeShopIdRef.current = null;
        setDrawerContent({ type: 'audit-detail', log });
        setIsDrawerOpen(true);
    }, []);

    const closeDrawer = useCallback(() => {
        drawerGenerationRef.current++;
        activeShopIdRef.current = null;
        setIsDrawerOpen(false);
        setDrawerContent(null);
    }, []);

    return {
        isDrawerOpen,
        drawerContent,
        openShopDetail,
        openShopDetailDirectly,
        openRolePermissions,
        openAuditDetail,
        closeDrawer,
        setDrawerContent,
        setIsDrawerOpen
    };
}
