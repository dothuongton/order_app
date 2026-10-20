import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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

export class PushActionError extends Error {
  code: PushPermissionState;
  constructor(message: string, code: PushPermissionState) {
    super(message);
    this.name = 'PushActionError';
    this.code = code;
  }
}

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

  // Set of endpoints confirmed to have expired at APNs/FCM (HTTP 410)
  const expiredEndpointsRef = useRef<Set<string>>(new Set());

  // Track active user, tenant, and generation to discard stale in-flight responses across logout or tenant switch
  const scopeGenerationRef = useRef<number>(0);
  const sessionScopeRef = useRef<{ userId?: string; tenantId?: string }>({
    userId: user?.id,
    tenantId: currentTenant?.id
  });

  const currentUserId = user?.id;
  const currentTenantId = currentTenant?.id;
  if (sessionScopeRef.current.userId !== currentUserId || sessionScopeRef.current.tenantId !== currentTenantId) {
    scopeGenerationRef.current += 1;
    sessionScopeRef.current = {
      userId: currentUserId,
      tenantId: currentTenantId
    };
  }

  // Create a scope guard for async flows
  const createScopeGuard = () => {
    const activeGeneration = scopeGenerationRef.current;
    const activeUserId = user?.id;
    const activeTenantId = currentTenant?.id;
    return () => {
      return (
        scopeGenerationRef.current !== activeGeneration ||
        sessionScopeRef.current.userId !== activeUserId ||
        sessionScopeRef.current.tenantId !== activeTenantId
      );
    };
  };

  useEffect(() => {
    if (!user || !currentTenant) {
      setIsSubscribed(false);
      setState(typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'granted' : 'default');
      setErrorMessage(null);
      setIsLoading(false);
    }
  }, [user?.id, currentTenant?.id]);

  // Check device and permission status
  const checkStatus = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const isStale = createScopeGuard();

    // 0. Check secure context (HTTPS or localhost)
    const isInsecureHttp = window.location.protocol === 'http:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';

    if (isInsecureHttp) {
      if (isStale()) return;
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
        if (isStale()) return;
        setState('denied');
        setIsSubscribed(false);
        return;
      }
    }

    // On iOS Safari normal browser tab without Notification API, Web Push requires Home Screen
    if (isIos && !isStandalone && !hasNotification) {
      if (isStale()) return;
      setState('ios_need_install');
      setIsSubscribed(false);
      return;
    }

    if (!hasSW || !hasPush) {
      if (isStale()) return;
      setState('unsupported');
      setIsSubscribed(false);
      return;
    }

    // If user is logged out, clear subscription state (no false positives)
    if (!user || !currentTenant) {
      if (isStale()) return;
      setIsSubscribed(false);
      setState(hasNotification && Notification.permission === 'granted' ? 'granted' : 'default');
      setErrorMessage(null);
      return;
    }

    // 3. Query server push availability and public key
    let serverInfo: { available: boolean; enabled: boolean; publicKey?: string; reason?: string } | null = null;
    try {
      serverInfo = await request<{ available: boolean; enabled: boolean; publicKey?: string; reason?: string }>('/staff/push/public-key');
    } catch (err: any) {
      if (isStale()) return;
      // Network error, 5xx, or 401/403: do NOT misclassify as server_disabled
      setIsSubscribed(false);
      if (err?.status === 401 || err?.status === 403) {
        setErrorMessage('Phiên làm việc hết hạn hoặc không có quyền kiểm tra thông báo.');
        setState(hasNotification && Notification.permission === 'granted' ? 'granted' : 'default');
      } else {
        setState('sync_error');
        setErrorMessage('Không thể kết nối máy chủ để kiểm tra thông báo. Vui lòng kiểm tra lại kết nối mạng.');
      }
      return;
    }

    if (isStale()) return;

    // Server explicitly responded 200 OK with available: false
    if (!serverInfo || !serverInfo.available || !serverInfo.publicKey) {
      setState('server_disabled');
      setIsSubscribed(false);
      setErrorMessage(null);
      return;
    }

    if (hasNotification && Notification.permission === 'default') {
      setState('default');
      setIsSubscribed(false);
      setErrorMessage(null);
      return;
    }

    // 4. Permission is 'granted', check active subscription in ServiceWorker and sync with backend
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (isStale()) return;

      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (isStale()) return;

        if (sub) {
          // If this endpoint was confirmed dead/expired, do not reuse it
          if (expiredEndpointsRef.current.has(sub.endpoint)) {
            setIsSubscribed(false);
            setState('sync_error');
            setErrorMessage('Đăng ký thông báo của thiết bị đã hết hạn. Vui lòng bấm để kết nối lại.');
            return;
          }

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
            const targetEndpoint = sub.endpoint;
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
              if (isStale()) return;
              setIsSubscribed(true);
              setState('granted');
              setErrorMessage(null);
              return;
            } catch (err: any) {
              if (isStale()) return;
              if (err?.status === 410 || err?.code === 'SUBSCRIPTION_EXPIRED') {
                expiredEndpointsRef.current.add(targetEndpoint);
                try {
                  const checkReg = await navigator.serviceWorker.getRegistration();
                  if (checkReg && !isStale()) {
                    const currentSub = await checkReg.pushManager.getSubscription();
                    if (currentSub && currentSub.endpoint === targetEndpoint) {
                      await currentSub.unsubscribe().catch(() => {});
                    }
                  }
                } catch {}
              }
              if (isStale()) return;
              setIsSubscribed(false);
              setState('sync_error');
              setErrorMessage('Chưa đồng bộ được thông báo với máy chủ quán. Vui lòng bấm để kết nối lại.');
              return;
            }
          }
        }
      }
      if (isStale()) return;
      setIsSubscribed(false);
      setState(hasNotification && Notification.permission === 'granted' ? 'granted' : 'default');
      setErrorMessage(null);
    } catch {
      if (isStale()) return;
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
    const isStale = createScopeGuard();

    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        throw new PushActionError(
          'Apple và iOS yêu cầu kết nối bảo mật HTTPS (hoặc qua domain có SSL) để cho phép nhận thông báo khi khóa màn hình',
          'http_insecure'
        );
      }

      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
        (navigator as any).standalone === true;

      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (isIos && !isStandalone) {
          throw new PushActionError(
            'Apple yêu cầu bạn bấm "Chia sẻ ⎋" -> "Thêm vào Màn hình chính" để nhận chuông thông báo khi khóa máy trên iPhone',
            'ios_need_install'
          );
        }
        throw new PushActionError('Thiết bị hoặc trình duyệt không hỗ trợ Web Push', 'unsupported');
      }

      // Check VAPID availability from backend first
      let serverInfo: { available: boolean; enabled: boolean; publicKey?: string; reason?: string };
      try {
        serverInfo = await request<{ available: boolean; enabled: boolean; publicKey?: string; reason?: string }>('/staff/push/public-key');
      } catch (err: any) {
        if (err?.status === 401 || err?.status === 403) {
          throw new PushActionError('Phiên làm việc hết hạn hoặc thiếu quyền nhận thông báo quán', 'sync_error');
        }
        throw new PushActionError('Không thể kết nối tới máy chủ để kiểm tra thông báo. Vui lòng thử lại sau.', 'sync_error');
      }

      if (isStale()) return;

      if (!serverInfo.available || !serverInfo.publicKey) {
        throw new PushActionError(
          serverInfo?.reason === 'INITIALIZATION_FAILED'
            ? 'Hệ thống thông báo đẩy trên máy chủ gặp sự cố khởi tạo VAPID'
            : 'Hệ thống thông báo đẩy (Web Push) chưa được cấu hình hoặc kích hoạt trên máy chủ quán',
          'server_disabled'
        );
      }

      // Request browser permission
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        throw new PushActionError('Quyền thông báo bị từ chối trong Cài đặt của máy', 'denied');
      }

      if (permission !== 'granted') {
        if (isStale()) return;
        setState('default');
        return;
      }

      if (isStale()) return;

      // Register Service Worker
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const registration = await navigator.serviceWorker.ready;
      if (isStale()) return;

      // Check existing subscription and rotate if key changed or previously marked expired
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const isExpired = expiredEndpointsRef.current.has(subscription.endpoint);
        const keyMatches = areApplicationServerKeysEqual(subscription.options?.applicationServerKey || null, serverInfo.publicKey);
        if (!keyMatches || isExpired) {
          const oldEndpoint = subscription.endpoint;
          let unsubSuccess = false;
          try {
            unsubSuccess = await subscription.unsubscribe();
          } catch (unsubErr: any) {
            unsubSuccess = false;
          }

          if (isStale()) return;

          // R5: If browser failed to unsubscribe, verify if the old subscription is still active
          if (!unsubSuccess) {
            const checkSub = await registration.pushManager.getSubscription().catch(() => null);
            if (checkSub && checkSub.endpoint === oldEndpoint) {
              throw new PushActionError(
                'Không thể hủy đăng ký thông báo cũ trên trình duyệt. Vui lòng khởi động lại trình duyệt hoặc đặt lại quyền thông báo.',
                'sync_error'
              );
            }
          }

          // Best-effort notify backend
          await request('/staff/push/unsubscribe', {
            method: 'POST',
            body: JSON.stringify({ endpoint: oldEndpoint })
          }).catch(() => {});

          if (isStale()) return;
          subscription = null;
        }
      }

      if (isStale()) return;

      // Subscribe anew if needed
      if (!subscription) {
        const convertedKey = urlBase64ToUint8Array(serverInfo.publicKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey as any
        });
      }

      if (isStale()) return;

      if (!subscription) {
        throw new PushActionError('Không thể tạo đăng ký thông báo mới với trình duyệt', 'sync_error');
      }

      // R5: CRITICAL CHECK: If returned subscription still has an endpoint marked expired,
      // browser returned the old dead endpoint! Do NOT sync or report success!
      if (expiredEndpointsRef.current.has(subscription.endpoint)) {
        throw new PushActionError(
          'Trình duyệt trả lại đăng ký thông báo đã hết hạn. Vui lòng cấp lại quyền hoặc khởi động lại trình duyệt.',
          'sync_error'
        );
      }

      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new PushActionError('Không thể khởi tạo subscription khóa p256dh/auth', 'sync_error');
      }

      if (isStale()) return;

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

      if (isStale()) return;

      setState('granted');
      setIsSubscribed(true);
      setErrorMessage(null);
    } catch (err: any) {
      if (isStale()) return;
      setIsSubscribed(false);
      let targetState: PushPermissionState = 'sync_error';
      if (err instanceof PushActionError) {
        targetState = err.code;
      } else if (err?.code === 'denied' || (typeof Notification !== 'undefined' && Notification.permission === 'denied')) {
        targetState = 'denied';
      }
      setState(targetState);
      setErrorMessage(err.message || 'Lỗi khi bật thông báo');
      throw err;
    } finally {
      if (!isStale()) {
        setIsLoading(false);
      }
    }
  };

  // Unsubscribe from Web Push
  const unsubscribe = async () => {
    const isStale = createScopeGuard();

    setIsLoading(true);
    setErrorMessage(null);

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (isStale()) return;
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (isStale()) return;
          if (sub) {
            const endpoint = sub.endpoint;
            let unsubSuccess = false;
            try {
              unsubSuccess = await sub.unsubscribe();
            } catch (unsubErr: any) {
              unsubSuccess = false;
            }

            if (isStale()) return;

            if (!unsubSuccess) {
              const checkSub = await reg.pushManager.getSubscription().catch(() => null);
              if (checkSub && checkSub.endpoint === endpoint) {
                throw new PushActionError('Trình duyệt không thể hủy đăng ký thông báo', 'sync_error');
              }
            }

            // Remove from backend
            await request('/staff/push/unsubscribe', {
              method: 'POST',
              body: JSON.stringify({ endpoint })
            }).catch(() => {});
          }
        }
      }

      if (isStale()) return;
      setIsSubscribed(false);
      setState('default');
    } catch (err: any) {
      if (isStale()) return;
      let targetState: PushPermissionState = 'sync_error';
      if (err instanceof PushActionError) {
        targetState = err.code;
      }
      setState(targetState);
      setErrorMessage(err.message || 'Lỗi khi tắt thông báo');
      throw err;
    } finally {
      if (!isStale()) {
        setIsLoading(false);
      }
    }
  };

  // Send a test push notification
  const sendTestPush = async () => {
    const isStale = createScopeGuard();

    setIsLoading(true);
    setErrorMessage(null);

    let targetEndpoint: string | undefined;

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (isStale()) return;
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (isStale()) return;
          if (sub) targetEndpoint = sub.endpoint;
        }
      }

      if (isStale()) return;

      if (!targetEndpoint) {
        throw new Error('Thiết bị chưa có đăng ký thông báo với trình duyệt. Vui lòng bật lại thông báo.');
      }

      await request('/staff/push/test', {
        method: 'POST',
        body: JSON.stringify({ endpoint: targetEndpoint })
      });

      if (isStale()) return;
      setErrorMessage(null);
    } catch (err: any) {
      // If session/tenant changed while request was in-flight, discard EVERYTHING from this stale call
      if (isStale()) return;

      // If endpoint expired at APNs/FCM (410), mark targetEndpoint expired and unregister ONLY targetEndpoint
      if (err?.status === 410 || err?.code === 'SUBSCRIPTION_EXPIRED') {
        if (targetEndpoint) {
          expiredEndpointsRef.current.add(targetEndpoint);
        }

        if ('serviceWorker' in navigator) {
          try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && !isStale()) {
              const currentSub = await reg.pushManager.getSubscription();
              // CRITICAL R4: ONLY unsubscribe if the browser is STILL holding targetEndpoint!
              if (currentSub && currentSub.endpoint === targetEndpoint) {
                try {
                  await currentSub.unsubscribe();
                } catch {}
              }
            }
          } catch {}
        }

        if (isStale()) return;

        // If the current device subscription is already different and valid (e.g. reconnected), do NOT corrupt state
        try {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            const currentSub = await reg?.pushManager?.getSubscription();
            if (currentSub && currentSub.endpoint !== targetEndpoint && !expiredEndpointsRef.current.has(currentSub.endpoint)) {
              throw err;
            }
          }
        } catch (innerErr) {
          if (innerErr === err) throw err;
        }

        if (isStale()) return;
        setIsSubscribed(false);
        setState('sync_error');
        setErrorMessage('Đăng ký thông báo của thiết bị đã hết hạn tại APNs/FCM. Vui lòng bấm để kết nối lại thiết bị.');
        throw err;
      }

      // If database lost the device registration (404), allow re-sync without destroying browser subscription
      if (err?.status === 404 || err?.code === 'DEVICE_NOT_REGISTERED') {
        if (isStale()) return;
        setIsSubscribed(false);
        setState('sync_error');
        setErrorMessage('Thiết bị chưa được đồng bộ trên hệ thống máy chủ quán. Vui lòng bấm để đồng bộ lại.');
        throw err;
      }

      if (isStale()) return;
      setErrorMessage(err.message || 'Lỗi gửi thông báo thử nghiệm');
      throw err;
    } finally {
      if (!isStale()) {
        setIsLoading(false);
      }
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
