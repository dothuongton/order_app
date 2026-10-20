import React from 'react';
import { ArrowRight, Plus } from 'lucide-react';

interface DashboardHeroBannerProps {
    totalShops: number;
    activeShops: number;
    suspendedShops: number;
    onViewShops: () => void;
    onCreateShop: () => void;
}

export const DashboardHeroBanner: React.FC<DashboardHeroBannerProps> = ({
    totalShops,
    activeShops,
    suspendedShops,
    onViewShops,
    onCreateShop
}) => {
    return (
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-white via-blue-50/30 to-sky-50/50 p-8 border border-slate-200/80 shadow-xs mb-8">
            <div className="relative z-10 max-w-2xl">
                <span className="text-xs font-bold tracking-wider text-blue-600 uppercase">
                    HỆ THỐNG QUẢN TRỊ NỀN TẢNG
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1.5 tracking-tight">
                    Chào mừng trở lại,
                </h2>
                <p className="text-slate-600 text-sm sm:text-base mt-2.5 leading-relaxed font-normal">
                    Hôm nay hệ thống có{' '}
                    <span className="font-bold text-slate-900">{activeShops} quán</span> đang mở phục vụ trên tổng số{' '}
                    <span className="font-bold text-slate-900">{totalShops} quán</span>.
                    {suspendedShops > 0 ? (
                        <span className="text-rose-600 font-semibold ml-1">
                            Có {suspendedShops} quán đang tạm dừng cần rà soát.
                        </span>
                    ) : (
                        <span className="text-emerald-600 font-semibold ml-1">
                            Mọi hoạt động đều đang diễn ra ổn định.
                        </span>
                    )}
                </p>

                <div className="flex items-center gap-3.5 mt-6">
                    <button
                        onClick={onCreateShop}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-full shadow-md shadow-blue-500/20 transition-all active:scale-98"
                    >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                        <span>Tạo quán mới</span>
                    </button>
                    <button
                        onClick={onViewShops}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-bold text-sm rounded-full transition-all"
                    >
                        <span>Xem danh sách quán</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Subtle decorative background gradient circles */}
            <div className="absolute right-0 top-0 -mt-10 -mr-10 w-80 h-80 rounded-full bg-linear-to-b from-blue-100/40 to-sky-100/10 pointer-events-none blur-2xl" />
        </div>
    );
};
