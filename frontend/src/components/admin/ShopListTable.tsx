import React from 'react';
import {
    Store,
    CheckCircle2,
    AlertTriangle,
    Archive,
    ChevronRight,
    Users,
    Search,
    ChevronLeft
} from 'lucide-react';
import { ShopSummary, PaginationMeta, ShopStatus } from '../../types/admin.js';

interface ShopListTableProps {
    shops: ShopSummary[];
    pagination: PaginationMeta | null;
    currentStatus: string;
    onStatusChange: (status: string) => void;
    onPageChange: (page: number) => void;
    onSelectShop: (shop: ShopSummary) => void;
    onCreateShopClick: () => void;
    isLoading?: boolean;
}

export const ShopListTable: React.FC<ShopListTableProps> = ({
    shops,
    pagination,
    currentStatus,
    onStatusChange,
    onPageChange,
    onSelectShop,
    onCreateShopClick,
    isLoading = false
}) => {
    const statusTabs: { id: string; label: string; count?: number }[] = [
        { id: 'all', label: 'Tất cả quán' },
        { id: 'active', label: 'Đang hoạt động' },
        { id: 'suspended', label: 'Đang tạm dừng' },
        { id: 'archived', label: 'Đã lưu trữ' }
    ];

    return (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            {/* Filter Tabs Header */}
            <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 bg-slate-100/70 p-1 rounded-2xl">
                    {statusTabs.map((tab) => {
                        const isActive = currentStatus === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => onStatusChange(tab.id)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                    isActive
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                <div className="text-xs text-slate-400 font-medium">
                    {pagination ? `Tổng cộng: ${pagination.total} quán` : ''}
                </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            <th className="py-3.5 px-6">Tên Quán & Đường dẫn</th>
                            <th className="py-3.5 px-6">Chủ Quán</th>
                            <th className="py-3.5 px-6 text-center">Bàn & Đơn</th>
                            <th className="py-3.5 px-6 text-right">Doanh Thu</th>
                            <th className="py-3.5 px-6 text-center">Trạng Thái</th>
                            <th className="py-3.5 px-6 text-right">Chi Tiết</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                        {isLoading ? (
                            <tr>
                                <td colSpan={6} className="py-12 text-center text-slate-400">
                                    Đang tải dữ liệu...
                                </td>
                            </tr>
                        ) : shops.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-16 text-center">
                                    <div className="max-w-sm mx-auto space-y-3">
                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                                            <Store className="w-6 h-6" />
                                        </div>
                                        <p className="text-sm font-bold text-slate-700">Chưa có quán nào phù hợp</p>
                                        <p className="text-xs text-slate-400">
                                            Không tìm thấy quán nào trong trạng thái hoặc từ khóa tìm kiếm đã chọn.
                                        </p>
                                        <button
                                            onClick={onCreateShopClick}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition"
                                        >
                                            + Tạo quán mới ngay
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            shops.map((shop) => (
                                <tr
                                    key={shop.id}
                                    onClick={() => onSelectShop(shop)}
                                    className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                                >
                                    {/* Shop Name & Slug */}
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-3.5">
                                            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-base shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                                {shop.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900 group-hover:text-blue-600 transition">
                                                    {shop.name}
                                                </p>
                                                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                                    /{shop.slug}
                                                </p>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Owner */}
                                    <td className="py-4 px-6">
                                        {shop.owner ? (
                                            <div>
                                                <p className="font-semibold text-slate-800">{shop.owner.fullName}</p>
                                                <p className="text-[11px] text-slate-400 font-mono">{shop.owner.email}</p>
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 italic">Chưa gán</span>
                                        )}
                                    </td>

                                    {/* Tables & Orders */}
                                    <td className="py-4 px-6 text-center">
                                        <span className="font-bold text-slate-800">{shop.tableCount || 0}</span>
                                        <span className="text-slate-400 text-[11px] ml-1">bàn</span>
                                        <div className="text-[10px] text-slate-400">
                                            {shop.orderCount || 0} lượt gọi món
                                        </div>
                                    </td>

                                    {/* Revenue */}
                                    <td className="py-4 px-6 text-right">
                                        <span className="font-bold text-slate-900">
                                            {(shop.totalRevenue || 0).toLocaleString('vi-VN')} đ
                                        </span>
                                    </td>

                                    {/* Status Pill */}
                                    <td className="py-4 px-6 text-center">
                                        {shop.status === 'active' && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">
                                                <CheckCircle2 className="w-3 h-3" />
                                                Hoạt động
                                            </span>
                                        )}
                                        {shop.status === 'suspended' && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700">
                                                <AlertTriangle className="w-3 h-3" />
                                                Tạm dừng
                                            </span>
                                        )}
                                        {shop.status === 'archived' && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">
                                                <Archive className="w-3 h-3" />
                                                Lưu trữ
                                            </span>
                                        )}
                                    </td>

                                    {/* Action Arrow */}
                                    <td className="py-4 px-6 text-right">
                                        <div className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-blue-600 group-hover:text-white text-slate-400 transition">
                                            <ChevronRight className="w-4 h-4" />
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && (
                <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div>
                        Trang <span className="font-bold text-slate-900">{pagination.page}</span> /{' '}
                        <span className="font-bold text-slate-900">{pagination.totalPages}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onPageChange(pagination.page - 1)}
                            disabled={pagination.page <= 1}
                            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onPageChange(pagination.page + 1)}
                            disabled={pagination.page >= pagination.totalPages}
                            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
