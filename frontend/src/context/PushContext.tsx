import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { request } from '../api/client.js';
import { useAuth } from './AuthContext.js';

export type PushPermissionState = 
  | 'unsupported'             // Browser doesn't support Push API / ServiceWorker
  | 'http_insecure'           // Non-localhost HTTP, iOS/browser requires HTTPS for Push
  | 'ios_need_install'        // iOS Safari tab, requires Add to Home Screen first
  | 'server_disabled'         // Server has not configured VAPID or disabled push
  | 'default'                 // Permission not yet requested
  | 'granted'                 // Permission granted and subscribed with backend
  | 'sync_error'              // Browser has subscription but backend sync failed / needs retry
  | 'key_mismatch'            // Server VAPID key was rotated; re-subscribe needed
  | 'denied';                 // Permission blocked by user

interface PushContextType {
  state: PushPermissionState;
  isSubscribed: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  sendTestPush: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

const PushContext = createContext<PushContextType | null>(null);

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function areApplicationServerKeysEqual(subKey: ArrayBuffer | null, serverKey: string): boolean {
  if (!subKey || !serverKey) return false;
  try {
    const expected = urlBase64ToUint8Array(serverKey);
    const actual = new Uint8Array(subKey);
    if (actual.byteLength !== expected.byteLength) return false;
    for (let i = 0; i < actual.byteLength; i++) {
      if (actual[i] !== expected[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const PushProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, currentTenant } = useAuth();
  const [state, setState] = useState<PushPermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check device and permission status
  const checkStatus = useCallback(async () => {
    if (typeof window === 'undefined') return;

    // 0. Check secure context (HTTPS or localhost)
    const isInsecureHttp = window.location.protocol === 'http:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';

    if (isInsecureHttp) {
      setState('http_insecure');
      setIsSubscribed(false);
      return;
    }

    // 1. Check basic Web Push / ServiceWorker support
    const hasSW = 'serviceWorker' in navigator;
    const hasPush = 'PushManager' in window;
    const hasNotification = 'Notification' in window;

    // Detect iOS
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Detect standalone PWA mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
      (navigator as any).standalone === true;

    // 2. Check current Notification permission if available
    if (hasNotification) {
      const perm = Notification.permission;
      if (perm === 'denied') {
        setState('denied');
        setIsSubscribed(false);
        return;
      }
    }

    // On iOS Safari normal browser tab without Notification API, Web Push requires Home Screen
    if (isIos && !isStandalone && !hasNotification) {
      setState('ios_need_install');
      setIsSubscribed(false);
      return;
    }

    if (!hasSW || !hasPush) {
      setState('unsupported');
      setIsSubscribed(false);
      return;
    }

    // If user is logged out, clear subscription state (no false positives)
    if (!user || !currentTenant) {
      setIsSubscribed(false);
      setState(hasNotification && Notification.permission === 'granted' ? 'granted' : 'default');
      return;
    }

    // 3. Query server push availability and public key
    let serverInfo: { available: boolean; enabled: boolean; publicKey?: string; reason?: string } | null = null;
    try {
      serverInfo = await request<{ available: boolean; enabled: boolean; publicKey?: string; reason?: string }>('/staff/push/public-key');
    } catch (err: any) {
      console.warn('[Push] Error querying server push status:', err?.message);
    }

    if (!serverInfo || !serverInfo.available || !serverInfo.publicKey) {
      setState('server_disabled');
      setIsSubscribed(false);
      return;
    }

    if (hasNotification && Notification.permission === 'default') {
      setState('default');
      setIsSubscribed(false);
      return;
    }

    // 4. Permission is 'granted', check active subscription in ServiceWorker and sync with backend
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          // Check for VAPID key rotation
          const keyMatches = areApplicationServerKeysEqual(sub.options?.applicationServerKey || null, serverInfo.publicKey);
          if (!keyMatches) {
            setState('key_mismatch');
            setIsSubscribed(false);
            setErrorMessage('Khóa thông báo trên máy chủ đã thay đổi. Vui lòng bấm để kết nối lại.');
            return;
          }

          const subJson = sub.toJSON();
          if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
            try {
              await request('/staff/push/subscribe', {
                method: 'POST',
                body: JSON.stringify({
                  endpoint: subJson.endpoint,
                  keys: {
                    p256dh: subJson.keys.p256dh,
                    auth: subJson.keys.auth
                  }
                })
              });
              setIsSubscribed(true);
              setState('granted');
              setErrorMessage(null);
              return;
            } catch (err: any) {
              console.warn('[Push] Backend sync error:', err.message);
              setIsSubscribed(false);
              setState('sync_error');
              setErrorMessage('Chưa đồng bộ được thông báo với máy chủ quán. Vui lòng bấm để kết nối lại.');
              return;
            }
          }
        }
      }
      setIsSubscribed(false);
      setState(hasNotification && Notification.permission === 'granted' ? 'granted' : 'default');
    } catch {
      setState('default');
      setIsSubscribed(false);
    }
  }, [user, currentTenant]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (user) {
      checkStatus();
    }
  }, [user, checkStatus]);

  // Subscribe to Web Push (must be triggered by a direct user gesture)
  const subscribe = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        setState('http_insecure');
        throw new Error('Apple và iOS yêu cầu kết nối bảo mật HTTPS (hoặc qua domain có SSL) để cho phép nhận thông báo khi khóa màn hình');
      }

      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
        (navigator as any).standalone === true;

      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (isIos && !isStandalone) {
          setState('ios_need_install');
          throw new Error('Apple yêu cầu bạn bấm "Chia sẻ ⎋" -> "Thêm vào Màn hình chính" để nhận chuông thông báo khi khóa máy trên iPhone');
        }
        setState('unsupported');
        throw new Error('Thiết bị hoặc trình duyệt không hỗ trợ Web Push');
      }

      // Check VAPID availability from backend first
      const serverInfo = await request<{ available: boolean; enabled: boolean; publicKey?: string; reason?: string }>('/staff/push/public-key');
      if (!serverInfo.available || !serverInfo.publicKey) {
        setState('server_disabled');
        throw new Error('Hệ thống thông báo đẩy (Web Push) chưa được cấu hình hoặc kích hoạt trên máy chủ quán');
      }

      // Request browser permission
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setState('denied');
        throw new Error('Quyền thông báo bị từ chối trong Cài đặt của máy');
      }

      if (permission !== 'granted') {
        setState('default');
        return;
      }

      // Register Service Worker
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const registration = await navigator.serviceWorker.ready;

      // Check existing subscription and rotate if key changed
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const keyMatches = areApplicationServerKeysEqual(subscription.options?.applicationServerKey || null, serverInfo.publicKey);
        if (!keyMatches) {
          const oldEndpoint = subscription.endpoint;
          await subscription.unsubscribe().catch(() => {});
          await request('/staff/push/unsubscribe', {
            method: 'POST',
            body: JSON.stringify({ endpoint: oldEndpoint })
          }).catch(() => {});
          subscription = null;
        }
      }

      // Subscribe anew if needed
      if (!subscription) {
        const convertedKey = urlBase64ToUint8Array(serverInfo.publicKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey as any
        });
      }

      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error('Không thể khởi tạo subscription khóa p256dh/auth');
      }

      // Sync subscription to backend
      await request('/staff/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth
          }
        })
      });

      setState('granted');
      setIsSubscribed(true);
      setErrorMessage(null);
    } catch (err: any) {
      setIsSubscribed(false);
      if (state !== 'server_disabled' && state !== 'denied' && state !== 'ios_need_install' && state !== 'http_insecure') {
        setState('sync_error');
      }
      setErrorMessage(err.message || 'Lỗi khi bật thông báo');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Unsubscribe from Web Push
  const unsubscribe = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            const endpoint = sub.endpoint;
            await sub.unsubscribe().catch(() => {});

            // Remove from backend
            await request('/staff/push/unsubscribe', {
              method: 'POST',
              body: JSON.stringify({ endpoint })
            }).catch(() => {});
          }
        }
      }

      setIsSubscribed(false);
      setState('default');
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi tắt thông báo');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Send a test push notification
  const sendTestPush = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      let endpoint: string | undefined;
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) endpoint = sub.endpoint;
        }
      }

      if (!endpoint) {
        throw new Error('Thiết bị chưa có đăng ký thông báo với trình duyệt. Vui lòng bật lại thông báo.');
      }

      await request('/staff/push/test', {
        method: 'POST',
        body: JSON.stringify({ endpoint })
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi gửi thông báo thử nghiệm');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PushContext.Provider
      value={{
        state,
        isSubscribed,
        isLoading,
        errorMessage,
        subscribe,
        unsubscribe,
        sendTestPush,
        refreshStatus: checkStatus
      }}
    >
      {children}
    </PushContext.Provider>
  );
};

export const usePush = () => {
  const context = useContext(PushContext);
  if (!context) {
    throw new Error('usePush must be used within a PushProvider');
  }
  return context;
};
