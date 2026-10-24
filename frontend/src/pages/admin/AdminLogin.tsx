import React, { useState, useEffect } from 'react';
import { request } from '../../api/client.js';
import { ShieldCheck, Lock, Mail, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';

interface AdminLoginProps {
    onLoginSuccess: (user: any, token: string) => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberPassword, setRememberPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        try {
            const savedEmail = localStorage.getItem('saved_admin_email');
            const savedPass = localStorage.getItem('saved_admin_password');
            if (savedEmail && savedPass) {
                setEmail(savedEmail);
                setPassword(savedPass);
                setRememberPassword(true);
            }
        } catch {
            // Ignore localStorage errors
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const data = await request<{ token: string; user: any }>('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            if (!data.user?.isPlatformAdmin) {
                throw new Error('Tài khoản này không có quyền Quản trị viên tối cao (Super Admin)');
            }

            if (rememberPassword) {
                localStorage.setItem('saved_admin_email', email);
                localStorage.setItem('saved_admin_password', password);
            } else {
                localStorage.removeItem('saved_admin_email');
                localStorage.removeItem('saved_admin_password');
            }

            localStorage.setItem('admin_token', data.token);
            onLoginSuccess(data.user, data.token);
        } catch (err: any) {
            setError(err.message || 'Đăng nhập Super Admin thất bại');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-indigo-600/30">
                        <ShieldCheck className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">Super Admin Portal</h1>
                    <p className="text-xs text-slate-400">Hệ thống quản trị đa quán (Multi-Tenant CMS) v1.2</p>
                </div>

                {error && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Quản Trị Hệ Thống</label>
                        <div className="relative">
                            <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="admin@example.com"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white focus:outline-hidden focus:border-indigo-500 transition"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">Mật Khẩu</label>
                        <div className="relative">
                            <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="••••••••"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-10 text-sm text-white focus:outline-hidden focus:border-indigo-500 transition"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1 cursor-pointer"
                                title={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-0.5">
                        <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-400 select-none">
                            <input
                                type="checkbox"
                                checked={rememberPassword}
                                onChange={(e) => setRememberPassword(e.target.checked)}
                                className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Lưu mật khẩu trên thiết bị</span>
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2 min-h-[46px]"
                    >
                        <span>{loading ? 'Đang xác thực...' : 'Đăng nhập Quản Trị Hệ Thống'}</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>
    );
};
