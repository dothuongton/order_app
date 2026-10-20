import React from 'react';
import { useGuest } from '../../context/GuestContext.js';
import { Clock, CheckCircle2, AlertCircle, XCircle, RefreshCw } from 'lucide-react';

export const GuestOrders: React.FC = () => {
  const { orders, refreshOrdersAndBill } = useGuest();

  const getStatusBadge = (status: string, item: any) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" />
            Chờ tiếp nhận
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="w-3 h-3" />
            Đã tiếp nhận {item.servedQty > 0 ? `(${item.servedQty}/${item.quantity} đã phục vụ)` : ''}
          </span>
        );
      case 'SERVED':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            Đã phục vụ
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            Đã hủy {item.parts?.[0]?.cancel_reason ? `(${item.parts[0].cancel_reason})` : ''}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-4 space-y-4 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Các lần gọi món</h2>
          <p className="text-xs text-slate-500">Tiến độ phục vụ các món bạn đã yêu cầu</p>
        </div>
        <button
          onClick={() => refreshOrdersAndBill()}
          className="p-2 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center transition"
          aria-label="Làm mới"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 p-6">
          <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <h3 className="font-semibold text-slate-700">Chưa có yêu cầu nào được gửi</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Hãy chọn các món trong mục Thực đơn và nhấn gửi để nhân viên tiếp nhận và phục vụ
          </p>
        </div>
      ) : (
        orders.map((order) => (
          <div key={order.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {/* Round Header */}
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-sm">Lần {order.orderNumber}</span>
                {order.appliedPromotion && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    🎁 {order.appliedPromotion.title}
                  </span>
                )}
              </div>
              <span className="text-slate-400">
                {new Date(order.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* Items */}
            <div className="divide-y divide-slate-100 p-2">
              {order.items.map((item) => (
                <div key={item.id} className="p-2.5 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{item.quantity}x</span>
                      <h4 className="font-medium text-slate-900 text-sm truncate">{item.name}</h4>
                      {item.variantName && (
                        <span className="text-[11px] font-bold px-2 py-0.5 bg-orange-100 text-orange-700 rounded-md shrink-0">
                          {item.variantName}
                        </span>
                      )}
                    </div>

                    {item.note && (
                      <p className="text-xs text-slate-500 italic mt-0.5">Ghi chú: {item.note}</p>
                    )}

                    {/* Cancellation details */}
                    {item.cancelledQty > 0 && item.cancelledQty < item.quantity && (
                      <p className="text-xs text-rose-600 mt-1">
                        Hủy {item.cancelledQty} phần (hết nguyên liệu)
                      </p>
                    )}

                    <div className="mt-2">{getStatusBadge(item.status, item)}</div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    {item.discountAmount && item.discountAmount > 0 ? (
                      <>
                        <span className="font-bold text-sm text-emerald-600 block">
                          {(item.finalPrice !== undefined ? item.finalPrice : Math.max(0, item.price * (item.quantity - item.cancelledQty) - item.discountAmount)).toLocaleString('vi-VN')}đ
                        </span>
                        <div className="text-[11px] text-slate-400 line-through">
                          {(item.price * item.quantity).toLocaleString('vi-VN')}đ
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-sm text-slate-900">
                          {(item.price * (item.quantity - item.cancelledQty)).toLocaleString('vi-VN')}đ
                        </span>
                        {item.cancelledQty > 0 && (
                          <div className="text-[11px] text-slate-400 line-through">
                            {(item.price * item.quantity).toLocaleString('vi-VN')}đ
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Round discount footer if discount > 0 */}
            {Number(order.discountTotal || 0) > 0 ? (
              <div className="bg-emerald-50/60 px-4 py-2 border-t border-emerald-100 flex items-center justify-between text-xs">
                <span className="text-emerald-800 font-medium">Giảm giá ưu đãi:</span>
                <span className="font-extrabold text-emerald-700">-{Number(order.discountTotal || 0).toLocaleString('vi-VN')}đ</span>
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
};
