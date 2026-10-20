import React from 'react';
import {
    Search, Plus, Eye, Edit3, XCircle, CheckCircle,
    ExternalLink, ChevronLeft, ChevronRight, Store, ArrowUpDown
} from 'lucide-react';
import { ShopSummary, PaginationMeta, ShopStatus } from '../../types/admin.js';
import { EmptyState } from './EmptyState.js';

interface ShopListTableProps {
    shops: ShopSummary[];
    pagination: PaginationMeta;
    loading: boolean;
    searchQuery: string;
    onSearchChange: (val: string) => void;
    statusFilter: string;
    onStatusFilterChange: (val: string) => void;
    sortBy: 'created_at' | 'name' | 'revenue' | 'orders';
    onSortByChange: (val: 'created_at' | 'name' | 'revenue' | 'orders') => void;
    onPageChange: (newPage: number) => void;
    onCreateClick: () => void;
    onViewDetail: (shop: ShopSummary) => void;
    onEditShop: (shop: ShopSummary) => void;
    onToggleStatus: (shop: ShopSummary) => void;
}

export const ShopListTable: React.FC<ShopListTableProps> = ({
    shops,
    pagination,
    loading,
    searchQuery,
    onSearchChange,
    statusFilter,
    onStatusFilterChange,
    sortBy,
    onSortByChange,
    onPageChange,
    onCreateClick,
    onViewDetail,
    onEditShop,
    onToggleStatus
}) => {
    const renderStatusBadge = (status: ShopStatus) => {
        switch (status) {
            case 'active':
                return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">HOẠT ĐỘNG</span>;
            case 'suspended':
                return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30">TẠM DỪNG</span>;
            case 'draft':
                return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30">BẢN NHÁP</span>;
            case 'archived':
                return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-500/20 text-slate-400 border border-slate-500/30">LƯU TRỮ</span>;
        }
    };

    return (
        <div className="space-y-4">
            {/* Toolbar: Search, Filters, Sorting & CTA */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[220px] max-w-sm">
                        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder="Tìm tên quán, slug, email chủ..."
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition"
                        />
                    </div>

                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => onStatusFilterChange(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-hidden focus:border-indigo-500"
                    >
                        <option value="all">Tất cả trạng thái</option>
                        <option value="active">Đang hoạt động</option>
                        <option value="suspended">Tạm dừng (Khóa)</option>
                        <option value="draft">Bản nháp</option>
                        <option value="archived">Đã lưu trữ</option>
                    </select>

                    {/* Sort Selector */}
                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-xs text-slate-400">
                        <ArrowUpDown className="w-3.5 h-3.5" />
                        <select
                            value={sortBy}
                            onChange={(e) => onSortByChange(e.target.value as any)}
                            className="bg-transparent border-none text-slate-300 text-xs focus:outline-hidden cursor-pointer"
                        >
                            <option value="created_at" className="bg-slate-900">Mới nhất</option>
                            <option value="name" className="bg-slate-900">Tên quán</option>
                            <option value="revenue" className="bg-slate-900">Doanh thu</option>
                            <option value="orders" className="bg-slate-900">Số đơn</option>
                        </select>
                    </div>
                </div>

                {/* Create Shop CTA */}
                <button
                    onClick={onCreateClick}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 min-h-[38px] shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    <span>Tạo Quán Mới</span>
                </button>
            </div>

            {/* Loading Skeleton */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl h-60" />
                    ))}
                </div>
            ) : shops.length === 0 ? (
                <EmptyState
                    icon={Store}
                    title="Không tìm thấy quán nào"
                    description={searchQuery || statusFilter !== 'all' ? 'Thử thay đổi từ khóa tìm kiếm hoặc bỏ bộ lọc trạng thái.' : 'Hệ thống chưa có quán nào. Hãy tạo quán đầu tiên ngay!'}
                    actionLabel={searchQuery || statusFilter !== 'all' ? undefined : 'Tạo Quán Đầu Tiên'}
                    onAction={onCreateClick}
                />
            ) : (
                /* Grid of Shops */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {shops.map((shop) => (
                        <div
                            key={shop.id}
                            className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 shadow-lg hover:border-slate-700 transition flex flex-col justify-between"
                        >
                            <div className="space-y-3">
                                {/* Title & Status Badge */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-extrabold text-sm text-white truncate" title={shop.name}>
                                                {shop.name}
                                            </h3>
                                            {renderStatusBadge(shop.status)}
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                                            /{shop.slug}
                                        </p>
                                    </div>
                                </div>

                                {/* Metadata Box */}
                                <div className="p-3 bg-slate-950/60 rounded-xl space-y-1.5 text-xs text-slate-300 border border-slate-850">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500 text-[11px]">Chủ quán:</span>
                                        <span className="font-semibold truncate max-w-[150px]">{shop.owner?.fullName || 'Chưa gán'}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500 text-[11px]">Email:</span>
                                        <span className="font-mono text-[11px] text-indigo-300 truncate max-w-[150px]">{shop.owner?.email || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500 text-[11px]">Quy mô:</span>
                                        <span>{shop.tableCount || 0} bàn • {shop.orderCount || 0} đơn</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                                        <span className="text-slate-500 text-[11px]">Doanh thu:</span>
                                        <span className="font-extrabold text-emerald-400">{(shop.totalRevenue || 0).toLocaleString('vi-VN')}đ</span>
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 pt-2 border-t border-slate-850">
                                <button
                                    onClick={() => onViewDetail(shop)}
                                    className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl transition text-xs font-semibold"
                                    title="Xem chi tiết quán"
                                >
                                    <Eye className="w-4 h-4" />
                                </button>

                                <button
                                    onClick={() => onEditShop(shop)}
                                    className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl transition text-xs font-semibold"
                                    title="Chỉnh sửa thông tin"
                                >
                                    <Edit3 className="w-4 h-4" />
                                </button>

                                <button
                                    onClick={() => onToggleStatus(shop)}
                                    className={`flex-1 py-2 px-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                                        shop.status === 'active'
                                            ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    }`}
                                >
                                    {shop.status === 'active' ? (
                                        <>
                                            <XCircle className="w-3.5 h-3.5" />
                                            <span>Khóa Quán</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            <span>Mở Khóa</span>
                                        </>
                                    )}
                                </button>

                                <a
                                    href="/staff"
                                    className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 rounded-xl transition text-xs"
                                    title="Đến cổng nhân viên"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-400">
                    <div>
                        Hiển thị <strong>{shops.length}</strong> / <strong>{pagination.total}</strong> quán (Trang {pagination.page}/{pagination.totalPages})
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onPageChange(pagination.page - 1)}
                            disabled={pagination.page <= 1}
                            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 transition"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-white">
                            {pagination.page} / {pagination.totalPages}
                        </div>

                        <button
                            onClick={() => onPageChange(pagination.page + 1)}
                            disabled={pagination.page >= pagination.totalPages}
                            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 transition"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
