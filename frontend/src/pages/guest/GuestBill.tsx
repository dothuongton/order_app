import React, { useState } from 'react';
import { useGuest } from '../../context/GuestContext.js';
import { Receipt, Bell, CreditCard, CheckCircle, Clock, AlertTriangle, MessageSquare } from 'lucide-react';

export const GuestBill: React.FC = () => {
  const {
    billSummary,
    table,
    tenant,
    session,
    activeServiceRequests,
    isSessionClosed,
    requestAssistance,
    requestCheckout,
    refreshOrdersAndBill
  } = useGuest();

  const [isCallingStaff, setIsCallingStaff] = useState(false);
  const [isRequestingCheckout, setIsRequestingCheckout] = useState(false);
  const [assistanceNote, setAssistanceNote] = useState('');
  const [showAssistanceModal, setShowAssistanceModal] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const isClosed = isSessionClosed || !session || session.status === 'CLOSED' || billSummary?.sessionStatus === 'CLOSED';
  const checkoutRequest = !isClosed ? activeServiceRequests.find(r => r.type === 'CHECKOUT') : null;
  const assistanceRequest = !isClosed ? activeServiceRequests.find(r => r.type === 'ASSISTANCE') : null;

  const handleCheckoutClick = async () => {
    setIsRequestingCheckout(true);
    try {
      const res = await requestCheckout();
      setActionMessage(res.message);
    } catch (err: any) {
      setActionMessage(err.message || 'Lỗi gửi yêu cầu thanh toán');
    } finally {
      setIsRequestingCheckout(false);
    }
  };

  const handleAssistanceSubmit = async () => {
    setIsCallingStaff(true);
    try {
      const res = await requestAssistance(assistanceNote.trim() || undefined);
      setShowAssistanceModal(false);
      setAssistanceNote('');
      setActionMessage(res.message);
    } catch (err: any) {
      setActionMessage(err.message || 'Lỗi gọi nhân viên');
    } finally {
      setIsCallingStaff(false);
    }
  };

  return (
    <div className="p-4 space-y-4 pb-32">
      {/* Table & Session Header */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-500 font-medium">Hóa đơn bàn hiện tại</span>
          <h2 className="text-xl font-bold text-slate-900">Bàn {table?.tableNumber || '--'}</h2>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400 block">{tenant?.name}</span>
          {isClosed ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              Đã kết thúc
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Đang phục vụ
            </span>
          )}
        </div>
      </div>

      {/* Active Service Notification Banners - only when session is active */}
      {!isClosed && checkoutRequest && (
        <div className="bg-amber-500 text-white rounded-2xl p-4 shadow-md flex items-center gap-3 animate-pulse-attention">
          <CreditCard className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm">Đã gửi yêu cầu thanh toán</h4>
              {checkoutRequest.call_count && checkoutRequest.call_count > 1 && (
                <span className="text-[10px] bg-amber-700 font-extrabold px-2 py-0.5 rounded-full">
                  Nhắc lần {checkoutRequest.call_count}
                </span>
              )}
            </div>
            <p className="text-xs opacity-90 mt-0.5">
              Nhân viên sẽ mang hóa đơn tới bàn để kiểm tra và nhận thanh toán ngoài hệ thống.
            </p>
          </div>
        </div>
      )}

      {!isClosed && assistanceRequest && (
        <div className="bg-blue-600 text-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <Bell className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm">Đã gọi nhân viên hỗ trợ</h4>
              {assistanceRequest.call_count && assistanceRequest.call_count > 1 && (
                <span className="text-[10px] bg-blue-800 font-extrabold px-2 py-0.5 rounded-full">
                  Gọi lần {assistanceRequest.call_count}
                </span>
              )}
            </div>
            <p className="text-xs opacity-90 mt-0.5">
              Nhân viên đang tới bàn để hỗ trợ quý khách.
            </p>
          </div>
        </div>
      )}

      {!isClosed && actionMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs font-medium flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Detailed Bill Breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm divide-y divide-slate-100 overflow-hidden">
        <div className="p-4 bg-slate-50 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Chi tiết các món tính tiền</span>
          <Receipt className="w-4 h-4 text-slate-400" />
        </div>

        {billSummary?.rounds?.map((round) => (
          <div key={round.orderNumber} className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-1.5">
                <span>Lần {round.orderNumber}</span>
                {round.appliedPromotion && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    🎁 {round.appliedPromotion.title}
                  </span>
                )}
              </div>
              <div className="text-right">
                {round.acceptedOrServedSubtotal > 0 ? (
                  <span>
                    {round.acceptedOrServedSubtotal.toLocaleString('vi-VN')}đ
                    {round.pendingSubtotal > 0 && (
                      <span className="text-amber-600 font-normal ml-1">
                        (+{round.pendingSubtotal.toLocaleString('vi-VN')}đ chờ xác nhận)
                      </span>
                    )}
                  </span>
                ) : round.pendingSubtotal > 0 ? (
                  <span className="text-amber-600 font-semibold">
                    {round.pendingSubtotal.toLocaleString('vi-VN')}đ (Chờ tiếp nhận)
                  </span>
                ) : (
                  <span>0đ</span>
                )}
              </div>
            </div>

            <div className="space-y-1.5 pl-2 border-l-2 border-slate-100">
              {round.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">{item.quantity}x</span>
                    <span className={`truncate max-w-[190px] ${item.status === 'CANCELLED' ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}`}>
                      {item.name}
                      {item.variantName && (
                        <span className="text-[10px] text-orange-600 font-bold ml-1">({item.variantName})</span>
                      )}
                    </span>
                    {item.status === 'CANCELLED' && (
                      <span className="text-[10px] text-rose-600">(Đã hủy)</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`font-semibold ${item.status === 'CANCELLED' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                      {item.status === 'CANCELLED' ? '0đ' : `${item.subtotal.toLocaleString('vi-VN')}đ`}
                    </span>
                    {item.status !== 'CANCELLED' && item.rawPrice && item.rawPrice > item.subtotal && (
                      <span className="block text-[10px] text-slate-400 line-through">
                        {item.rawPrice.toLocaleString('vi-VN')}đ
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Pending Items Notice */}
        {billSummary && billSummary.pendingTotal > 0 && (
          <div className="p-4 bg-amber-50/70 flex items-center justify-between text-xs border-t border-amber-100">
            <div className="flex items-center gap-1.5 text-amber-800">
              <Clock className="w-3.5 h-3.5" />
              <span>Chờ tiếp nhận (chưa tính vào tổng):</span>
            </div>
            <span className="font-bold text-amber-900">{billSummary.pendingTotal.toLocaleString('vi-VN')}đ</span>
          </div>
        )}

        {/* Promotion and Bill Breakdown */}
        {billSummary && (billSummary.totalDiscount || 0) > 0 && (
          <div className="p-4 bg-emerald-50/60 space-y-1.5 border-t border-emerald-100 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>Tạm tính (các món đã tiếp nhận/phục vụ):</span>
              <span className="font-semibold">{((billSummary.rawBillTotal || (billSummary.validBillTotal + (billSummary.totalDiscount || 0)))).toLocaleString('vi-VN')}đ</span>
            </div>
            <div className="flex items-center justify-between text-emerald-700 font-bold">
              <span className="flex items-center gap-1">
                🎁 Khuyến mãi áp dụng cho tổng bill:
              </span>
              <span>-{(billSummary.totalDiscount || 0).toLocaleString('vi-VN')}đ</span>
            </div>
            {billSummary.appliedPromotions && billSummary.appliedPromotions.length > 0 && (
              <div className="pt-1 flex flex-wrap gap-1">
                {billSummary.appliedPromotions.map((p: any) => (
                  <span key={p.id} className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">
                    {p.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Grand Total */}
        <div className="p-4 bg-slate-50 flex items-center justify-between border-t-2 border-slate-200">
          <div>
            <span className="text-xs font-bold text-slate-800 block">Tổng thanh toán</span>
            <span className="text-[11px] text-slate-400">(Chỉ tính các món đã tiếp nhận/phục vụ)</span>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-orange-600">
              {(billSummary?.validBillTotal || 0).toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>
      </div>

      {/* Payment Note (Section 1.1: Tiền được xử lý ngoài hệ thống) */}
      <div className="bg-slate-100 rounded-xl p-3 text-xs text-slate-500 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <span>
          Hệ thống không thu tiền trực tuyến. Quý khách vui lòng thanh toán bằng tiền mặt hoặc chuyển khoản trực tiếp cho nhân viên khi thanh toán.
        </span>
      </div>

      {/* Action Buttons or Completed State */}
      {isClosed ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-1.5 shadow-xs">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 mx-auto">
            <CheckCircle className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-sm text-emerald-900">Phiên bàn đã thanh toán hoàn tất</h4>
          <p className="text-xs text-emerald-700">
            Cảm ơn quý khách đã dùng bữa tại {tenant?.name || 'nhà hàng'}! Chúc quý khách một ngày tốt lành.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => setShowAssistanceModal(true)}
            className="min-h-[48px] bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl p-3.5 flex items-center justify-center gap-2 shadow-sm active:scale-95 transition"
          >
            <Bell className="w-4 h-4 text-slate-500" />
            <span>Gọi nhân viên</span>
          </button>

          <button
            onClick={handleCheckoutClick}
            disabled={isRequestingCheckout}
            className="min-h-[48px] bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-50 text-white font-bold rounded-2xl p-3.5 flex items-center justify-center gap-2 shadow-md active:scale-95 transition"
          >
            <CreditCard className="w-4 h-4" />
            <span>
              {checkoutRequest
                ? `Nhắc thanh toán ${checkoutRequest.call_count && checkoutRequest.call_count > 1 ? `(x${checkoutRequest.call_count})` : ''}`
                : 'Yêu cầu thanh toán'}
            </span>
          </button>
        </div>
      )}

      {/* Assistance Modal */}
      {showAssistanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-5 h-5 text-orange-600" />
              <h3 className="font-bold text-slate-900 text-base">Gọi nhân viên tới bàn</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Bạn có thể để lại lời nhắn ngắn nếu cần yêu cầu đặc biệt (ví dụ: thêm thìa dĩa, lấy tương ớt...).
            </p>
            <textarea
              value={assistanceNote}
              onChange={(e) => setAssistanceNote(e.target.value)}
              placeholder="Lời nhắn ngắn (tuỳ chọn)..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
              rows={3}
              maxLength={100}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowAssistanceModal(false)}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm"
              >
                Hủy
              </button>
              <button
                onClick={handleAssistanceSubmit}
                disabled={isCallingStaff}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-orange-600 text-white font-bold text-sm shadow-sm"
              >
                {isCallingStaff ? 'Đang gửi...' : 'Xác nhận gọi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
