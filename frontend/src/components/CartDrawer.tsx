import React, { useState } from 'react';
import { useGuest, getCartItemKey } from '../context/GuestContext.js';
import { ShoppingBag, X, Plus, Minus, Trash2, Send, AlertTriangle, Tag, Sparkles } from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ isOpen, onClose }) => {
  const { isStaffOrdering, staffName, canOrder, isSessionClosed, cart, updateCartQuantity, removeFromCart, clearCart, submitOrder, table, promotions, billSummary } = useGuest();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentRoundSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tableAccumulatedTotal = (billSummary?.rawBillTotal || 0) + (billSummary?.pendingTotal || 0);
  const projectedTableTotal = tableAccumulatedTotal + currentRoundSubtotal;

  // Evaluate single best-deal promotion on the TOTAL BILL of the table session
  let bestPromo: any = null;
  let bestDiscount = 0;

  for (const promo of (promotions || [])) {
    const minOrder = Number(promo.minOrderAmount || promo.min_order_amount || 0);
    if (projectedTableTotal < minOrder) continue;

    const discValue = Number(promo.discountValue || promo.discount_value || 0);
    const discType = promo.discountType || promo.discount_type;
    const maxDiscount = promo.maxDiscountAmount || promo.max_discount_amount;

    let calculated = 0;
    if (discType === 'PERCENT') {
      calculated = Math.floor((projectedTableTotal * discValue) / 100);
      if (maxDiscount) {
        calculated = Math.min(calculated, Number(maxDiscount));
      }
    } else if (discType === 'FIXED_AMOUNT') {
      calculated = Math.min(discValue, projectedTableTotal);
    }

    calculated = Math.max(0, Math.min(calculated, projectedTableTotal));

    if (
      calculated > bestDiscount ||
      (calculated === bestDiscount && calculated > 0 && Number(promo.priority || 0) > Number(bestPromo?.priority || 0))
    ) {
      bestDiscount = calculated;
      bestPromo = promo;
    }
  }

  // Threshold nudge for the closest upcoming promo on total bill
  const upcomingPromo = (promotions || [])
    .filter(p => Number(p.minOrderAmount || p.min_order_amount || 0) > projectedTableTotal)
    .sort((a, b) => Number(a.minOrderAmount || a.min_order_amount || 0) - Number(b.minOrderAmount || b.min_order_amount || 0))[0];
  const amountNeededForPromo = upcomingPromo
    ? Number(upcomingPromo.minOrderAmount || upcomingPromo.min_order_amount || 0) - projectedTableTotal
    : 0;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await submitOrder();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi gửi yêu cầu gọi món, vui lòng thử lại');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-orange-600" />
            <h3 className="font-bold text-slate-900 text-lg">{isStaffOrdering ? 'Đơn gọi món hộ' : 'Đơn gọi món mới'}</h3>
            {table && (
              <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                Bàn {table.tableNumber}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isStaffOrdering && <p className="px-4 py-2 bg-emerald-50 text-emerald-900 text-xs">Nhân viên {staffName} đang gọi hộ. Hệ thống ghi nhận người gọi và thời điểm.</p>}
        {/* Warning banner about round total */}
        <div className="bg-amber-50 px-4 py-2.5 border-b border-amber-100/60 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <span>
            Đây là tổng dự kiến của <strong>lần gọi này</strong>. Các món đã gọi trước đó được lưu và hiển thị trong mục <strong>Tổng bill</strong>.
          </span>
        </div>

        {/* Promotion banner / Threshold nudge on TOTAL BILL */}
        {cart.length > 0 && bestPromo && (
          <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-100 flex items-center justify-between text-xs text-emerald-800">
            <div className="flex items-center gap-1.5 font-bold">
              <Tag className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Ưu đãi tổng bill: {bestPromo.title}</span>
            </div>
            <span className="font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
              Giảm {bestDiscount.toLocaleString('vi-VN')}đ khi thanh toán
            </span>
          </div>
        )}

        {cart.length > 0 && !bestPromo && upcomingPromo && amountNeededForPromo > 0 && (
          <div className="bg-orange-50 px-4 py-2 border-b border-orange-100 flex items-center gap-2 text-xs text-orange-800">
            <Sparkles className="w-4 h-4 text-orange-600 shrink-0" />
            <span>
              Thêm <strong>{amountNeededForPromo.toLocaleString('vi-VN')}đ</strong> vào tổng bill để nhận ưu đãi <strong>"{upcomingPromo.title}"</strong>!
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="m-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.map((item) => (
            <div
              key={getCartItemKey(item)}
              className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="font-semibold text-slate-900 text-sm truncate">{item.name}</h4>
                  {item.variantName && (
                    <span className="text-[11px] font-bold px-2 py-0.5 bg-orange-100 text-orange-700 rounded-md shrink-0">
                      {item.variantName}
                    </span>
                  )}
                </div>
                {item.note && (
                  <p className="text-xs text-slate-500 italic mt-0.5 truncate">Ghi chú: {item.note}</p>
                )}
                <div className="text-xs font-bold text-orange-600 mt-1">
                  {(item.price * item.quantity).toLocaleString('vi-VN')}đ
                  <span className="text-slate-400 font-normal ml-1">({item.price.toLocaleString('vi-VN')}đ / phần)</span>
                </div>
              </div>

              {/* Quantity Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateCartQuantity(item.menuItemId, item.quantity - 1, item.note, item.variantId, item.variantName, item.optionIds, item.variantIds)}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:bg-slate-100"
                >
                  {item.quantity === 1 ? <Trash2 className="w-4 h-4 text-rose-500" /> : <Minus className="w-3.5 h-3.5" />}
                </button>
                <span className="font-bold text-sm w-5 text-center">{item.quantity}</span>
                <button
                  onClick={() => updateCartQuantity(item.menuItemId, item.quantity + 1, item.note, item.variantId, item.variantName, item.optionIds, item.variantIds)}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:bg-slate-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {cart.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <ShoppingBag className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p>Chưa có món nào được chọn cho lần này</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="p-4 border-t border-slate-100 bg-white space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 font-medium">Tiền lần gọi mới này:</span>
              <span className="text-lg font-bold text-slate-900">{currentRoundSubtotal.toLocaleString('vi-VN')}đ</span>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !canOrder || isSessionClosed}
              className="w-full min-h-[48px] bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-50 text-white font-bold rounded-xl py-3 px-4 shadow-lg flex items-center justify-center gap-2 transition"
            >
              {isSubmitting ? (
                <span>Đang gửi yêu cầu...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Gửi yêu cầu gọi món ({cart.length} món) • {currentRoundSubtotal.toLocaleString('vi-VN')}đ</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
