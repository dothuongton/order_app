import { describe, it, expect, vi } from 'vitest';
import {
    ModalStackManager,
    ModalStackEntry,
    FOCUSABLE_ELEMENTS_SELECTOR
} from '../../../../frontend/src/hooks/admin/useModalA11y.js';

describe('Admin CMS Modal & Drawer Accessibility (Issue #88)', () => {
    // -------------------------------------------------------------------------
    // 1. STACKING & BODY SCROLL LOCK
    // -------------------------------------------------------------------------
    describe('ModalStackManager: Stacking & Body Scroll Lock Reference Counting', () => {
        it('locks scroll on first open, keeps locked while nested, unlocks only when stack is empty', () => {
            let lockCount = 0;
            let unlockCount = 0;

            const manager = new ModalStackManager({
                lock: () => {
                    lockCount++;
                },
                unlock: () => {
                    unlockCount++;
                }
            });

            expect(manager.getDepth()).toBe(0);
            expect(lockCount).toBe(0);

            // Step 1: Open Drawer
            const closeDrawer = vi.fn();
            manager.push({ id: 'admin-right-drawer', close: closeDrawer });
            expect(manager.getDepth()).toBe(1);
            expect(manager.isTopmost('admin-right-drawer')).toBe(true);
            expect(lockCount).toBe(1);
            expect(unlockCount).toBe(0);

            // Step 2: Open Modal on top of Drawer (nested)
            const closeModal = vi.fn();
            manager.push({ id: 'edit-shop-modal', close: closeModal });
            expect(manager.getDepth()).toBe(2);
            expect(manager.isTopmost('edit-shop-modal')).toBe(true);
            expect(manager.isTopmost('admin-right-drawer')).toBe(false);
            // Scroll lock should NOT be called again
            expect(lockCount).toBe(1);
            expect(unlockCount).toBe(0);

            // Step 3: Close inner Modal
            manager.pop('edit-shop-modal');
            expect(manager.getDepth()).toBe(1);
            expect(manager.isTopmost('admin-right-drawer')).toBe(true);
            // Still locked because Drawer is open
            expect(unlockCount).toBe(0);

            // Step 4: Close Drawer
            manager.pop('admin-right-drawer');
            expect(manager.getDepth()).toBe(0);
            expect(unlockCount).toBe(1);
        });

        it('deduplicates pushes with identical ID without increasing stack depth', () => {
            const manager = new ModalStackManager();
            const closeFn1 = vi.fn();
            const closeFn2 = vi.fn();

            manager.push({ id: 'modal-x', close: closeFn1 });
            expect(manager.getDepth()).toBe(1);

            manager.push({ id: 'modal-x', close: closeFn2 });
            expect(manager.getDepth()).toBe(1);

            manager.handleEscape();
            expect(closeFn2).toHaveBeenCalledTimes(1);
            expect(closeFn1).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // 2. TOPMOST ESCAPE DISMISSAL & SUBMITTING GUARD
    // -------------------------------------------------------------------------
    describe('ModalStackManager: Topmost ESC Dismissal & Submitting Guard', () => {
        it('pressing Escape dismisses ONLY the topmost modal in a nested hierarchy', () => {
            const manager = new ModalStackManager();
            const closeDrawer = vi.fn();
            const closeModal = vi.fn();

            // Layer 1: Drawer
            manager.push({ id: 'admin-right-drawer', close: closeDrawer });
            // Layer 2: Confirm Modal
            manager.push({ id: 'lifecycle-confirm-modal', close: closeModal });

            // First Escape: should only dismiss Confirm Modal
            const handledFirst = manager.handleEscape();
            expect(handledFirst).toBe(true);
            expect(closeModal).toHaveBeenCalledTimes(1);
            expect(closeDrawer).not.toHaveBeenCalled();

            // Simulate React state update: modal closes and unmounts
            manager.pop('lifecycle-confirm-modal');
            expect(manager.isTopmost('admin-right-drawer')).toBe(true);

            // Second Escape: now dismisses Drawer
            const handledSecond = manager.handleEscape();
            expect(handledSecond).toBe(true);
            expect(closeDrawer).toHaveBeenCalledTimes(1);
        });

        it('blocks Escape key when topmost modal isSubmitting = true', () => {
            const manager = new ModalStackManager();
            const closeModal = vi.fn();

            manager.push({
                id: 'create-shop-modal',
                close: closeModal,
                isSubmitting: true
            });

            const handled = manager.handleEscape();
            expect(handled).toBe(false);
            expect(closeModal).not.toHaveBeenCalled();
        });

        it('returns false when handleEscape is called on an empty stack', () => {
            const manager = new ModalStackManager();
            expect(manager.handleEscape()).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // 3. FOCUS RESTORATION
    // -------------------------------------------------------------------------
    describe('ModalStackManager: Focus Restoration', () => {
        it('restores focus to trigger element when modal is popped', () => {
            const manager = new ModalStackManager();
            const triggerFocus = vi.fn();
            const mockTrigger = { focus: triggerFocus };

            manager.push({
                id: 'test-modal',
                close: vi.fn(),
                restoreElement: mockTrigger as any
            });

            expect(triggerFocus).not.toHaveBeenCalled();

            manager.pop('test-modal');
            expect(triggerFocus).toHaveBeenCalledTimes(1);
        });

        it('safely handles missing restoreElement without throwing', () => {
            const manager = new ModalStackManager();
            manager.push({
                id: 'no-trigger-modal',
                close: vi.fn(),
                restoreElement: null
            });

            expect(() => manager.pop('no-trigger-modal')).not.toThrow();
        });
    });

    // -------------------------------------------------------------------------
    // 4. FOCUS TRAP WRAPPING COMPUTATION
    // -------------------------------------------------------------------------
    describe('ModalStackManager: Focus Trap Boundary Computation', () => {
        const manager = new ModalStackManager();

        const elA = { id: 'el-first' } as any as HTMLElement;
        const elB = { id: 'el-middle' } as any as HTMLElement;
        const elC = { id: 'el-last' } as any as HTMLElement;
        const focusables = [elA, elB, elC];

        it('forward Tab: wraps to first element when currently at the last element', () => {
            const wrapTarget = manager.computeTabWrap(false, focusables, elC);
            expect(wrapTarget).toBe(elA);
        });

        it('forward Tab: wraps to first element when focus is outside the focusable list', () => {
            const outsideEl = { id: 'outside' } as any as HTMLElement;
            const wrapTarget = manager.computeTabWrap(false, focusables, outsideEl);
            expect(wrapTarget).toBe(elA);
        });

        it('forward Tab: returns null when moving between middle elements (native flow preserved)', () => {
            const wrapTarget = manager.computeTabWrap(false, focusables, elA);
            expect(wrapTarget).toBe(null);
        });

        it('backward Shift+Tab: wraps to last element when currently at the first element', () => {
            const wrapTarget = manager.computeTabWrap(true, focusables, elA);
            expect(wrapTarget).toBe(elC);
        });

        it('backward Shift+Tab: wraps to last element when focus is outside the focusable list', () => {
            const outsideEl = { id: 'outside' } as any as HTMLElement;
            const wrapTarget = manager.computeTabWrap(true, focusables, outsideEl);
            expect(wrapTarget).toBe(elC);
        });

        it('returns null if there are no focusable elements', () => {
            const wrapTarget = manager.computeTabWrap(false, [], elA);
            expect(wrapTarget).toBe(null);
        });
    });

    // -------------------------------------------------------------------------
    // 5. SELECTOR HYGIENE
    // -------------------------------------------------------------------------
    describe('FOCUSABLE_ELEMENTS_SELECTOR', () => {
        it('includes standard accessible focus targets and excludes disabled elements', () => {
            expect(FOCUSABLE_ELEMENTS_SELECTOR).toContain('button:not([disabled])');
            expect(FOCUSABLE_ELEMENTS_SELECTOR).toContain('input:not([disabled]):not([type="hidden"])');
            expect(FOCUSABLE_ELEMENTS_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
            expect(FOCUSABLE_ELEMENTS_SELECTOR).toContain('a[href]');
        });
    });
});
