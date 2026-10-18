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
}

interface AuthContextType {
  user: User | null;
  currentTenant: TenantInfo | null;
  memberships: any[];
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

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
            name: '',
            slug: '',
            role: res.user.role,
            permissions: res.user.permissions || []
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
      await request('/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_tenant_id');
    setUser(null);
    setCurrentTenant(null);
  };

  const hasPermission = (permission: string) => {
    if (!currentTenant) return false;
    if (currentTenant.role === 'owner' || currentTenant.role === 'manager' || currentTenant.role === 'cashier' || currentTenant.role === 'waiter') return true;
    return currentTenant.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider value={{ user, currentTenant, memberships, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
