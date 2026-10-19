import { AsyncLocalStorage } from 'node:async_hooks';

export const transactionEffects = new AsyncLocalStorage<Array<() => void | Promise<unknown>>>();

// Returns true when the effect was deferred until a successful commit.
export function deferUntilCommit(effect: () => void | Promise<unknown>): boolean {
    const effects = transactionEffects.getStore();
    if (!effects) return false;
    effects.push(effect);
    return true;
}
