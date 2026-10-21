import React from 'react';
import { Search, Bell, Settings, User } from 'lucide-react';

interface AdminTopHeaderProps {
    searchValue: string;
    onSearchChange: (value: string) => void;
    onSearchSubmit?: () => void;
    adminName?: string;
    adminEmail?: string;
}

export const AdminTopHeader: React.FC<AdminTopHeaderProps> = ({
    searchValue,
    onSearchChange,
    onSearchSubmit,
    adminName = 'Super Admin',
    adminEmail = 'superadmin@qrorder.vn'
}) => {
    return (
        <header className="h-18 bg-white border-b border-slate-200/80 px-8 flex items-center justify-between sticky top-0 z-20">
            {/* Search Input Bar (matching image 2) */}
            <div className="relative w-80 md:w-96">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                    type="text"
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && onSearchSubmit) {
                            onSearchSubmit();
                        }
                    }}
                    placeholder="Tìm kiếm quán, email chủ quán, slug..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-100/80 border-0 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all outline-hidden font-medium"
                />
            </div>

            {/* Right Tools & User Profile */}
            <div className="flex items-center gap-4">
                {/* Notifications (truthful read-only / no fake alert) */}
                <button
                    disabled
                    className="relative p-2 rounded-xl text-slate-400 opacity-60 cursor-not-allowed"
                    title="Thông báo hệ thống (Sẽ hỗ trợ trong giai đoạn sau)"
                >
                    <Bell className="w-5 h-5" />
                </button>

                {/* Settings Gear (truthful static info / no fake alert) */}
                <button
                    disabled
                    className="p-2 rounded-xl text-slate-400 opacity-60 cursor-not-allowed"
                    title="Cài đặt nền tảng (Platform v1.2)"
                >
                    <Settings className="w-5 h-5" />
                </button>

                <div className="h-6 w-px bg-slate-200 mx-1" />

                {/* User Avatar & Name */}
                <div className="flex items-center gap-3 pl-1">
                    <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-sm shadow-xs">
                        <User className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="hidden sm:block text-left">
                        <p className="text-sm font-bold text-slate-800 leading-tight">{adminName}</p>
                        <p className="text-xs text-slate-400 leading-tight">{adminEmail}</p>
                    </div>
                </div>
            </div>
        </header>
    );
};
