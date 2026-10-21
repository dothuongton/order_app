import React from 'react';
import {
    LayoutDashboard,
    Store,
    ShieldCheck,
    History,
    BarChart3,
    Plus,
    HelpCircle,
    LogOut
} from 'lucide-react';

export type AdminTab = 'dashboard' | 'shops' | 'roles' | 'audit' | 'analytics';

interface AdminSidebarProps {
    activeTab: AdminTab;
    onTabChange: (tab: AdminTab) => void;
    onCreateShopClick: () => void;
    onLogout: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
    activeTab,
    onTabChange,
    onCreateShopClick,
    onLogout
}) => {
    const navItems = [
        { id: 'dashboard' as AdminTab, label: 'Dashboard', icon: LayoutDashboard },
        { id: 'shops' as AdminTab, label: 'Quản lý Quán', icon: Store },
        { id: 'roles' as AdminTab, label: 'Phân quyền', icon: ShieldCheck },
        { id: 'audit' as AdminTab, label: 'Lịch sử thao tác', icon: History },
        { id: 'analytics' as AdminTab, label: 'Analytics', icon: BarChart3 }
    ];

    return (
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-screen sticky top-0 select-none">
            {/* Brand Header */}
            <div className="p-6 pb-8 flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-md shadow-blue-500/25">
                    A
                </div>
                <div>
                    <h1 className="text-base font-bold text-slate-900 leading-tight">Admin Center</h1>
                    <p className="text-xs text-slate-500 font-medium">QR Order Platform</p>
                </div>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onTabChange(item.id)}
                            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl font-semibold text-sm transition-all duration-150 ${
                                isActive
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                            }`}
                        >
                            <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}

                {/* Big Primary CTA Button in Sidebar */}
                <div className="pt-8 px-1">
                    <button
                        onClick={onCreateShopClick}
                        className="w-full flex items-center justify-center gap-2.5 py-3.5 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-full shadow-lg shadow-blue-500/25 hover:shadow-blue-500/35 transition-all duration-200 active:scale-98"
                    >
                        <Plus className="w-4 h-4 stroke-[3]" />
                        <span>Tạo Quán Mới</span>
                    </button>
                </div>
            </nav>

            {/* Footer Items */}
            <div className="p-4 border-t border-slate-100 space-y-1">
                <a
                    href="mailto:support@qrorder.vn?subject=[QR%20Order]%20Y%C3%AAu%20c%E1%BA%A7u%20h%E1%BB%97%20tr%E1%BB%A3%20Super%20Admin"
                    title="Liên hệ đội ngũ hỗ trợ kỹ thuật: support@qrorder.vn"
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 rounded-xl font-medium text-sm transition"
                >
                    <HelpCircle className="w-4 h-4 text-slate-400" />
                    <span>Hỗ trợ</span>
                </a>
                <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-medium text-sm transition"
                >
                    <LogOut className="w-4 h-4 text-slate-400 hover:text-rose-600" />
                    <span>Đăng xuất</span>
                </button>
            </div>
        </aside>
    );
};
