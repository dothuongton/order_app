import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Archive, Loader2 } from 'lucide-react';
import { ShopSummary, ShopStatus } from '../../types/admin.js';

interface LifecycleConfirmModalProps {
    shop: ShopSummary;
    targetStatus: ShopStatus;
    onClose: () => void;
    onConfirm: (shopId: string, status: ShopStatus) => Promise<void>;
}

export const LifecycleConfirmModal: React.FC<LifecycleConfirmModalProps> = ({
    shop,
    targetStatus,
    onClose,
    onConfirm
}) => {
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleConfirm = async () => {
        setIsSubmitting(true);
        setErrorMsg(null);
        try {
            await onConfirm(shop.id, targetStatus);
            onClose();
        } catch (err: any) {
            setErrorMsg(err.message || 'Lỗi khi cập nhật trạng thái quán');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusInfo = () => {
        switch (targetStatus) {
            case 'suspended':
                return {
                    title: 'Xác Nhận Tạm Dừng Quán',
                    icon: AlertTriangle,
                    iconBg: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
                    badge: 'TẠM DỪNG (SUSPENDED)',
                    actionText: 'Tạm Dừng Ngay',
                    buttonColor: 'bg-rose-600 hover:bg-rose-700',
                    consequences: [
                        'Khách hàng quét mã QR sẽ bị chặn tạo đơn và không thể mở phiên mới.',
                        'Các bàn đang ngồi ăn dở dang vẫn được phục vụ và thanh toán chốt tiền bình thường.',
                        'Nhân viên và chủ quán vẫn có thể đăng nhập để đối soát hóa đơn.',
                        'Super Admin có thể mở khóa kích hoạt lại bất kỳ lúc nào.'
                    ]
                };
            case 'active':
                return {
                    title: 'Xác Nhận Kích Hoạt Lại Quán',
                    icon: CheckCircle,
                    iconBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
                    badge: 'HOẠT ĐỘNG (ACTIVE)',
                    actionText: 'Kích Hoạt Lại',
                    buttonColor: 'bg-emerald-600 hover:bg-emerald-700',
                    consequences: [
                        'Khách hàng quét mã QR có thể mở phiên và đặt món bình thường.',
                        'Các tính năng gọi món, thông báo realtime và thanh toán hoạt động đầy đủ.'
                    ]
                };
            case 'archived':
                return {
                    title: 'Xác Nhận Lưu Trữ Quán (Ngừng Kinh Doanh)',
                    icon: Archive,
                    iconBg: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
                    badge: 'LƯU TRỮ (ARCHIVED)',
                    actionText: 'Lưu Trữ Quán',
                    buttonColor: 'bg-slate-700 hover:bg-slate-600',
                    consequences: [
                        'Quán sẽ ngừng kinh doanh vĩnh viễn trên nền tảng.',
                        'Chính sách Zero Hard-Delete: Toàn bộ hóa đơn, đơn hàng và lịch sử doanh thu được bảo tồn 100% để phục vụ thuế và kiểm toán.',
                        'Dữ liệu không bị xóa khỏi hệ thống.'
                    ]
                };
            default:
                return {
                    title: 'Xác Nhận Chuyển Trạng Thái',
                    icon: AlertTriangle,
                    iconBg: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
                    badge: targetStatus.toUpperCase(),
                    actionText: 'Xác Nhận',
                    buttonColor: 'bg-indigo-600 hover:bg-indigo-700',
                    consequences: ['Hệ thống sẽ cập nhật trạng thái quán.']
                };
        }
    };

    const info = getStatusInfo();
    const Icon = info.icon;

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                {/* Header with Icon */}
                <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${info.iconBg}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-extrabold text-white text-base leading-snug">{info.title}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Quán: <strong className="text-white">{shop.name}</strong> (<span className="font-mono">/{shop.slug}</span>)
                        </p>
                    </div>
                </div>

                {/* Error Banner */}
                {errorMsg && (
                    <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-semibold">
                        {errorMsg}
                    </div>
                )}

                {/* Status transition indicator */}
                <div className="p-3 bg-slate-950/70 border border-slate-850 rounded-2xl text-xs flex items-center justify-between">
                    <div className="text-slate-400">
                        Hiện tại: <strong className="text-slate-200 uppercase">{shop.status}</strong>
                    </div>
                    <div className="text-slate-600 font-bold">➔</div>
                    <div className="text-indigo-400">
                        Dự kiến: <strong className="text-indigo-300">{info.badge}</strong>
                    </div>
                </div>

                {/* Operational Consequences List */}
                <div className="p-3.5 bg-slate-950/40 border border-slate-800/80 rounded-2xl space-y-2 text-xs">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        Tác Động Thực Tế (Core Policy):
                    </span>
                    <ul className="space-y-1.5 text-slate-300">
                        {info.consequences.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-1.5 text-[11px] leading-relaxed">
                                <span className="text-indigo-400 mt-0.5">•</span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-2.5 pt-2">
                    <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={onClose}
                        className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl transition text-xs"
                    >
                        Hủy Bỏ
                    </button>
                    <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleConfirm}
                        className={`flex-1 py-2.5 text-white font-bold rounded-xl shadow-lg transition text-xs flex items-center justify-center gap-2 ${info.buttonColor}`}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Đang Cập Nhật...</span>
                            </>
                        ) : (
                            <span>{info.actionText}</span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
