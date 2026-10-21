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

    it('Scenario 6 (Issue #87 & #110 review): Direct-link A -> tab switch -> late success A does NOT reopen drawer', async () => {
        const coordinator = new ShopDrawerCoordinator();

        let resolveA!: (detail: ShopDetail) => void;
        const promiseA = new Promise<ShopDetail>((resolve) => {
            resolveA = resolve;
        });

        // 1. Direct-link opens fetch for Shop Alpha
        const opA = coordinator.openShopDetailById('shop-alpha', () => promiseA);
        expect(coordinator.getState().isOpen).toBe(false);

        // 2. User switches tab (e.g. to Roles or Audit), invalidating selection
        coordinator.invalidateSelection();
        expect(coordinator.getActiveShopId()).toBe(null);

        // 3. Late response for Alpha arrives
        resolveA(mockDetailA);
        const resultA = await opA;

        // Drawer MUST remain closed, result is null (dropped)
        expect(resultA).toBe(null);
        expect(coordinator.getState().isOpen).toBe(false);
        expect(coordinator.getState().content).toBe(null);
    });

    it('Scenario 7 (Issue #87 & #110 review): Direct-link A -> tab switch -> late error A is silently dropped', async () => {
        const coordinator = new ShopDrawerCoordinator();

        let rejectA!: (err: Error) => void;
        const promiseA = new Promise<ShopDetail>((_, reject) => {
            rejectA = reject;
        });

        const opA = coordinator.openShopDetailById('shop-alpha', () => promiseA);

        // User switches tab
        coordinator.invalidateSelection();

        // Late network error for Alpha
        rejectA(new Error('Shop not found or network 500'));
        const resultA = await opA;

        // Error MUST NOT be rethrown to caller, drawer remains closed
        expect(resultA).toBe(null);
        expect(coordinator.getState().isOpen).toBe(false);
        expect(coordinator.getState().content).toBe(null);
    });

    it('Scenario 8 (Issue #87 & #110 review): Direct-link A -> Back/Forward popstate -> late response A does NOT open drawer', async () => {
        const coordinator = new ShopDrawerCoordinator();

        let resolveA!: (detail: ShopDetail) => void;
        const promiseA = new Promise<ShopDetail>((resolve) => {
            resolveA = resolve;
        });

        const opA = coordinator.openShopDetailById('shop-alpha', () => promiseA);

        // Browser Back button clicked (popstate to dashboard without shopId)
        coordinator.invalidateSelection();
        coordinator.closeDrawer();

        resolveA(mockDetailA);
        const resultA = await opA;

        expect(resultA).toBe(null);
        expect(coordinator.getState().isOpen).toBe(false);
        expect(coordinator.getState().content).toBe(null);
    });

    it('Scenario 9 (Issue #87 & #110 review): Direct-link A -> explicit closeDrawer -> late response A does NOT reopen drawer', async () => {
        const coordinator = new ShopDrawerCoordinator();

        let resolveA!: (detail: ShopDetail) => void;
        const promiseA = new Promise<ShopDetail>((resolve) => {
            resolveA = resolve;
        });

        const opA = coordinator.openShopDetailById('shop-alpha', () => promiseA);

        // User hits Escape or Close button
        coordinator.closeDrawer();

        resolveA(mockDetailA);
        const resultA = await opA;

        expect(resultA).toBe(null);
        expect(coordinator.getState().isOpen).toBe(false);
        expect(coordinator.getState().content).toBe(null);
    });

    it('Scenario 10 (Issue #87 & #110 review): Direct-link A -> User selects B from table -> late A does NOT overwrite B', async () => {
        const coordinator = new ShopDrawerCoordinator();

        let resolveA!: (detail: ShopDetail) => void;
        const promiseA = new Promise<ShopDetail>((resolve) => {
            resolveA = resolve;
        });

        let resolveB!: (detail: ShopDetail) => void;
        const promiseB = new Promise<ShopDetail>((resolve) => {
            resolveB = resolve;
        });

        // 1. Direct-link A started
        const opA = coordinator.openShopDetailById('shop-alpha', () => promiseA);

        // 2. User clicks Shop Beta in table before A finishes -> opens Beta summary immediately
        const opB = coordinator.openShopDetail(mockSummaryB, () => promiseB);
        expect(coordinator.getState().isOpen).toBe(true);
        expect((coordinator.getState().content as any).shop.id).toBe('shop-beta');

        // 3. Late A resolves
        resolveA(mockDetailA);
        const resultA = await opA;
        expect(resultA).toBe(null);

        // Drawer MUST STILL be Beta summary
        expect(coordinator.getState().isOpen).toBe(true);
        expect((coordinator.getState().content as any).shop.id).toBe('shop-beta');

        // 4. Beta detail resolves
        resolveB(mockDetailB);
        await opB;

        // Drawer MUST now have full Beta detail
        expect((coordinator.getState().content as any).shop.id).toBe('shop-beta');
        expect((coordinator.getState().content as any).shop.address).toBe('456 Đường Beta');
    });

    it('Scenario 11 (Issue #87 & #110 review): Direct-link A normal resolution while active opens drawer with detail', async () => {
        const coordinator = new ShopDrawerCoordinator();

        const opA = coordinator.openShopDetailById('shop-alpha', async () => mockDetailA);
        const resultA = await opA;

        expect(resultA).toEqual(mockDetailA);
        expect(coordinator.getState().isOpen).toBe(true);
        expect((coordinator.getState().content as any).shop.id).toBe('shop-alpha');
        expect((coordinator.getState().content as any).shop.address).toBe('123 Đường Alpha');
    });

    it('Scenario 12 (Issue #87 & #110 review): Direct-link A failure while active rethrows error for caller handling', async () => {
        const coordinator = new ShopDrawerCoordinator();

        await expect(
            coordinator.openShopDetailById('shop-alpha', async () => {
                throw new Error('404 Shop Not Found');
            })
        ).rejects.toThrow('404 Shop Not Found');

        expect(coordinator.getState().isOpen).toBe(false);
        expect(coordinator.getState().content).toBe(null);
    });

    it('Scenario 13 (PR #110 R2 review): User selects row Beta from table -> summary displayed immediately -> async detail resolves -> updates drawer with phone/address (NOT cancelled by navigation effect)', async () => {
        const coordinator = new ShopDrawerCoordinator();

        let resolveBeta!: (detail: ShopDetail) => void;
        const promiseBeta = new Promise<ShopDetail>((resolve) => {
            resolveBeta = resolve;
        });

        // 1. User clicks Shop Beta row in list table
        const opBeta = coordinator.openShopDetail(mockSummaryB, () => promiseBeta);

        // Immediately: summary is shown in drawer, phone is not yet present
        expect(coordinator.getState().isOpen).toBe(true);
        expect((coordinator.getState().content as any).shop.id).toBe('shop-beta');
        expect((coordinator.getState().content as any).shop.phone).toBe(undefined);

        // 2. Navigation effect updates URL and checks: drawer already has Beta, so it must NOT cancel Beta
        // (In R2 bug, invalidateSelection was called here, which destroyed generation)
        // With fix: cancelRequest with old generation does nothing, and branch 3 returns without invalidating
        const oldGen = 999;
        coordinator.cancelRequest(oldGen);

        expect(coordinator.getActiveShopId()).toBe('shop-beta');

        // 3. Detail Beta arrives with phone and address
        const detailWithPhone: ShopDetail = {
            ...mockDetailB,
            phone: '0987654321',
            address: '456 Đường Beta'
        };
        resolveBeta(detailWithPhone);
        await opBeta;

        // Drawer MUST be updated with full detail including phone and address!
        expect(coordinator.getState().isOpen).toBe(true);
        const activeShop = (coordinator.getState().content as any).shop;
        expect(activeShop.id).toBe('shop-beta');
        expect(activeShop.phone).toBe('0987654321');
        expect(activeShop.address).toBe('456 Đường Beta');
    });

    it('Scenario 14 (PR #110 R2 review): cancelRequest only cancels matching generation, preserving subsequent user action', async () => {
        const coordinator = new ShopDrawerCoordinator();

        let resolveAlpha!: (detail: ShopDetail) => void;
        const promiseAlpha = new Promise<ShopDetail>((resolve) => {
            resolveAlpha = resolve;
        });

        // 1. Direct link starts Alpha (Gen 1)
        const opAlpha = coordinator.openShopDetailById('shop-alpha', () => promiseAlpha);
        const alphaGen = coordinator.getGeneration();
        expect(alphaGen).toBe(1);

        // 2. User clicks Beta from table (Gen 2)
        const opBeta = coordinator.openShopDetail(mockSummaryB, async () => mockDetailB);
        const betaGen = coordinator.getGeneration();
        expect(betaGen).toBe(2);

        // 3. Effect cleanup for Alpha calls cancelRequest(1)
        coordinator.cancelRequest(alphaGen);

        // Coordinator MUST still have Beta active (Gen 2 was not cancelled by Gen 1 cleanup)
        expect(coordinator.getGeneration()).toBe(2);
        expect(coordinator.getActiveShopId()).toBe('shop-beta');

        // 4. Alpha resolves late
        resolveAlpha(mockDetailA);
        const resAlpha = await opAlpha;
        expect(resAlpha).toBe(null);

        // 5. Beta resolves
        await opBeta;

        // Drawer MUST be Beta with full details
        expect(coordinator.getState().isOpen).toBe(true);
        expect((coordinator.getState().content as any).shop.id).toBe('shop-beta');
        expect((coordinator.getState().content as any).shop.address).toBe('456 Đường Beta');
    });
});
