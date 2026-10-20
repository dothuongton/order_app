import React, { useEffect } from 'react';
import {
    Store, X, ExternalLink, Calendar, MapPin, Phone,
    User, Mail, Layers, DollarSign, ShoppingBag, Grid
} from 'lucide-react';
import { ShopDetail, ShopSummary } from '../../types/admin.js';

interface ShopDetailModalProps {
    shop: ShopDetail | ShopSummary | null;
    onClose: () => void;
    onEdit?: (shop: ShopSummary) => void;
    onToggleStatus?: (shop: ShopSummary) => void;
}

export const ShopDetailModal: React.FC<ShopDetailModalProps> = ({
    shop,
    onClose,
    onEdit,
    onToggleStatus
}) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!shop) return null;

    const statusBadge = () => {
        switch (shop.status) {
            case 'active':
                return <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">HOẠT ĐỘNG</span>;
            case 'suspended':
                return <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30">TẠM DỪNG</span>;
            case 'draft':
                return <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30">BẢN NHÁP</span>;
            case 'archived':
                return <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-slate-500/20 text-slate-400 border border-slate-500/30">LƯU TRỮ</span>;
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
                {/* Header */}
                <div className="p-5 border-b border-slate-800 flex items-start justify-between sticky top-0 bg-slate-900/95 backdrop-blur-xs z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                            <Store className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-extrabold text-base text-white">{shop.name}</h3>
                                {statusBadge()}
                            </div>
                            <p className="text-xs font-mono text-indigo-300 mt-0.5">slug: /{shop.slug}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 space-y-5 text-xs">
                    {/* Metrics Overview */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl text-center">
                            <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center justify-center gap-1">
                                <Grid className="w-3 h-3 text-indigo-400" />
                                Quy Mô Bàn
                            </span>
                            <div className="text-lg font-black text-white mt-1">{shop.tableCount || 0} bàn</div>
                        </div>

                        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl text-center">
                            <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center justify-center gap-1">
                                <ShoppingBag className="w-3 h-3 text-orange-400" />
                                Tổng Đơn
                            </span>
                            <div className="text-lg font-black text-white mt-1">{shop.orderCount || 0} đơn</div>
                        </div>

                        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl text-center">
                            <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center justify-center gap-1">
                                <DollarSign className="w-3 h-3 text-emerald-400" />
                                Doanh Thu Chốt
                            </span>
                            <div className="text-lg font-black text-emerald-400 mt-1">
                                {(shop.totalRevenue || 0).toLocaleString('vi-VN')}đ
                            </div>
                        </div>
                    </div>

                    {/* Shop Details */}
                    <div className="p-4 bg-slate-950/50 border border-slate-800/80 rounded-2xl space-y-2.5">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                            Thông Tin Cửa Hàng
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
                            <div className="flex items-center gap-2">
                                <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span>Số điện thoại: <strong>{shop.phone || 'Chưa cung cấp'}</strong></span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Layers className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span>Template: <strong>{shop.activeTemplateId} (v{shop.activePublishedVersion})</strong></span>
                            </div>
                            <div className="flex items-start gap-2 sm:col-span-2">
                                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                                <span>Địa chỉ: <strong>{shop.address || 'Chưa cập nhật'}</strong></span>
                            </div>
                            {(shop as ShopDetail).description && (
                                <div className="sm:col-span-2 pt-1 border-t border-slate-850 text-slate-400">
                                    Mô tả: {(shop as ShopDetail).description}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Owner Account Details */}
                    <div className="p-4 bg-slate-950/50 border border-slate-800/80 rounded-2xl space-y-2.5">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                            Tài Khoản Chủ Quán (Owner)
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
                            <div className="flex items-center gap-2">
                                <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span>Họ tên: <strong>{shop.owner?.fullName || 'Chưa gán'}</strong></span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span>Email: <strong className="font-mono text-indigo-300">{shop.owner?.email || 'N/A'}</strong></span>
                            </div>
                            {shop.owner?.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    <span>SĐT chủ quán: <strong>{shop.owner.phone}</strong></span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Timestamps */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 font-mono">
                        <span className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            Ngày khởi tạo: {new Date(shop.createdAt).toLocaleString('vi-VN')}
                        </span>
                        {shop.updatedAt && (
                            <span>Cập nhật: {new Date(shop.updatedAt).toLocaleString('vi-VN')}</span>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex flex-wrap items-center justify-between gap-2 mt-auto">
                    <a
                        href="/staff"
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold rounded-xl transition flex items-center gap-1.5 text-xs"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Cổng Nhân Viên</span>
                    </a>

                    <div className="flex items-center gap-2">
                        {onToggleStatus && (
                            <button
                                onClick={() => {
                                    onClose();
                                    onToggleStatus(shop);
                                }}
                                className={`px-3 py-2 rounded-xl font-bold text-xs transition ${
                                    shop.status === 'active'
                                        ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30'
                                        : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30'
                                }`}
                            >
                                {shop.status === 'active' ? 'Tạm Dừng Quán' : 'Kích Hoạt Lại'}
                            </button>
                        )}

                        {onEdit && (
                            <button
                                onClick={() => {
                                    onClose();
                                    onEdit(shop);
                                }}
                                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-md"
                            >
                                Chỉnh Sửa
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold rounded-xl transition"
                        >
                            Đóng
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
