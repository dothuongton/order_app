import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Lock, Mail, Store, UserCheck, ArrowRight } from 'lucide-react';
import { getStaffThemeCssVars } from '../../lib/theme.js';

export const StaffLogin: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const savedTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('staff_theme_color') : null;
  const loginThemeStyles = useMemo(() => {
    return getStaffThemeCssVars(savedTheme || undefined, 'comfortable');
  }, [savedTheme]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setErrorMessage(err.message || 'Email hoặc mật khẩu không chính xác');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (quickEmail: string) => {
    setEmail(quickEmail);
    setPassword('123456');
    login(quickEmail, '123456').catch((err: any) => {
      setErrorMessage(err.message || 'Lỗi đăng nhập');
    });
  };

  return (
    <div
      className="staff-portal min-h-screen bg-slate-100 flex items-center justify-center p-4 transition-colors"
      style={loginThemeStyles}
    >
      <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-6 border border-slate-200/80 staff-density-card">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-orange-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-orange-500/30">
            <Store className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">QR Order Staff v1.2</h1>
          <p className="text-xs text-slate-500">Đăng nhập tài khoản nhân viên hoặc quản lý quán</p>
        </div>

        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@phoco.vn"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full min-h-[48px] bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-50 text-white font-bold rounded-xl py-3 px-4 shadow-md flex items-center justify-center gap-2 transition"
          >
            {isLoading ? <span>Đang xử lý...</span> : <span>Đăng nhập</span>}
          </button>
        </form>

        {/* Demo Fast Login Buttons */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block text-center">
            Tài khoản mẫu thử nghiệm
          </span>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleQuickLogin('admin@phoco.vn')}
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition"
            >
              <span className="font-bold text-xs text-slate-800 block">Quản lý</span>
              <span className="text-[10px] text-slate-500">Toàn quyền</span>
            </button>
            <button
              onClick={() => handleQuickLogin('phucvu@phoco.vn')}
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition"
            >
              <span className="font-bold text-xs text-slate-800 block">Phục vụ</span>
              <span className="text-[10px] text-slate-500">Mở & nhận món</span>
            </button>
            <button
              onClick={() => handleQuickLogin('thungan@phoco.vn')}
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition"
            >
              <span className="font-bold text-xs text-slate-800 block">Thu ngân</span>
              <span className="text-[10px] text-slate-500">Xác nhận tiền</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
