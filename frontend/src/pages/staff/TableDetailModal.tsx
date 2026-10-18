import React, { useState, useEffect } from 'react';
import { StaffTable, BillSummary } from '../../types/index.js';
import { request } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  X, Check, CheckCheck, Ban, CreditCard, Sparkles, AlertTriangle, AlertCircle,
  Receipt, Clock, RefreshCw, MessageSquare, XCircle
} from 'lucide-react';

interface TableDetailModalProps {
  table: StaffTable | null;
  onClose: () => void;
  onRefresh: () => void;
}

export const TableDetailModal: React.FC<TableDetailModalProps> = ({ table, onClose, onRefresh }) => {
  const { hasPermission } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [billSummary, setBillSummary] = useState<BillSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Cancellation modal state
  const [cancelModalItem, setCancelModalItem] = useState<any | null>(null);
  const [cancelQty, setCancelQty] = useState<number>(1);
  const [cancelReason, setCancelReason] = useState<string>('Hết nguyên liệu');
  const [markItemOutOfStock, setMarkItemOutOfStock] = useState<boolean>(false);

  // Confirm settlement modal state
  const [showConfirmSettlement, setShowConfirmSettlement] = useState(false);
  const [settlementNote, setSettlementNote] = useState('');
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => {
    if (table?.active_session_id) {
      loadSessionData();
    }
  }, [table?.active_session_id]);

  const loadSessionData = async () => {
    if (!table?.active_session_id) return;
    setIsLoading(true);
    setActionError(null);
    try {
      const summary = await request<BillSummary>(`/staff/sessions/${table.active_session_id}/bill-summary`);
      setBillSummary(summary);

      // Also fetch items for the table session
      const ordersRes = await request<{ orders: any[] }>('/guest/orders', {
        headers: { 'x-tenant-id': localStorage.getItem('staff_tenant_id') || '' }
      }).catch(() => ({ orders: [] }));
      setOrders(ordersRes.orders || []);
    } catch (err: any) {
      setActionError(err.message || 'Lỗi tải dữ liệu phiên');
    } finally {
      setIsLoading(false);
    }
  };

  if (!table) return null;

  // Handlers
  const handleAcceptItem = async (orderItemId: string, quantity?: number) => {
    try {
      await request(`/staff/order-items/${orderItemId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ quantity })
      });
      setActionSuccess('Đã tiếp nhận món');
      await loadSessionData();
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi tiếp nhận món');
    }
  };

  const handleAcceptAll = async () => {
    if (!table.active_session_id) return;
    try {
      await request(`/staff/sessions/${table.active_session_id}/accept-all`, { method: 'POST' });
      setActionSuccess('Đã tiếp nhận toàn bộ món chờ');
      await loadSessionData();
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi tiếp nhận toàn bộ');
    }
  };

  const handleServeItem = async (orderItemId: string, quantity?: number) => {
    try {
      await request(`/staff/order-items/${orderItemId}/serve`, {
        method: 'POST',
        body: JSON.stringify({ quantity })
      });
      setActionSuccess('Đã đánh dấu phục vụ');
      await loadSessionData();
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi phục vụ món');
    }
  };

  const handleServeAll = async () => {
    if (!table.active_session_id) return;
    try {
      await request(`/staff/sessions/${table.active_session_id}/serve-all`, { method: 'POST' });
      setActionSuccess('Đã đánh dấu phục vụ toàn bộ món');
      await loadSessionData();
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi phục vụ toàn bộ');
    }
  };

  const handleAcceptAndServeAll = async () => {
    if (!table.active_session_id) return;
    try {
      await request(`/staff/sessions/${table.active_session_id}/accept-all`, { method: 'POST' });
      await request(`/staff/sessions/${table.active_session_id}/serve-all`, { method: 'POST' });
      setActionSuccess('Đã tiếp nhận và phục vụ toàn bộ món!');
      await loadSessionData();
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi tiếp nhận và phục vụ');
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalItem) return;
    try {
      await request(`/staff/order-items/${cancelModalItem.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: cancelQty,
          reason: cancelReason,
          markItemOutOfStock
        })
      });
      setCancelModalItem(null);
      setActionSuccess('Đã hủy món');
      await loadSessionData();
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi hủy món');
    }
  };

  // Confirm payment & close session (F10)
  const handleConfirmPaymentAndClose = async () => {
    if (!table.active_session_id || !billSummary) return;
    setIsSettling(true);
    setActionError(null);
    try {
      if (billSummary.unresolvedCount > 0) {
        // Automatically accept and serve any remaining items before settlement
        await request(`/staff/sessions/${table.active_session_id}/accept-all`, { method: 'POST' }).catch(() => {});
        await request(`/staff/sessions/${table.active_session_id}/serve-all`, { method: 'POST' }).catch(() => {});
      }

      // Re-fetch latest summary to get updated settlementVersion if items were served
      const latestSummary = await request<any>(`/staff/sessions/${table.active_session_id}/bill-summary`).catch(() => billSummary);

      await request(`/staff/sessions/${table.active_session_id}/confirm-payment-and-close`, {
        method: 'POST',
        body: JSON.stringify({
          settlementVersion: latestSummary?.settlementVersion || billSummary.settlementVersion,
          note: settlementNote.trim() || undefined,
          requestId: `pay-${Date.now()}`
        })
      });
      setShowConfirmSettlement(false);
      onRefresh();
      onClose();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi xác nhận thanh toán');
      setIsSettling(false);
    }
  };

  // Close session without charge (F12)
  const handleCloseWithoutCharge = async () => {
    if (!table.active_session_id) return;
    setIsSettling(true);
    setActionError(null);
    try {
      await request(`/staff/sessions/${table.active_session_id}/close-without-charge`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'WITHOUT_CHARGE' })
      });
      onRefresh();
      onClose();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi kết thúc phiên');
      setIsSettling(false);
    }
  };

  // Mark table ready after cleaning (F11)
  const handleMarkReady = async () => {
    try {
      await request(`/staff/tables/${table.table_id}/mark-ready`, { method: 'POST' });
      onRefresh();
      onClose();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi đánh dấu sẵn sàng');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Top Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900">Bàn {table.table_number}</h2>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                table.displayStatus === 'Sẵn sàng' ? 'bg-emerald-100 text-emerald-800' :
                table.displayStatus === 'Yêu cầu thanh toán' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                table.displayStatus === 'Chờ dọn' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {table.displayStatus}
              </span>
            </div>
            {table.opened_at && (
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Mở lúc {new Date(table.opened_at).toLocaleTimeString('vi-VN')}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Banners */}
        {actionError && (
          <div className="m-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div className="m-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-semibold">
            {actionSuccess}
          </div>
        )}



        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {table.active_session_id ? (
            <>
              {billSummary && (
                <div className="space-y-4">
                  {/* Itemized Bill Breakdown */}
                  <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
                    <div className="p-3.5 bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Chi tiết các món trong hóa đơn
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
                        {billSummary.rounds?.length || 0} lần gọi
                      </span>
                    </div>

                    {(!billSummary.rounds || billSummary.rounds.length === 0) && (
                      <div className="py-8 px-4 text-center text-slate-400 space-y-1">
                        <p className="text-sm font-bold text-slate-700">Chưa có order nào trong phiên này</p>
                        <p className="text-xs text-slate-500">
                          Nếu nhân viên ấn nhầm mở bàn, bạn có thể tắt bàn ngay bên dưới mà không tính tiền.
                        </p>
                      </div>
                    )}

                    {billSummary.rounds?.map((round) => (
                      <div key={round.orderNumber} className="p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                          <span>Lần gọi {round.orderNumber}</span>
                          <span className="text-slate-900">{round.acceptedOrServedSubtotal.toLocaleString('vi-VN')}đ</span>
                        </div>

                        <div className="space-y-1.5 pl-2 border-l-2 border-slate-200">
                          {round.items.map((item, idx) => (
                            <div key={idx} className="space-y-0.5">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-700">{item.quantity}x</span>
                                  <span className={`truncate max-w-[200px] ${item.status === 'CANCELLED' ? 'line-through text-slate-400' : 'text-slate-900 font-medium'}`}>
                                    {item.name}
                                  </span>
                                  {item.status === 'CANCELLED' && (
                                    <span className="text-[10px] text-rose-600 font-semibold">(Đã hủy)</span>
                                  )}
                                  {item.status === 'PENDING' && (
                                    <span className="text-[10px] text-amber-600 font-semibold">(Chờ nhận)</span>
                                  )}
                                </div>
                                <span className={`font-semibold ${item.status === 'CANCELLED' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                  {item.status === 'CANCELLED' ? '0đ' : `${item.subtotal.toLocaleString('vi-VN')}đ`}
                                </span>
                              </div>
                              {item.note && (
                                <div className="text-[11px] text-amber-800 font-medium italic pl-4">
                                  Ghi chú: {item.note}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}

                  {/* Pending subtotal note */}
                  {billSummary.pendingTotal > 0 && (
                    <div className="p-3 bg-amber-50/80 flex items-center justify-between text-xs border-t border-amber-100">
                      <span className="text-amber-800 font-medium">Chờ tiếp nhận (chưa tính vào tổng):</span>
                      <span className="font-bold text-amber-900">{billSummary.pendingTotal.toLocaleString('vi-VN')}đ</span>
                    </div>
                  )}

                  {/* Total Row */}
                  <div className="p-4 bg-slate-50 flex items-center justify-between border-t-2 border-slate-200">
                    <div>
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Tổng thanh toán</span>
                      <span className="text-[11px] text-slate-400">(Các món đã phục vụ/tiếp nhận)</span>
                    </div>
                    <span className="text-2xl font-black text-orange-600">
                      {billSummary.validBillTotal.toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                </div>

                {/* Quick serve & settle option if unresolved items remain */}
                {billSummary.unresolvedCount > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-start gap-2.5 text-xs text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong>Còn {billSummary.unresolvedCount} món chưa phục vụ xong:</strong>
                        <p className="mt-0.5 text-amber-800">
                          Khách muốn thanh toán ngay? Bấm nút bên dưới để tự động tiếp nhận & phục vụ tất cả món để chốt bill.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleAcceptAndServeAll}
                      className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 min-h-[44px]"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>⚡ Tiếp nhận & Phục vụ tất cả để chốt bill ngay</span>
                    </button>
                  </div>
                )}

                {/* Action Buttons: 0đ Session vs Settling Session */}
                {(() => {
                  const totalPayable = billSummary ? Math.max(
                    (billSummary.validBillTotal || 0) + (billSummary.pendingTotal || 0),
                    (billSummary.rounds || []).reduce((acc: number, round: any) => {
                      return acc + (round.items || []).filter((i: any) => i.status !== 'CANCELLED').reduce((s: number, item: any) => s + (item.subtotal || item.price * item.quantity), 0);
                    }, 0)
                  ) : 0;

                  if (totalPayable === 0) {
                    return (
                      <button
                        onClick={handleCloseWithoutCharge}
                        disabled={isSettling}
                        className="w-full min-h-[48px] bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 text-white font-black rounded-2xl py-3 px-4 shadow-md flex items-center justify-center gap-2 transition"
                      >
                        <XCircle className="w-5 h-5" />
                        <span>{isSettling ? 'Đang tắt bàn...' : 'Tắt bàn (0đ)'}</span>
                      </button>
                    );
                  }

                  return hasPermission('session.confirm_payment_close') ? (
                    <button
                      onClick={() => setShowConfirmSettlement(true)}
                      disabled={isSettling}
                      className="w-full min-h-[52px] bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-40 text-white font-black rounded-2xl py-3.5 px-4 shadow-lg flex items-center justify-center gap-2 transition"
                    >
                      <CreditCard className="w-5 h-5" />
                      <span>Xác nhận đã thanh toán {totalPayable.toLocaleString('vi-VN')}đ & Kết thúc phiên</span>
                    </button>
                  ) : (
                    <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-2xl text-xs text-slate-600 space-y-1">
                      <span className="font-bold text-slate-800 block">🔒 Giới hạn phân quyền</span>
                      <p>
                        Tài khoản phục vụ không có quyền chốt bill. Hãy đăng nhập tài khoản <strong>Quản lý</strong> (<code>admin@phoco.vn</code>) hoặc <strong>Thu ngân</strong> (<code>thungan@phoco.vn</code>) để xác nhận thanh toán.
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
            </>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <p>Bàn hiện tại chưa mở phiên</p>
            </div>
          )}
        </div>

        {/* Cancellation Modal */}
        {cancelModalItem && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-in">
              <h3 className="font-bold text-slate-900 text-base">Hủy món: {cancelModalItem.name}</h3>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Số lượng cần hủy</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={cancelModalItem.quantity}
                    value={cancelQty}
                    onChange={(e) => setCancelQty(Math.max(1, Math.min(cancelModalItem.quantity, parseInt(e.target.value) || 1)))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-center"
                  />
                  <span className="text-xs text-slate-400 font-medium">/ {cancelModalItem.quantity}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Lý do hủy</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                >
                  <option value="Hết nguyên liệu">Hết nguyên liệu</option>
                  <option value="Hết món">Hết món</option>
                  <option value="Khách đổi ý trước khi làm">Khách đổi ý</option>
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 pt-1">
                <input
                  type="checkbox"
                  checked={markItemOutOfStock}
                  onChange={(e) => setMarkItemOutOfStock(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500"
                />
                <span>Đồng thời đánh dấu món này là <strong>Hết món</strong> trên menu</span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setCancelModalItem(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-xs min-h-[44px]"
                >
                  Đóng
                </button>
                <button
                  onClick={handleConfirmCancel}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm min-h-[44px]"
                >
                  Xác nhận hủy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Settlement Modal */}
        {showConfirmSettlement && billSummary && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-in">
              <div className="flex items-center gap-2 text-orange-600">
                <CreditCard className="w-6 h-6" />
                <h3 className="font-extrabold text-slate-900 text-base">Xác nhận thanh toán thủ công</h3>
              </div>

              {actionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                  {actionError}
                </div>
              )}

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Bàn:</span>
                  <span className="font-bold text-slate-900">{table.table_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Số tiền xác nhận đã thu:</span>
                  <span className="font-extrabold text-sm text-orange-600">
                    {Math.max(
                      (billSummary.validBillTotal || 0) + (billSummary.pendingTotal || 0),
                      (billSummary.rounds || []).reduce((acc: number, round: any) => {
                        return acc + (round.items || []).filter((i: any) => i.status !== 'CANCELLED').reduce((s: number, item: any) => s + (item.subtotal || item.price * item.quantity), 0);
                      }, 0)
                    ).toLocaleString('vi-VN')}đ
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Sau khi xác nhận:
                <br />• Phiên bàn sẽ <strong>kết thúc</strong> ngay lập tức.
                <br />• Quyền truy cập của khách tại bàn sẽ bị thu hồi.
                <br />• Bàn chuyển sang trạng thái <strong>Chờ dọn</strong> trước khi đón lượt mới.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Ghi chú (tuỳ chọn)</label>
                <input
                  type="text"
                  value={settlementNote}
                  onChange={(e) => setSettlementNote(e.target.value)}
                  placeholder="Ví dụ: Tiền mặt đủ, chuyển khoản qua QR cá nhân..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowConfirmSettlement(false)}
                  disabled={isSettling}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-xs min-h-[44px]"
                >
                  Kiểm tra lại
                </button>
                <button
                  onClick={handleConfirmPaymentAndClose}
                  disabled={isSettling}
                  className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md min-h-[44px]"
                >
                  {isSettling ? 'Đang xác nhận...' : 'Đã nhận đủ tiền'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
