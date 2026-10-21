import { describe, it, expect } from 'vitest';
import { ShopDrawerCoordinator } from '../../../../frontend/src/hooks/admin/useAdminShopDrawer.js';
import { ShopSummary, ShopDetail } from '../../../../frontend/src/types/admin.js';

describe('Admin CMS Shop Drawer Concurrency & Race Condition Guard (Issue #17 Regression)', () => {
    const mockSummaryA: ShopSummary = {
        id: 'shop-alpha',
        name: 'Quán Phở Alpha',
        slug: 'pho-alpha',
        status: 'active',
        tableCount: 12,
        orderCount: 150,
        totalRevenue: 25000000,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
        owner: { id: 'owner-a', fullName: 'Chủ Alpha', email: 'owner-a@example.com' },
        metrics: { tableCount: 12, orderCount: 150, totalRevenue: 25000000 }
    };

    const mockDetailA: ShopDetail = {
        ...mockSummaryA,
        address: '123 Đường Alpha',
        phone: '0901111111',
        description: 'Mô tả quán Alpha',
        metrics: { tableCount: 12, orderCount: 150, totalRevenue: 25000000 }
    };

    const mockSummaryB: ShopSummary = {
        id: 'shop-beta',
        name: 'Quán Cơm Beta',
        slug: 'com-beta',
        status: 'active',
        tableCount: 8,
        orderCount: 95,
        totalRevenue: 18000000,
        createdAt: '2026-01-03T00:00:00Z',
        updatedAt: '2026-01-04T00:00:00Z',
        owner: { id: 'owner-b', fullName: 'Chủ Beta', email: 'owner-b@example.com' },
        metrics: { tableCount: 8, orderCount: 95, totalRevenue: 18000000 }
    };

    const mockDetailB: ShopDetail = {
        ...mockSummaryB,
        address: '456 Đường Beta',
        phone: '0902222222',
        description: 'Mô tả quán Beta',
        metrics: { tableCount: 8, orderCount: 95, totalRevenue: 18000000 }
    };

    it('Scenario 1: A -> đóng -> B with out-of-order response ensures late A does NOT overwrite B', async () => {
        const coordinator = new ShopDrawerCoordinator();

        let resolveA!: (detail: ShopDetail) => void;
        const promiseA = new Promise<ShopDetail>((resolve) => {
            resolveA = resolve;
        });

        // 1. User clicks Shop Alpha -> Drawer opens with Alpha summary immediately
        const opA = coordinator.openShopDetail(mockSummaryA, () => promiseA);
        expect(coordinator.getState().isOpen).toBe(true);
        expect(coordinator.getState().content?.type).toBe('shop-detail');
        expect((coordinator.getState().content as any).shop.id).toBe('shop-alpha');

        // 2. User closes drawer
        coordinator.closeDrawer();
        expect(coordinator.getState().isOpen).toBe(false);
        expect(coordinator.getState().content).toBe(null);

        // 3. User clicks Shop Beta -> Drawer opens with Beta summary
        const opB = coordinator.openShopDetail(mockSummaryB, async () => mockDetailB);
        expect(coordinator.getState().isOpen).toBe(true);
        expect((coordinator.getState().content as any).shop.id).toBe('shop-beta');

        // Wait for Beta fetch to resolve
        await opB;
        expect((coordinator.getState().content as any).shop.id).toBe('shop-beta');
        expect((coordinator.getState().content as any).shop.address).toBe('456 Đường Beta');

        // 4. Late response Alpha finally resolves
        resolveA(mockDetailA);
        await opA;

        // Drawer MUST STILL be Beta, never overwritten by late Alpha
        expect(coordinator.getState().isOpen).toBe(true);
        expect((coordinator.getState().content as any).shop.id).toBe('shop-beta');
        expect((coordinator.getState().content as any).shop.name).toBe('Quán Cơm Beta');
    });

    it('Scenario 2: Late Request A rejection does NOT corrupt current drawer or throw unhandled', async () => {
        const coordinator = new ShopDrawerCoordinator();

        let rejectA!: (err: Error) => void;
        const promiseA = new Promise<ShopDetail>((_, reject) => {
            rejectA = reject;
        });

        // 1. User opens Shop Alpha (slow request)
        const opA = coordinator.openShopDetail(mockSummaryA, () => promiseA);

        // 2. User immediately opens Shop Beta (fast request)
        const opB = coordinator.openShopDetail(mockSummaryB, async () => mockDetailB);
        await opB;

        expect(coordinator.getState().isOpen).toBe(true);
        expect((coordinator.getState().content as any).shop.id).toBe('shop-beta');

        // 3. Request A rejects late
        rejectA(new Error('Network timeout fetching shop-alpha'));
        await opA;

        // Drawer MUST remain Beta, intact without corruption
        expect(coordinator.getState().isOpen).toBe(true);
        expect((coordinator.getState().content as any).shop.id).toBe('shop-beta');
        expect((coordinator.getState().content as any).shop.name).toBe('Quán Cơm Beta');
    });

    it('Scenario 3: Active shop detail request failure retains summary metrics without falling back to 0', async () => {
        const coordinator = new ShopDrawerCoordinator();

        // User opens Shop Alpha, but detail endpoint returns 500 / network error
        const opA = coordinator.openShopDetail(mockSummaryA, async () => {
            throw new Error('500 Internal Server Error');
        });

        // Immediately before fetch completes: summary is displayed
        expect(coordinator.getState().isOpen).toBe(true);
        expect((coordinator.getState().content as any).shop.tableCount).toBe(12);
        expect((coordinator.getState().content as any).shop.totalRevenue).toBe(25000000);

        await opA;

        // After failure: summary metrics MUST be preserved truthfully, NOT fallback to 0 or undefined
        const currentShop = (coordinator.getState().content as any).shop;
        expect(coordinator.getState().isOpen).toBe(true);
        expect(currentShop.id).toBe('shop-alpha');
        expect(currentShop.tableCount).toBe(12);
        expect(currentShop.totalRevenue).toBe(25000000);
        expect(currentShop.metrics).toEqual({
            tableCount: 12,
            orderCount: 150,
            totalRevenue: 25000000
        });
    });

    it('Scenario 4: A -> đóng -> Late response A does NOT reopen drawer or set state', async () => {
        const coordinator = new ShopDrawerCoordinator();

        let resolveA!: (detail: ShopDetail) => void;
        const promiseA = new Promise<ShopDetail>((resolve) => {
            resolveA = resolve;
        });

        const opA = coordinator.openShopDetail(mockSummaryA, () => promiseA);
        expect(coordinator.getState().isOpen).toBe(true);

        // User explicitly closes drawer
        coordinator.closeDrawer();
        expect(coordinator.getState().isOpen).toBe(false);
        expect(coordinator.getState().content).toBe(null);

        // Late response arrives
        resolveA(mockDetailA);
        await opA;

        // Drawer MUST remain closed and content MUST remain null
        expect(coordinator.getState().isOpen).toBe(false);
        expect(coordinator.getState().content).toBe(null);
    });

    it('Scenario 5: Switching to permissions or audit invalidates pending shop detail fetch', async () => {
        const coordinator = new ShopDrawerCoordinator();

        let resolveA!: (detail: ShopDetail) => void;
        const promiseA = new Promise<ShopDetail>((resolve) => {
            resolveA = resolve;
        });

        const opA = coordinator.openShopDetail(mockSummaryA, () => promiseA);

        // User switches to permissions drawer
        coordinator.openRolePermissions({
            id: 'role-1',
            name: 'Quản trị viên',
            code: 'superadmin',
            description: 'Full access',
            userCount: 1,
            color: 'blue',
            permissionGroups: []
        });

        expect(coordinator.getState().content?.type).toBe('permissions');

        // Late response arrives
        resolveA(mockDetailA);
        await opA;

        // Drawer MUST still show permissions, not overwritten by shop detail
        expect(coordinator.getState().content?.type).toBe('permissions');
        expect((coordinator.getState().content as any).role.id).toBe('role-1');
    });
});
