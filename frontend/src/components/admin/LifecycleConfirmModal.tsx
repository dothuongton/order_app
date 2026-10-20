import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Archive, X } from 'lucide-react';
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const confirmButtonRef = useRef<HTMLButtonElement>(null);

    // ESC key closes modal (Issue #88)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isSubmitting) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, isSubmitting]);

    // Focus confirm button on open
    useEffect(() => {
        const timer = setTimeout(() => confirmButtonRef.current?.focus(), 60);
        return () => clearTimeout(timer);
    }, []);

    const getModalContent = () => {
        switch (targetStatus) {
            case 'suspended':
                return {
                    title: 'Tạm Dừng Hoạt Động Quán',
                    icon: AlertTriangle,
                    iconBg: 'bg-amber-50 text-amber-600',
                    confirmBtnBg: 'bg-amber-600 hover:bg-amber-700',
                    confirmText: 'Xác Nhận Tạm Dừng',
                    message: `Bạn có chắc chắn muốn tạm dừng hoạt động quán "${shop.name}"? Khách hàng và nhân viên sẽ tạm thời bị chặn đặt món mới cho đến khi quán được kích hoạt trở lại.`
                };
            case 'archived':
                return {
                    title: 'Lưu Trữ Quán (Zero Hard-Delete)',
                    icon: Archive,
                    iconBg: 'bg-rose-50 text-rose-600',
                    confirmBtnBg: 'bg-rose-600 hover:bg-rose-700',
                    confirmText: 'Xác Nhận Lưu Trữ',
                    message: `Lưu trữ quán "${shop.name}" sẽ ẩn quán khỏi danh sách hoạt động nhưng BẢO TOÀN toàn bộ lịch sử hóa đơn, thực đơn và số liệu tài chính theo đúng nguyên tắc không xóa cứng dữ liệu. Lưu ý: Không thể lưu trữ khi quán vẫn còn bàn mở chưa tất toán.`
                };
            case 'active':
            default:
                return {
                    title: 'Kích Hoạt Lại Quán',
                    icon: CheckCircle2,
                    iconBg: 'bg-emerald-50 text-emerald-600',
                    confirmBtnBg: 'bg-blue-600 hover:bg-blue-700',
                    confirmText: 'Kích Hoạt Ngay',
                    message: `Khôi phục quán "${shop.name}" về trạng thái hoạt động bình thường. Khách quét mã QR và nhân viên có thể tiếp tục sử dụng hệ thống.`
                };
        }
    };

    const content = getModalContent();
    const Icon = content.icon;

    const handleConfirm = async () => {
        try {
            setIsSubmitting(true);
            setError(null);
            await onConfirm(shop.id, targetStatus);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Thao tác không thành công.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <div
                className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="lifecycle-confirm-title"
                aria-describedby="lifecycle-confirm-desc"
            >
                <div className="p-6">
                    <div className="flex items-start justify-between">
                        <div className={`w-12 h-12 rounded-2xl ${content.iconBg} flex items-center justify-center`}>
                            <Icon className="w-6 h-6 stroke-[2.2]" />
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="mt-4">
                        <h3 id="lifecycle-confirm-title" className="text-lg font-bold text-slate-900">{content.title}</h3>
                        <p id="lifecycle-confirm-desc" className="text-xs text-slate-500 mt-2 leading-relaxed">{content.message}</p>
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-start gap-2.5 animate-in fade-in"
                        >
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{error}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-3 mt-6">
                        <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={onClose}
                            className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                        >
                            Hủy
                        </button>
                        <button
                            ref={confirmButtonRef}
                            type="button"
                            disabled={isSubmitting}
                            onClick={handleConfirm}
                            className={`flex-1 py-3 px-4 ${content.confirmBtnBg} disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-98`}
                        >
                            {isSubmitting ? 'Đang xử lý...' : content.confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
