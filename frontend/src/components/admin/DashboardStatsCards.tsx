import React from 'react';
import { Building2, AlertTriangle, TrendingUp, Clock, Archive } from 'lucide-react';
import { PlatformStats } from '../../types/admin.js';

interface DashboardStatsCardsProps {
    stats: PlatformStats | null;
    loading?: boolean;
}

export const DashboardStatsCards: React.FC<DashboardStatsCardsProps> = ({ stats, loading }) => {
    if (loading || !stats) {
        return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl h-24" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Shops Card */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1 hover:border-slate-700 transition">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    Tổng Số Quán
                </span>
                <div className="text-2xl font-black text-white">{stats.totalShops}</div>
                <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <span>{stats.activeShops} quán đang hoạt động</span>
                    {stats.archivedShops > 0 && (
                        <span className="text-slate-500 font-normal">({stats.archivedShops} đã lưu trữ)</span>
                    )}
                </div>
            </div>

            {/* Suspended Shops Card */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1 hover:border-slate-700 transition">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Quán Tạm Dừng
                </span>
                <div className="text-2xl font-black text-amber-400">{stats.suspendedShops}</div>
                <span className="text-[10px] text-slate-400">Đang bị khóa tạo đơn mới</span>
            </div>

            {/* Confirmed Revenue Card */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1 hover:border-slate-700 transition">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    Doanh Thu Đã Chốt
                </span>
                <div className="text-2xl font-black text-emerald-400">
                    {stats.totalRevenue.toLocaleString('vi-VN')}đ
                </div>
                <span className="text-[10px] text-slate-400">{stats.totalSettlements} lượt xác nhận thu</span>
            </div>

            {/* Total Orders Card */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1 hover:border-slate-700 transition">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-orange-400" />
                    Tổng Lượt Đặt Món
                </span>
                <div className="text-2xl font-black text-white">{stats.totalOrders}</div>
                <span className="text-[10px] text-slate-400">Lượt gọi món thành công</span>
            </div>
        </div>
    );
};
