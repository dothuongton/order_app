import { useEffect, useRef } from 'react';

export const FOCUSABLE_ELEMENTS_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
].join(', ');

export interface ModalStackEntry {
    id: string;
    close: () => void;
    isSubmitting?: boolean;
    restoreElement?: HTMLElement | { focus: () => void } | null;
}

export interface ScrollLockAdapter {
    lock: () => void;
    unlock: () => void;
}

/**
 * Headless Manager handling modal stacking, topmost Escape dispatch,
 * body scroll lock reference counting, and focus trap / restoration logic.
 */
export class ModalStackManager {
    private stack: ModalStackEntry[] = [];
    private scrollLockAdapter: ScrollLockAdapter;
    private initialBodyOverflow: string | null = null;

    constructor(customScrollLock?: ScrollLockAdapter) {
        this.scrollLockAdapter = customScrollLock || {
            lock: () => {
                if (typeof document === 'undefined') return;
                if (this.initialBodyOverflow === null) {
                    this.initialBodyOverflow = document.body.style.overflow;
                }
                document.body.style.overflow = 'hidden';
            },
            unlock: () => {
                if (typeof document === 'undefined') return;
                if (this.initialBodyOverflow !== null) {
                    document.body.style.overflow = this.initialBodyOverflow;
                    this.initialBodyOverflow = null;
                } else {
                    document.body.style.overflow = '';
                }
            }
        };
    }

    getStack(): readonly ModalStackEntry[] {
        return this.stack;
    }

    getDepth(): number {
        return this.stack.length;
    }

    getTopmost(): ModalStackEntry | undefined {
        return this.stack[this.stack.length - 1];
    }

    isTopmost(id: string): boolean {
        const top = this.getTopmost();
        return top !== undefined && top.id === id;
    }

    push(entry: ModalStackEntry): number {
        // Prevent duplicate entries for the same modal ID
        const existingIdx = this.stack.findIndex((item) => item.id === entry.id);
        if (existingIdx !== -1) {
            this.stack[existingIdx] = entry;
            return this.stack.length;
        }

        this.stack.push(entry);
        if (this.stack.length === 1) {
            this.scrollLockAdapter.lock();
        }
        return this.stack.length;
    }

    pop(id: string): ModalStackEntry | undefined {
        const idx = this.stack.findIndex((item) => item.id === id);
        if (idx === -1) return undefined;

        const [removed] = this.stack.splice(idx, 1);
        if (this.stack.length === 0) {
            this.scrollLockAdapter.unlock();
        }

        // Restore focus to pre-modal trigger element
        if (removed.restoreElement && typeof removed.restoreElement.focus === 'function') {
            try {
                removed.restoreElement.focus();
            } catch {
                // Ignore errors if element was unmounted
            }
        }

        return removed;
    }

    /**
     * Dispatch Escape key to topmost layer only.
     * Returns true if handled, false if ignored (e.g. submitting or empty).
     */
    handleEscape(): boolean {
        const top = this.getTopmost();
        if (!top) return false;

        if (top.isSubmitting) {
            // Block Escape while an async submit/mutation is in-flight
            return false;
        }

        top.close();
        return true;
    }

    /**
     * Focus trap calculation.
     * Given focusable elements and the currently focused element, determines if focus should wrap.
     */
    computeTabWrap(
        shiftKey: boolean,
        focusableElements: HTMLElement[],
        currentElement: HTMLElement | null
    ): HTMLElement | null {
        if (focusableElements.length === 0) {
            return null;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (shiftKey) {
            // Shift + Tab: wrap to last if currently at first or outside
            if (currentElement === first || !focusableElements.includes(currentElement as any)) {
                return last;
            }
        } else {
            // Tab: wrap to first if currently at last or outside
            if (currentElement === last || !focusableElements.includes(currentElement as any)) {
                return first;
            }
        }

        return null;
    }

    reset(): void {
        if (this.stack.length > 0) {
            this.scrollLockAdapter.unlock();
        }
        this.stack = [];
        this.initialBodyOverflow = null;
    }
}

// Global shared singleton for the browser window
export const defaultModalStackManager = new ModalStackManager();

export interface UseModalA11yOptions {
    isOpen: boolean;
    onClose: () => void;
    isSubmitting?: boolean;
    initialFocusRef?: React.RefObject<HTMLElement | null>;
    containerRef: React.RefObject<HTMLElement | null>;
    modalId: string;
    manager?: ModalStackManager;
}

/**
 * Hook providing standard accessibility for Admin modals and drawers:
 * 1. Focus trap: restricts Tab / Shift+Tab cycling to container.
 * 2. Focus restore: returns focus to trigger element on close.
 * 3. Body scroll lock: disables background page scrolling while modal is open.
 * 4. Topmost Escape dismissal: dismisses only topmost layer, ignored while submitting.
 * 5. Auto-focus: focuses initial input or first focusable element on open.
 */
export function useModalA11y({
    isOpen,
    onClose,
    isSubmitting = false,
    initialFocusRef,
    containerRef,
    modalId,
    manager = defaultModalStackManager
}: UseModalA11yOptions): void {
    const restoreElementRef = useRef<HTMLElement | null>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const isSubmittingRef = useRef(isSubmitting);
    isSubmittingRef.current = isSubmitting;

    // 1. Manage modal stack, body scroll lock, and focus restoration
    useEffect(() => {
        if (!isOpen) return;

        // Capture element currently focused before opening modal
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
            restoreElementRef.current = document.activeElement;
        }

        const entry: ModalStackEntry = {
            id: modalId,
            close: () => onCloseRef.current(),
            get isSubmitting() {
                return isSubmittingRef.current;
            },
            restoreElement: restoreElementRef.current
        };

        manager.push(entry);

        // Auto-focus initial element or first interactive element
        const focusTimer = setTimeout(() => {
            if (initialFocusRef?.current) {
                initialFocusRef.current.focus();
            } else if (containerRef.current) {
                const focusable = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS_SELECTOR);
                const firstVisible = Array.from(focusable).find(
                    (el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0
                );
                if (firstVisible) {
                    firstVisible.focus();
                } else {
                    containerRef.current.focus();
                }
            }
        }, 30);

        return () => {
            clearTimeout(focusTimer);
            manager.pop(modalId);
        };
    }, [isOpen, modalId, containerRef, initialFocusRef, manager]);

    // 2. Global key listener for Tab (focus trap) and Escape (topmost dismissal)
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!manager.isTopmost(modalId)) return;

            // Escape key handling
            if (e.key === 'Escape') {
                if (manager.handleEscape()) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                return;
            }

            // Tab / Shift+Tab focus trap
            if (e.key === 'Tab') {
                if (!containerRef.current) return;

                const focusable = Array.from(
                    containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS_SELECTOR)
                ).filter(
                    (el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0
                );

                if (focusable.length === 0) {
                    e.preventDefault();
                    containerRef.current.focus();
                    return;
                }

                const wrapTarget = manager.computeTabWrap(
                    e.shiftKey,
                    focusable,
                    document.activeElement as HTMLElement
                );

                if (wrapTarget) {
                    e.preventDefault();
                    wrapTarget.focus();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [isOpen, modalId, containerRef, manager]);
}
