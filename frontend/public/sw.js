// Service Worker for QR Order Staff Web Push (iOS 16.4+ / Android / Desktop)

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming Web Push notification
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        title: 'QR Order - Thông báo',
        body: event.data.text()
      };
    }
  }

  const title = payload.title || 'QR Order - Thông báo nhân viên';
  const data = payload.data || {};
  const notificationTag = payload.tag || data.eventId || `push-${Date.now()}`;

  const options = {
    body: payload.body || 'Có cập nhật đơn món hoặc yêu cầu hỗ trợ mới.',
    icon: payload.icon || '/icon.svg',
    badge: payload.badge || '/icon.svg',
    tag: notificationTag,
    renotify: true,
    data: data,
    vibrate: [200, 100, 200]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle user clicking on notification (lockscreen or banner)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const rawUrl = data.url || '/staff';

  // Security: only allow internal URLs within current origin
  let fullTargetUrl;
  try {
    const parsed = new URL(rawUrl, self.location.origin);
    // Ensure host matches current origin to prevent open-redirect
    if (parsed.origin !== self.location.origin) {
      fullTargetUrl = new URL('/staff', self.location.origin).href;
    } else {
      fullTargetUrl = parsed.href;
    }
  } catch {
    fullTargetUrl = new URL('/staff', self.location.origin).href;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open under our origin, focus it
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client && client.url !== fullTargetUrl) {
            client.navigate(fullTargetUrl);
          }
          return client.focus();
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullTargetUrl);
      }
    })
  );
});
