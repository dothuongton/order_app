import { OrderSourceBadge, InvoiceSourceSummary } from '../../components/OrderSourceBadge.js';
import React, { useState } from 'react';
import { useGuest } from '../../context/GuestContext.js';
import { Receipt, Bell, CreditCard, CheckCircle, Clock, AlertTriangle, MessageSquare, Shield, UserCheck } from 'lucide-react';

export const GuestBill: React.FC = () => {
  const {
    billSummary,
    table,
    tenant,
    session,
    activeServiceRequests,
    isSessionClosed,
    receipt,
    tableStatus,
    deviceState,
    claimedGuestName,
    canOrder,
    requestAssistance,
    requestCheckout,
    refreshOrdersAndBill
  } = useGuest();

  const [isCallingStaff, setIsCallingStaff] = useState(false);
  const [isRequestingCheckout, setIsRequestingCheckout] = useState(false);
  const [assistanceNote, setAssistanceNote] = useState('');
  const [showAssistanceModal, setShowAssistanceModal] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const isViewerOccupied = !session && !isSessionClosed && tableStatus === 'OCCUPIED' && deviceState === 'VIEWER';
  const isUnopened = !session && !isSessionClosed && !isViewerOccupied;
  const isClosed = Boolean(isSessionClosed || session?.status === 'CLOSED' || billSummary?.sessionStatus === 'CLOSED');
  const isOpen = Boolean(session && session.status === 'OPEN' && !isSessionClosed);
  const isViewer = deviceState === 'VIEWER' || (!canOrder && (isOpen || isViewerOccupied));
  const checkoutRequest = (isOpen || isViewerOccupied) ? activeServiceRequests.find(r => r.type === 'CHECKOUT') : null;
  const assistanceRequest = (isOpen || isViewerOccupied) ? activeServiceRequests.find(r => r.type === 'ASSISTANCE') : null;

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
          {isUnopened ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Chưa mở phiên
            </span>
          ) : isClosed ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              Đã kết thúc
            </span>
          ) : isViewerOccupied ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              Đang phục vụ (Chế độ xem)
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
        <div className={`text-white rounded-2xl p-4 shadow-md flex items-center gap-3 transition-all ${
          checkoutRequest.status === 'ACCEPTED'
            ? 'bg-emerald-600 border border-emerald-500 shadow-emerald-600/20'
            : 'bg-amber-500 animate-pulse-attention'
        }`}>
          {checkoutRequest.status === 'ACCEPTED' ? (
            <UserCheck className="w-6 h-6 flex-shrink-0 text-emerald-100" />
          ) : (
            <CreditCard className="w-6 h-6 flex-shrink-0" />
          )}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm">
                {checkoutRequest.status === 'ACCEPTED'
                  ? 'Nhân viên đã tiếp nhận yêu cầu thanh toán'
                  : 'Đã gửi yêu cầu thanh toán'}
              </h4>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                checkoutRequest.status === 'ACCEPTED'
                  ? 'bg-emerald-800 text-emerald-100'
                  : 'bg-amber-700 text-white'
              }`}>
                {checkoutRequest.status === 'ACCEPTED' ? 'ĐÃ TIẾP NHẬN' : (
                  checkoutRequest.call_count && checkoutRequest.call_count > 1
                    ? `Nhắc lần ${checkoutRequest.call_count}`
                    : 'CHỜ TIẾP NHẬN'
                )}
              </span>
            </div>
            <p className="text-xs opacity-95 mt-1 leading-relaxed">
              {checkoutRequest.status === 'ACCEPTED'
                ? 'Nhân viên phục vụ đã tiếp nhận và đang chuẩn bị hóa đơn mang tới bàn bạn.'
                : 'Nhân viên sẽ mang hóa đơn tới bàn để kiểm tra và nhận thanh toán ngoài hệ thống.'}
            </p>
          </div>
        </div>
      )}

      {!isClosed && assistanceRequest && (
        <div className={`text-white rounded-2xl p-4 shadow-sm flex items-center gap-3 transition-all ${
          assistanceRequest.status === 'ACCEPTED'
            ? 'bg-teal-700 border border-teal-600 shadow-teal-700/20'
            : 'bg-blue-600'
        }`}>
          {assistanceRequest.status === 'ACCEPTED' ? (
            <UserCheck className="w-6 h-6 flex-shrink-0 text-teal-100" />
          ) : (
            <Bell className="w-6 h-6 flex-shrink-0" />
          )}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm">
                {assistanceRequest.status === 'ACCEPTED'
                  ? 'Nhân viên đã tiếp nhận hỗ trợ'
                  : 'Đã gọi nhân viên hỗ trợ'}
              </h4>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                assistanceRequest.status === 'ACCEPTED'
                  ? 'bg-teal-900 text-teal-100'
                  : 'bg-blue-800 text-white'
              }`}>
                {assistanceRequest.status === 'ACCEPTED' ? 'ĐÃ TIẾP NHẬN' : (
                  assistanceRequest.call_count && assistanceRequest.call_count > 1
                    ? `Gọi lần ${assistanceRequest.call_count}`
                    : 'CHỜ TIẾP NHẬN'
                )}
              </span>
            </div>
            <p className="text-xs opacity-95 mt-1 leading-relaxed">
              {assistanceRequest.status === 'ACCEPTED'
                ? 'Nhân viên phục vụ đã nhận thông báo và đang di chuyển tới bàn quý khách ngay bây giờ.'
                : 'Đã phát chuông gọi nhân viên. Nhân viên sẽ tới bàn để hỗ trợ quý khách trong giây lát.'}
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

      {/* Detailed Bill Breakdown or Unopened State */}
      {isUnopened ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <Receipt className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">Chưa có hóa đơn</h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            Bàn chưa được mở phiên phục vụ. Chi tiết các món và tổng tiền sẽ hiển thị tại đây sau khi bàn được mở.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm divide-y divide-slate-100 overflow-hidden">
          <div className="p-4 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Chi tiết các món tính tiền</span>
            <Receipt className="w-4 h-4 text-slate-400" />
          </div>

          <div className="px-4 py-2"><InvoiceSourceSummary origins={receipt?.billLines?.length ? receipt.billLines : billSummary?.rounds || []} /></div>
          {receipt && receipt.billLines && receipt.billLines.length > 0 ? (
            <div className="p-4 space-y-2">
              <div className="space-y-1.5 pl-2 border-l-2 border-slate-100">
                {receipt.billLines.map((line, idx) => (
                  <div key={idx} className="space-y-1 text-xs">
                    <OrderSourceBadge {...line} />
                    <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{line.quantityServed}x</span>
                      <span className="text-slate-800 font-medium truncate max-w-[190px]">
                        {line.itemName}
                        {line.variantName && (
                          <span className="text-[10px] text-teal-700 font-bold ml-1">({line.variantName})</span>
                        )}
                      </span>
                    </div>
                    <span className="font-semibold text-slate-900">{line.subtotal.toLocaleString('vi-VN')}đ</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            billSummary?.rounds?.map((round) => (
            <div key={round.orderNumber} className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>Lần {round.orderNumber}</span><OrderSourceBadge {...round} />
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
            ))
          )}

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
          {receipt?.appliedPromotions && receipt.appliedPromotions.length > 0 ? (
            <div className="p-4 bg-emerald-50/60 space-y-1.5 border-t border-emerald-100 text-xs">
              <div className="flex items-center justify-between text-emerald-700 font-bold">
                <span className="flex items-center gap-1">
                  🎁 Khuyến mãi đã áp dụng:
                </span>
              </div>
              <div className="pt-1 flex flex-wrap gap-1">
                {receipt.appliedPromotions.map((p: any) => (
                  <span key={p.id} className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">
                    {p.title}
                  </span>
                ))}
              </div>
            </div>
          ) : billSummary && (billSummary.totalDiscount || 0) > 0 ? (
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
          ) : null}

          {/* Grand Total */}
          <div className="p-4 bg-slate-50 flex items-center justify-between border-t-2 border-slate-200">
            <div>
              <span className="text-xs font-bold text-slate-800 block">Tổng thanh toán</span>
              <span className="text-[11px] text-slate-400">
                {receipt?.settled ? '(Hóa đơn đã chốt)' : '(Chỉ tính các món đã tiếp nhận/phục vụ)'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-teal-700">
                {(receipt ? (receipt.totalAmount || 0) : (billSummary?.validBillTotal || 0)).toLocaleString('vi-VN')}đ
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Payment Note (Section 1.1: Tiền được xử lý ngoài hệ thống) */}
      <div className="bg-slate-100 rounded-xl p-3 text-xs text-slate-500 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <span>
          Hệ thống không thu tiền trực tuyến. Quý khách vui lòng thanh toán bằng tiền mặt hoặc chuyển khoản trực tiếp cho nhân viên khi thanh toán.
        </span>
      </div>

      {/* Action Buttons or Completed State */}
      {isUnopened ? null : isClosed ? (
        receipt?.settled && receipt?.closeReason === 'CONFIRMED_SETTLED' ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-1.5 shadow-xs">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 mx-auto">
              <CheckCircle className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-emerald-900">Phiên bàn đã thanh toán hoàn tất</h4>
            <p className="text-xs text-emerald-700">
              Cảm ơn quý khách đã dùng bữa tại {tenant?.name || 'nhà hàng'}! Chúc quý khách một ngày tốt lành.
            </p>
          </div>
        ) : receipt?.closeReason === 'CLOSED_WITHOUT_CHARGE' ? (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-1.5 shadow-xs">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-200 text-slate-700 mx-auto">
              <CheckCircle className="w-5 h-5 text-slate-500" />
            </div>
            <h4 className="font-bold text-sm text-slate-800">Phiên bàn đã kết thúc (không tính tiền)</h4>
            <p className="text-xs text-slate-600">
              Bàn đã được kết thúc bởi nhân viên.
            </p>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-1.5 shadow-xs">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-200 text-slate-700 mx-auto">
              <CheckCircle className="w-5 h-5 text-slate-500" />
            </div>
            <h4 className="font-bold text-sm text-slate-800">Phiên bàn đã kết thúc</h4>
            <p className="text-xs text-slate-600">
              Quyền truy cập của phiên bàn này đã kết thúc.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-2.5 pt-2">
          {/* Viewer Notice: only claimed guest can call staff or request payment */}
          {isViewer && (
            <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5 shadow-xs animate-in fade-in">
              <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed font-medium">
                Chỉ có khách hàng <strong>{claimedGuestName || 'đang gọi món'}</strong> mới gửi được yêu cầu hỗ trợ và thanh toán.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => !isViewer && setShowAssistanceModal(true)}
              disabled={isViewer || isCallingStaff}
              title={isViewer ? `Chỉ có khách hàng ${claimedGuestName || 'đang gọi món'} mới gửi được yêu cầu hỗ trợ và thanh toán.` : 'Gọi nhân viên'}
              className={`min-h-[48px] rounded-2xl p-3.5 flex items-center justify-center gap-2 shadow-sm transition ${
                isViewer
                  ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                  : 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold active:scale-95 cursor-pointer'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Gọi nhân viên</span>
            </button>

            <button
              onClick={!isViewer ? handleCheckoutClick : undefined}
              disabled={isViewer || isRequestingCheckout}
              title={isViewer ? `Chỉ có khách hàng ${claimedGuestName || 'đang gọi món'} mới gửi được yêu cầu hỗ trợ và thanh toán.` : 'Yêu cầu thanh toán'}
              className={`min-h-[48px] rounded-2xl p-3.5 flex items-center justify-center gap-2 shadow-md transition ${
                isViewer
                  ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                  : 'bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-bold active:scale-95 cursor-pointer'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>
                {checkoutRequest
                  ? `Nhắc thanh toán ${checkoutRequest.call_count && checkoutRequest.call_count > 1 ? `(x${checkoutRequest.call_count})` : ''}`
                  : 'Yêu cầu thanh toán'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Assistance Modal */}
      {showAssistanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-5 h-5 text-teal-700" />
              <h3 className="font-bold text-slate-900 text-base">Gọi nhân viên tới bàn</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Bạn có thể để lại lời nhắn ngắn nếu cần yêu cầu đặc biệt (ví dụ: thêm thìa dĩa, lấy tương ớt...).
            </p>
            <textarea
              value={assistanceNote}
              onChange={(e) => setAssistanceNote(e.target.value)}
              placeholder="Lời nhắn ngắn (tuỳ chọn)..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 mb-4"
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
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm shadow-sm"
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
