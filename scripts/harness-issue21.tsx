import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PushProvider, usePush } from '../frontend/src/context/PushContext.js';
import { AuthContext, User, TenantInfo } from '../frontend/src/context/AuthContext.js';

function HarnessRoot() {
  const [user, setUser] = useState<User | null>({
    id: 'user-1',
    email: 'admin@phoco.vn',
    fullName: 'Quản lý'
  });
  const [currentTenant, setCurrentTenant] = useState<TenantInfo | null>({
    id: 'tenant-1',
    name: 'Phố Cổ',
    slug: 'pho-co',
    role: 'manager',
    permissions: ['manage_orders']
  });

  // Global hooks for browser test driver
  (window as any).__setAuthUser = setUser;
  (window as any).__setAuthTenant = setCurrentTenant;

  return (
    <AuthContext.Provider value={{
      user,
      currentTenant,
      memberships: [],
      isLoading: false,
      login: async () => {},
      logout: async () => { setUser(null); setCurrentTenant(null); },
      hasPermission: () => true,
      updateCurrentTenant: () => {}
    }}>
      <PushProvider>
        <PushConsumer />
      </PushProvider>
    </AuthContext.Provider>
  );
}

function PushConsumer() {
  const push = usePush();
  (window as any).__push = push;

  return (
    <div id="harness-root">
      <div id="push-state">{push.state}</div>
      <div id="push-subscribed">{String(push.isSubscribed)}</div>
      <div id="push-loading">{String(push.isLoading)}</div>
      <div id="push-error">{push.errorMessage || ''}</div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<HarnessRoot />);
}
