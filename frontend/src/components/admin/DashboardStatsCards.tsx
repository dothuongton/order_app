import React from 'react';
import { Store, CheckCircle2, AlertTriangle, DollarSign } from 'lucide-react';
import { PlatformStats } from '../../types/admin.js';

interface DashboardStatsCardsProps {
    stats: PlatformStats | null;
    isLoading?: boolean;
}

export const DashboardStatsCards: React.FC<DashboardStatsCardsProps> = ({ stats, isLoading = false }) => {
    if (isLoading || !stats) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-36 rounded-3xl bg-white border border-slate-200/80 p-6 animate-pulse" />
                ))}
            </div>
        );
    }

    const cards = [
        {
            title: 'Tổng số Quán',
            value: stats.totalShops.toLocaleString('vi-VN'),
            subtitle: `${stats.activeShops} hoạt động, ${stats.archivedShops} lưu trữ`,
            icon: Store,
            badge: { text: '+12%', color: 'bg-emerald-50 text-emerald-600' },
            iconBg: 'bg-blue-50 text-blue-600'
        },
        {
            title: 'Quán Đang Mở',
            value: stats.activeShops.toLocaleString('vi-VN'),
            subtitle: 'Đang tiếp nhận đơn đặt món',
            icon: CheckCircle2,
            badge: { text: 'Hoạt động', color: 'bg-blue-50 text-blue-600' },
            iconBg: 'bg-emerald-50 text-emerald-600'
        },
        {
            title: 'Cần Rà Soát',
            value: stats.suspendedShops.toLocaleString('vi-VN'),
            subtitle: stats.suspendedShops > 0 ? 'Đang tạm dừng hoạt động' : 'Không có quán gián đoạn',
            icon: AlertTriangle,
            badge: {
                text: stats.suspendedShops > 0 ? 'Cần xử lý' : 'Bình thường',
                color: stats.suspendedShops > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
            },
            iconBg: stats.suspendedShops > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-500'
        },
        {
            title: 'Tổng Doanh Thu',
            value: `${stats.totalRevenue.toLocaleString('vi-VN')} đ`,
            subtitle: `Từ ${stats.totalSettlements} phiên tất toán`,
            icon: DollarSign,
            badge: { text: 'Nền tảng', color: 'bg-purple-50 text-purple-600' },
            iconBg: 'bg-purple-50 text-purple-600'
        }
    ];

    return (
        <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900">Tổng quan chỉ số</h3>
                <span className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer">
                    BÁO CÁO ĐẦY ĐỦ
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {cards.map((card, idx) => {
                    const Icon = card.icon;
                    return (
                        <div
                            key={idx}
                            className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow duration-200 flex flex-col justify-between"
                        >
                            <div className="flex items-center justify-between">
                                <div className={`w-11 h-11 rounded-2xl ${card.iconBg} flex items-center justify-center`}>
                                    <Icon className="w-5 h-5 stroke-[2.2]" />
                                </div>
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${card.badge.color}`}>
                                    {card.badge.text}
                                </span>
                            </div>

                            <div className="mt-5">
                                <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                                    {card.value}
                                </div>
                                <div className="text-sm font-semibold text-slate-700 mt-1">
                                    {card.title}
                                </div>
                                <div className="text-xs text-slate-400 mt-0.5">
                                    {card.subtitle}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
