import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { request } from '../api/client.js';
import { useAuth } from './AuthContext.js';

export type PushPermissionState = 
  | 'unsupported'             // Browser doesn't support Push API / ServiceWorker
  | 'ios_need_install'        // iOS Safari tab, requires Add to Home Screen first
  | 'default'                 // Permission not yet requested
  | 'granted'                 // Permission granted and subscribed
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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const PushProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [state, setState] = useState<PushPermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check device and permission status
  const checkStatus = useCallback(async () => {
    if (typeof window === 'undefined') return;

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

    // On iOS Safari normal browser tab, Web Push is NOT supported until added to Home Screen
    if (isIos && !isStandalone) {
      setState('ios_need_install');
      setIsSubscribed(false);
      return;
    }

    if (!hasSW || !hasPush || !hasNotification) {
      setState('unsupported');
      setIsSubscribed(false);
      return;
    }

    // 2. Check current Notification permission
    const perm = Notification.permission;
    if (perm === 'denied') {
      setState('denied');
      setIsSubscribed(false);
      return;
    }

    if (perm === 'default') {
      setState('default');
      setIsSubscribed(false);
      return;
    }

    // 3. Permission is 'granted', check active subscription in ServiceWorker
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setIsSubscribed(true);
          setState('granted');
          return;
        }
      }
      // Granted but no active local subscription
      setIsSubscribed(false);
      setState('default');
    } catch {
      setState('default');
      setIsSubscribed(false);
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
      // Re-verify iOS standalone check
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
        (navigator as any).standalone === true;

      if (isIos && !isStandalone) {
        setState('ios_need_install');
        throw new Error('Cần thêm ứng dụng vào Màn hình chính (Home Screen) trên iPhone trước khi bật thông báo');
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setState('unsupported');
        throw new Error('Thiết bị hoặc trình duyệt không hỗ trợ Web Push');
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
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      // Get VAPID public key from backend
      const { publicKey } = await request<{ publicKey: string }>('/staff/push/public-key');
      if (!publicKey) {
        throw new Error('Không lấy được VAPID public key từ server');
      }

      const convertedKey = urlBase64ToUint8Array(publicKey);

      // Subscribe to PushManager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as any
      });

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
    } catch (err: any) {
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
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
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
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) endpoint = sub.endpoint;
        }
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
