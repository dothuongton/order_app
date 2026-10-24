import React, { createContext, useContext, useState, useEffect } from 'react';
import { request } from '../api/client.js';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
  permissions: string[];
  logoUrl?: string;
  coverUrl?: string;
  description?: string;
  phone?: string;
  address?: string;
  openingHours?: string;
  activeThemeConfig?: any;
}

interface AuthContextType {
  user: User | null;
  currentTenant: TenantInfo | null;
  memberships: any[];
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
  updateCurrentTenant: (updates: Partial<TenantInfo>) => void;
  updateUserProfile: (updates: { fullName: string; phone?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [currentTenant, setCurrentTenant] = useState<TenantInfo | null>(null);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('staff_token');
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await request<{ user: any }>('/auth/me');
        if (res.user) {
          setUser({
            id: res.user.id,
            email: res.user.email,
            fullName: res.user.fullName
          });
          setCurrentTenant({
            id: res.user.tenantId,
            name: res.user.tenantName || 'Quán của bạn',
            slug: res.user.tenantSlug || '',
            role: res.user.role,
            permissions: res.user.permissions || [],
            logoUrl: res.user.logoUrl || res.user.tenantLogoUrl,
            coverUrl: res.user.coverUrl || res.user.tenantCoverUrl,
            description: res.user.description || res.user.tenantDescription,
            phone: res.user.phone || res.user.tenantPhone,
            address: res.user.address || res.user.tenantAddress,
            openingHours: res.user.openingHours || res.user.tenantOpeningHours,
            activeThemeConfig: res.user.activeThemeConfig || res.user.tenantThemeConfig || null
          });
        }
      } catch {
        localStorage.removeItem('staff_token');
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass })
    });

    localStorage.setItem('staff_token', res.token);
    localStorage.setItem('staff_tenant_id', res.currentTenant.id);

    setUser(res.user);
    setCurrentTenant(res.currentTenant);
    setMemberships(res.memberships);
  };

  const logout = async () => {
    try {
      // Unlink push subscription on server before clearing token
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js').catch(() => null);
        if (reg) {
          const sub = await reg.pushManager.getSubscription().catch(() => null);
          if (sub) {
            await request('/staff/push/unsubscribe', {
              method: 'POST',
              body: JSON.stringify({ endpoint: sub.endpoint })
            }).catch(() => {});
            await sub.unsubscribe().catch(() => {});
          }
        }
      }
    } catch {}

    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_tenant_id');
    setUser(null);
    setCurrentTenant(null);
  };

  const hasPermission = (permission: string) => {
    if (!currentTenant) return false;
    if (currentTenant.role === 'owner' || currentTenant.role === 'manager') return true;
    return currentTenant.permissions.includes(permission);
  };

  const updateCurrentTenant = (updates: Partial<TenantInfo>) => {
    setCurrentTenant(prev => prev ? { ...prev, ...updates } : null);
  };

  const updateUserProfile = async (updates: { fullName: string; phone?: string }) => {
    const res = await request<{ success: boolean; user: User }>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    if (res.user) {
      setUser(prev => prev ? { ...prev, fullName: res.user.fullName, phone: res.user.phone } : res.user);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await request<{ success: boolean; message: string }>('/auth/change-password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  };

  return (
    <AuthContext.Provider value={{ user, currentTenant, memberships, isLoading, login, logout, hasPermission, updateCurrentTenant, updateUserProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
