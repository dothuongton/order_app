import React, { useState, useEffect, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { PushProvider } from './context/PushContext.js';
import { GuestProvider } from './context/GuestContext.js';
import { NotificationProvider } from './context/NotificationContext.js';
import { Store, QrCode, Shield, ArrowRight, ShieldCheck } from 'lucide-react';

const GuestLanding = React.lazy(() => import('./pages/guest/GuestLanding.js').then(m => ({ default: m.GuestLanding })));
const StaffLogin = React.lazy(() => import('./pages/staff/StaffLogin.js').then(m => ({ default: m.StaffLogin })));
const StaffDashboard = React.lazy(() => import('./pages/staff/StaffDashboard.js').then(m => ({ default: m.StaffDashboard })));
const AdminLogin = React.lazy(() => import('./pages/admin/AdminLogin.js').then(m => ({ default: m.AdminLogin })));
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard.js').then(m => ({ default: m.AdminDashboard })));

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

function StaffApp() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <RouteLoadingFallback />;
  }

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {user ? <StaffDashboard /> : <StaffLogin />}
    </Suspense>
  );
}

function AdminApp() {
  const [adminUser, setAdminUser] = useState<any>(() => {
    try {
      const stored = localStorage.getItem('admin_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const handleLoginSuccess = (user: any, token: string) => {
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_user', JSON.stringify(user));
    setAdminUser(user);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${(import.meta as any).env?.VITE_API_URL || ''}/api/v1/auth/logout`, { method: 'POST', credentials: 'include', headers: { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` } });
    } catch {}
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setAdminUser(null);
  };

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {!adminUser ? (
        <AdminLogin onLoginSuccess={handleLoginSuccess} />
      ) : (
        <AdminDashboard user={adminUser} onLogout={handleLogout} />
      )}
    </Suspense>
  );
}

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 1. Guest QR Link: /t/:qrId
  const matchTable = currentPath.match(/^\/t\/([^/?#]+)/);
  if (matchTable) {
    const qrId = matchTable[1];
    const params = new URLSearchParams(window.location.search);
    const rawStaffSession=params.get('staffSession') || '';
    const validStaffSession=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(rawStaffSession);
    const staffSessionId = params.has('staffSession') ? (validStaffSession ? rawStaffSession : 'invalid') : undefined;
    return (
      <NotificationProvider>
        <GuestProvider key={`${qrId}:${staffSessionId || 'guest'}`} staffSessionId={staffSessionId}>
          <Suspense fallback={<RouteLoadingFallback />}>
            <GuestLanding qrId={qrId} />
          </Suspense>
        </GuestProvider>
      </NotificationProvider>
    );
  }

  // 1b. Store Slug Link: /ola-ngon-ngot or legacy /pho-co -> Directly view store table A01
  const isOlaSlug = /^\/(ola-ngon-ngot|pho-co)\/?$/.test(currentPath);
  if (isOlaSlug) {
    return (
      <NotificationProvider>
        <GuestProvider>
          <Suspense fallback={<RouteLoadingFallback />}>
            <GuestLanding qrId="qr-phoco-a01" />
          </Suspense>
        </GuestProvider>
      </NotificationProvider>
    );
  }

  // 2. Staff Portal: /staff
  if (currentPath === '/staff' || currentPath.startsWith('/staff/')) {
    return (
      <NotificationProvider>
        <AuthProvider>
          <PushProvider>
            <StaffApp />
          </PushProvider>
        </AuthProvider>
      </NotificationProvider>
    );
  }

  // 3. Super Admin Portal: /admin
  if (currentPath === '/admin' || currentPath.startsWith('/admin/')) {
    return (
      <NotificationProvider>
        <AdminApp />
      </NotificationProvider>
    );
  }

  // 4. Root Portal Landing
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-850 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-orange-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-orange-600/30">
            <Store className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">QR Ordering PWA v1.2</h1>
          <p className="text-xs text-slate-400">Hệ thống gọi món tại bàn đa quán & Multi-Tenant CMS</p>
        </div>

        <div className="space-y-3">
          <a
            href="/admin"
            className="block p-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-md group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-indigo-200" />
                <div>
                  <div className="text-sm font-extrabold">Cổng Super Admin</div>
                  <div className="text-[11px] text-indigo-100 font-normal">Quản lý quán, templates, khóa/kích hoạt</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
            </div>
          </a>

          <a
            href="/staff"
            className="block p-4 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-bold transition shadow-md group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-orange-200" />
                <div>
                  <div className="text-sm font-extrabold">Cổng Nhân Viên & Quản Lý Quán</div>
                  <div className="text-[11px] text-orange-100 font-normal">Mở bàn, tiếp nhận món, CMS quán & thanh toán</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
            </div>
          </a>

          <div className="pt-3 border-t border-slate-800">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2 text-center">
              Khách quét mã QR mẫu thử nghiệm
            </span>

            <div className="space-y-2">
              <a
                href="/t/qr-phoco-a01"
                className="block p-3.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700/80 transition group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <QrCode className="w-4 h-4 text-orange-400" />
                    <div>
                      <div className="text-xs font-bold text-slate-200">Quét Bàn A01 (Phở Phố Cổ)</div>
                      <div className="text-[10px] text-slate-400">Mã QR: qr-phoco-a01</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-1 transition" />
                </div>
              </a>

              <a
                href="/t/qr-phoco-a02"
                className="block p-3.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700/80 transition group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <QrCode className="w-4 h-4 text-orange-400" />
                    <div>
                      <div className="text-xs font-bold text-slate-200">Quét Bàn A02 (Phở Phố Cổ)</div>
                      <div className="text-[10px] text-slate-400">Mã QR: qr-phoco-a02</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-1 transition" />
                </div>
              </a>
            </div>
          </div>
        </div>

        <div className="text-center text-[11px] text-slate-500 pt-2 border-t border-slate-800">
          <span>Trạng thái: Đặc tả v1.2 • Không tích hợp cổng thanh toán • Mobile-First PWA</span>
        </div>
      </div>
    </div>
  );
}
export default App;
