import React from 'react';
import { Check, CheckCircle2, MoreVertical, UtensilsCrossed, X } from 'lucide-react';
import { CancelModalTarget } from './CancelItemModal.js';

export interface OrderItemRowData {
  orderItemId: string;
  name: string;
  quantity: number;
  status: string; // 'PENDING' | 'ACCEPTED' | 'SERVED' | 'CANCELLED'
  variantName?: string | null;
  note?: string | null;
  price?: number;
  subtotal?: number;
  rawPrice?: number;
  cancelReason?: string | null;
  partId?: string;
}

interface StaffOrderItemRowProps {
  item: OrderItemRowData;
  tableNumber?: string;
  mode: 'feed' | 'modal';
  hasPermission: (permission: string) => boolean;
  onAccept: (orderItemId: string, quantity: number) => void | Promise<void>;
  onServe: (orderItemId: string, quantity: number) => void | Promise<void>;
  onOpenCancel: (target: CancelModalTarget) => void;
  isLoading?: boolean;
}

export const StaffOrderItemRow: React.FC<StaffOrderItemRowProps> = ({
  item,
  tableNumber,
  mode,
  hasPermission,
  onAccept,
  onServe,
  onOpenCancel,
  isLoading = false
}) => {
  const isPending = item.status === 'PENDING';
  const isAccepted = item.status === 'ACCEPTED';
  const isServed = item.status === 'SERVED';
  const isCancelled = item.status === 'CANCELLED';

  const subtotal = typeof item.subtotal === 'number'
    ? item.subtotal
    : (item.price || 0) * (item.quantity || 1);

  const rawPrice = typeof item.rawPrice === 'number'
    ? item.rawPrice
    : (item.price || 0) * (item.quantity || 1);

  return (
    <div className="relative flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      {/* Left side vertical accent bar - 6px */}
      <div
        className={`w-1.5 self-stretch rounded-full shrink-0 ${
          isPending
            ? 'bg-amber-400'
            : isAccepted
            ? 'bg-sky-400'
            : isServed
            ? 'bg-emerald-400'
            : 'bg-rose-300'
        }`}
      />

      {/* Middle Column: Dish Info */}
      <div className="min-w-0 flex-1 space-y-1 overflow-hidden pr-1">
        {/* Row 1: Quantity + Dish Name */}
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span
            className={`font-black text-slate-900 shrink-0 ${
              mode === 'feed' ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
            }`}
          >
            {item.quantity}×
          </span>
          <span
            className={`font-normal text-sm sm:text-base break-words [overflow-wrap:anywhere] leading-snug ${
              isCancelled ? 'line-through text-slate-400' : 'text-slate-900'
            }`}
          >
            {item.name}
          </span>
        </div>

        {/* Row 2: Variant Details */}
        {item.variantName && (
          <p className="text-xs sm:text-[13px] font-normal text-slate-500 leading-tight">
            {item.variantName}
          </p>
        )}

        {/* Row 3: Customer Note */}
        {item.note && (
          <p className="flex items-start gap-1 text-xs sm:text-[13px] italic font-normal text-[#9A3412] break-all [overflow-wrap:anywhere] leading-snug">
            <span className="not-italic shrink-0 select-none text-[11px] mt-0.5">📌</span>
            <span>{item.note}</span>
          </p>
        )}

        {/* Row 4: Cancel Reason */}
        {isCancelled && item.cancelReason && (
          <p className="text-[11px] text-rose-500 italic">
            Lý do hủy: {item.cancelReason}
          </p>
        )}
      </div>

      {/* Right Column: Actions / Price */}
      {mode === 'feed' ? (
        /* Feed mode: Large touch-friendly buttons (w-100-114px, h-52-56px) */
        <div className="flex-none shrink-0 flex items-center justify-end gap-1.5 self-center min-w-[145px] sm:min-w-[164px]">
          {isPending && hasPermission('order.manage') && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onAccept(item.orderItemId, item.quantity)}
              className="flex-none w-[100px] sm:w-[114px] h-[52px] sm:h-[56px] bg-[#2563EB] hover:bg-[#1D4ED8] active:bg-[#1E40AF] text-white font-black text-base sm:text-lg rounded-2xl shadow-sm flex items-center justify-center transition active:scale-95 cursor-pointer disabled:opacity-50"
              title="Tiếp nhận món này"
            >
              <span>Nhận</span>
            </button>
          )}

          {isAccepted && hasPermission('order.serve') && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onServe(item.orderItemId, item.quantity)}
              className="flex-none w-[100px] sm:w-[114px] h-[52px] sm:h-[56px] bg-[#059669] hover:bg-[#047857] active:bg-[#065F46] text-white font-black text-sm sm:text-base rounded-2xl shadow-sm flex items-center justify-center transition active:scale-95 cursor-pointer disabled:opacity-50"
              title="Đánh dấu đã phục vụ"
            >
              <span>Phục vụ</span>
            </button>
          )}

          {isServed && (
            <span className="flex-none w-[100px] sm:w-[114px] h-[52px] sm:h-[56px] text-emerald-800 font-bold text-xs sm:text-sm flex items-center justify-center gap-1 bg-emerald-50/80 rounded-2xl border border-emerald-200/50 text-center px-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Đã phục vụ</span>
            </span>
          )}

          {isCancelled && (
            <span className="flex-none w-[100px] sm:w-[114px] h-[52px] sm:h-[56px] text-rose-700 font-bold text-xs sm:text-sm flex items-center justify-center bg-rose-50/80 rounded-2xl border border-rose-200/50 text-center px-1">
              Đã hủy
            </span>
          )}

          {/* 3-dots Cancel Trigger */}
          {(isPending || isAccepted || isServed) && hasPermission('order.cancel') && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() =>
                onOpenCancel({
                  id: item.orderItemId,
                  name: item.name,
                  quantity: item.quantity,
                  tableNumber,
                  isServed
                })
              }
              className="flex-none w-[36px] sm:w-[40px] h-[52px] sm:h-[56px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition flex items-center justify-center cursor-pointer disabled:opacity-50"
              title={isServed ? 'Hủy món đã phục vụ' : 'Hủy món này'}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        /* Modal mode: Price subtotal + Compact action buttons */
        <div className="flex flex-col items-end justify-center gap-1.5 shrink-0 self-center">
          <div className="text-right">
            <span
              className={`font-black text-xs sm:text-sm ${
                isCancelled ? 'line-through text-slate-400' : 'text-slate-900'
              }`}
            >
              {isCancelled ? '0đ' : `${subtotal.toLocaleString('vi-VN')}đ`}
            </span>
            {!isCancelled && rawPrice > subtotal && (
              <span className="block text-[10px] text-slate-400 line-through">
                {rawPrice.toLocaleString('vi-VN')}đ
              </span>
            )}
          </div>

          {/* Quick action buttons or status badge */}
          {isPending && item.orderItemId && (
            <div className="flex items-center gap-1.5">
              {hasPermission('order.cancel') && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() =>
                    onOpenCancel({
                      id: item.orderItemId,
                      name: item.name,
                      quantity: item.quantity,
                      tableNumber,
                      isServed: false
                    })
                  }
                  className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Hủy món"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Hủy</span>
                </button>
              )}
              {hasPermission('order.manage') && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onAccept(item.orderItemId, item.quantity)}
                  className="px-2.5 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] active:bg-[#1E40AF] text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Nhận món"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Nhận</span>
                </button>
              )}
            </div>
          )}

          {isAccepted && item.orderItemId && (
            <div className="flex items-center gap-1.5">
              {hasPermission('order.cancel') && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() =>
                    onOpenCancel({
                      id: item.orderItemId,
                      name: item.name,
                      quantity: item.quantity,
                      tableNumber,
                      isServed: false
                    })
                  }
                  className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Hủy món"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Hủy</span>
                </button>
              )}
              {hasPermission('order.serve') && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onServe(item.orderItemId, item.quantity)}
                  className="px-2.5 py-1.5 bg-[#059669] hover:bg-[#047857] active:bg-[#065F46] text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Phục vụ món"
                >
                  <UtensilsCrossed className="w-3.5 h-3.5" />
                  <span>Phục vụ</span>
                </button>
              )}
            </div>
          )}

          {isServed && item.orderItemId && (
            <div className="flex items-center gap-1.5">
              {hasPermission('order.cancel') && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() =>
                    onOpenCancel({
                      id: item.orderItemId,
                      name: item.name,
                      quantity: item.quantity,
                      tableNumber,
                      isServed: true
                    })
                  }
                  className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Hủy món đã phục vụ"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Hủy</span>
                </button>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50/90 px-2.5 py-1 rounded-xl border border-emerald-200/60">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Đã phục vụ</span>
              </span>
            </div>
          )}

          {isCancelled && (
            <span className="inline-flex items-center text-[11px] font-bold text-rose-700 bg-rose-50/90 px-2.5 py-1 rounded-xl border border-rose-200/60">
              Đã hủy
            </span>
          )}
        </div>
      )}
    </div>
  );
};
