import { describe, expect, it, beforeEach } from 'vitest';
import {
  readStoredPushEnabled,
  readStoredPushState,
  writeStoredPush,
  PUSH_STORAGE_KEY,
  PUSH_STATE_KEY
} from '../context/PushContext.js';

describe('push notification persistence', () => {
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear()
  };

  beforeEach(() => {
    store.clear();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = mockLocalStorage;
    delete (globalThis as any).Notification;
  });

  it('defaults to disabled and default state when localStorage is empty', () => {
    expect(readStoredPushEnabled()).toBe(false);
    expect(readStoredPushState()).toBe('default');
  });

  it('correctly reads stored enabled state', () => {
    mockLocalStorage.setItem(PUSH_STORAGE_KEY, 'true');
    expect(readStoredPushEnabled()).toBe(true);
    expect(readStoredPushState()).toBe('granted');
  });

  it('writes and reads stored push state and enabled flag', () => {
    writeStoredPush(true, 'granted');
    expect(mockLocalStorage.getItem(PUSH_STORAGE_KEY)).toBe('true');
    expect(mockLocalStorage.getItem(PUSH_STATE_KEY)).toBe('granted');
    expect(readStoredPushEnabled()).toBe(true);
    expect(readStoredPushState()).toBe('granted');

    writeStoredPush(false, 'default');
    expect(mockLocalStorage.getItem(PUSH_STORAGE_KEY)).toBe('false');
    expect(mockLocalStorage.getItem(PUSH_STATE_KEY)).toBe('default');
    expect(readStoredPushEnabled()).toBe(false);
    expect(readStoredPushState()).toBe('default');
  });

  it('correctly stores sync_error and denied states', () => {
    writeStoredPush(false, 'sync_error');
    expect(readStoredPushEnabled()).toBe(false);
    expect(readStoredPushState()).toBe('sync_error');

    writeStoredPush(false, 'denied');
    expect(readStoredPushEnabled()).toBe(false);
    expect(readStoredPushState()).toBe('denied');
  });

  it('respects Notification.permission denied even if stored as enabled', () => {
    writeStoredPush(true, 'granted');
    (globalThis as any).Notification = { permission: 'denied' };
    expect(readStoredPushState()).toBe('denied');
  });
});
