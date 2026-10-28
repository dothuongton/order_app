import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export interface CancelModalTarget {
  id: string;
  name: string;
  quantity: number;
  tableNumber?: string;
  isServed?: boolean;
}

export interface CancelConfirmPayload {
  quantity: number;
  reason: string;
  markOutOfStock: boolean;
}

interface CancelItemModalProps {
  item: CancelModalTarget | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: CancelConfirmPayload) => void | Promise<void>;
  isSubmitting?: boolean;
}

export const CancelItemModal: React.FC<CancelItemModalProps> = ({
  item,
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false
}) => {
  const [cancelQty, setCancelQty] = useState<number>(1);
  const [cancelReason, setCancelReason] = useState<string>('Hết nguyên liệu');
  const [markItemOutOfStock, setMarkItemOutOfStock] = useState<boolean>(true);

  // Sync state whenever target item changes or modal opens
  useEffect(() => {
    if (item) {
      setCancelQty(item.quantity);
      setCancelReason(item.isServed ? 'Khách trả món / Đổi ý' : 'Hết nguyên liệu');
      setMarkItemOutOfStock(!item.isServed);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    await onConfirm({
      quantity: cancelQty,
      reason: cancelReason,
      markOutOfStock: markItemOutOfStock
    });
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="min-w-0 pr-2">
            <h3 className="font-extrabold text-slate-900 text-base truncate">
              Hủy món: {item.name}
            </h3>
            {item.tableNumber && (
              <p className="text-xs text-slate-500">Bàn {item.tableNumber}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quantity */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Số lượng cần hủy
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={item.quantity}
                value={cancelQty}
                onChange={(e) =>
                  setCancelQty(
                    Math.max(1, Math.min(item.quantity, parseInt(e.target.value) || 1))
                  )
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-center text-slate-900 text-base focus:border-[var(--brand-accent)] focus:ring-1 focus:ring-[var(--brand-accent)]"
              />
              <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                / {item.quantity}
              </span>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Lý do hủy đơn
            </label>
            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-800 focus:border-[var(--brand-accent)] focus:ring-1 focus:ring-[var(--brand-accent)]"
            >
              <option value="Khách trả món / Đổi ý">Khách trả món / Đổi ý</option>
              <option value="Hết nguyên liệu">Hết nguyên liệu</option>
              <option value="Hết món">Hết món</option>
              <option value="Khách đổi ý trước khi làm">Khách đổi ý trước khi làm</option>
              <option value="Lý do khác">Lý do khác</option>
            </select>
          </div>

          {/* Out of Stock Checkbox */}
          <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700 bg-amber-50/80 p-3 rounded-xl border border-amber-200 select-none">
            <input
              type="checkbox"
              checked={markItemOutOfStock}
              onChange={(e) => setMarkItemOutOfStock(e.target.checked)}
              className="w-4 h-4 rounded text-[var(--brand-accent)] focus:ring-[var(--brand-accent)] mt-0.5"
            />
            <div>
              <span className="font-bold text-amber-900 block">
                Đánh dấu hết hàng trên thực đơn
              </span>
              <span className="text-[11px] text-amber-700 leading-tight block mt-0.5">
                Khách quét QR sẽ thấy món tạm ngưng và không thể đặt thêm.
              </span>
            </div>
          </label>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs min-h-[44px] hover:bg-slate-50 transition cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs shadow-md min-h-[44px] transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Đang hủy…' : 'Xác nhận hủy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
