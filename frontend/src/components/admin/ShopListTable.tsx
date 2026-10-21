import React from 'react';
import {
    Store,
    CheckCircle2,
    AlertTriangle,
    Archive,
    ChevronRight,
    ChevronLeft,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    AlertCircle,
    RotateCcw
} from 'lucide-react';
import { ShopSummary, PaginationMeta } from '../../types/admin.js';
import { ShopSortField, SortOrder } from '../../hooks/admin/useAdminShopList.js';

interface ShopListTableProps {
    shops: ShopSummary[];
    pagination: PaginationMeta | null;
    currentStatus: string;
    onStatusChange: (status: string) => void;
    onPageChange: (page: number) => void;
    onSelectShop: (shop: ShopSummary) => void;
    onCreateShopClick: () => void;
    isLoading?: boolean;
    error?: string | null;
    onRetry?: () => void;
    sortBy?: ShopSortField;
    sortOrder?: SortOrder;
    onSortChange?: (field: ShopSortField, order?: SortOrder) => void;
    searchQuery?: string;
    onClearSearch?: () => void;
}

export const ShopListTable: React.FC<ShopListTableProps> = ({
    shops,
    pagination,
    currentStatus,
    onStatusChange,
    onPageChange,
    onSelectShop,
    onCreateShopClick,
    isLoading = false,
    error = null,
    onRetry,
    sortBy = 'created_at',
    sortOrder = 'desc',
    onSortChange,
    searchQuery = '',
    onClearSearch
}) => {
    const statusTabs: { id: string; label: string }[] = [
        { id: 'all', label: 'Tất cả quán' },
        { id: 'active', label: 'Đang hoạt động' },
        { id: 'suspended', label: 'Đang tạm dừng' },
        { id: 'archived', label: 'Đã lưu trữ' }
    ];

    const renderSortIcon = (field: ShopSortField) => {
        if (sortBy !== field) {
            return <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover/sort:text-slate-500 transition ml-1" />;
        }
        if (sortOrder === 'asc') {
            return <ArrowUp className="w-3 h-3 text-blue-600 transition ml-1" />;
        }
        return <ArrowDown className="w-3 h-3 text-blue-600 transition ml-1" />;
    };

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

                <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
                    {searchQuery && onClearSearch && (
                        <button
                            onClick={onClearSearch}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                        >
                            <span>Khớp với: &quot;{searchQuery}&quot;</span>
                            <span className="text-slate-400 hover:text-slate-700 ml-1">✕</span>
                        </button>
                    )}
                    {pagination ? (
                        <span>
                            Tổng cộng: <strong className="text-slate-700">{pagination.total}</strong> quán
                        </span>
                    ) : null}
                </div>
            </div>

            {/* Error Banner State */}
            {error ? (
                <div className="p-12 text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                        <AlertCircle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-800">Không thể tải dữ liệu quán</p>
                        <p className="text-xs text-rose-600 max-w-md mx-auto">{error}</p>
                    </div>
                    {onRetry && (
                        <button
                            onClick={onRetry}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Thử lại</span>
                        </button>
                    )}
                </div>
            ) : (
                /* Table Content */
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                {/* Name Sort Header */}
                                <th
                                    className="py-3.5 px-6 cursor-pointer select-none group/sort hover:text-slate-700 transition"
                                    onClick={() => onSortChange && onSortChange('name')}
                                >
                                    <div className="flex items-center">
                                        <span>Tên Quán & Đường dẫn</span>
                                        {renderSortIcon('name')}
                                    </div>
                                </th>
                                <th className="py-3.5 px-6">Chủ Quán</th>

                                {/* Orders Sort Header */}
                                <th
                                    className="py-3.5 px-6 text-center cursor-pointer select-none group/sort hover:text-slate-700 transition"
                                    onClick={() => onSortChange && onSortChange('orders')}
                                >
                                    <div className="flex items-center justify-center">
                                        <span>Bàn & Đơn</span>
                                        {renderSortIcon('orders')}
                                    </div>
                                </th>

                                {/* Revenue Sort Header */}
                                <th
                                    className="py-3.5 px-6 text-right cursor-pointer select-none group/sort hover:text-slate-700 transition"
                                    onClick={() => onSortChange && onSortChange('revenue')}
                                >
                                    <div className="flex items-center justify-end">
                                        <span>Doanh Thu</span>
                                        {renderSortIcon('revenue')}
                                    </div>
                                </th>

                                <th className="py-3.5 px-6 text-center">Trạng Thái</th>
                                <th className="py-3.5 px-6 text-right">Chi Tiết</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="py-16 text-center text-slate-400">
                                        <div className="space-y-3 max-w-sm mx-auto">
                                            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                                            <p className="text-xs text-slate-400 font-medium">Đang tải danh sách cơ sở quán...</p>
                                        </div>
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
                                                {searchQuery
                                                    ? `Không tìm thấy cơ sở nào khớp với từ khóa "${searchQuery}".`
                                                    : currentStatus !== 'all'
                                                    ? 'Không có cơ sở nào trong trạng thái đã chọn.'
                                                    : 'Chưa có cơ sở quán nào được khởi tạo trên hệ thống.'}
                                            </p>
                                            <div className="flex items-center justify-center gap-2 pt-1">
                                                {searchQuery && onClearSearch ? (
                                                    <button
                                                        onClick={onClearSearch}
                                                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                                                    >
                                                        Xóa bộ lọc tìm kiếm
                                                    </button>
                                                ) : currentStatus !== 'all' ? (
                                                    <button
                                                        onClick={() => onStatusChange('all')}
                                                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                                                    >
                                                        Xem tất cả quán
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={onCreateShopClick}
                                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition"
                                                    >
                                                        + Tạo quán mới ngay
                                                    </button>
                                                )}
                                            </div>
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
            )}

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && !error && (
                <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div>
                        Trang <span className="font-bold text-slate-900">{pagination.page}</span> /{' '}
                        <span className="font-bold text-slate-900">{pagination.totalPages}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onPageChange(pagination.page - 1)}
                            disabled={pagination.page <= 1 || isLoading}
                            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onPageChange(pagination.page + 1)}
                            disabled={pagination.page >= pagination.totalPages || isLoading}
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
