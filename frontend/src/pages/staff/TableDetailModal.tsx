import React, { useState, useEffect, useRef } from 'react';
import { StaffTable, BillSummary } from '../../types/index.js';
import { request } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  X, Check, CheckCheck, Ban, CreditCard, Sparkles, AlertTriangle, AlertCircle,
  Receipt, Clock, RefreshCw, MessageSquare, XCircle, UtensilsCrossed, Plus, Store,
  Edit3, Trash2
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

  // Edit & Delete Table state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTableNumber, setEditTableNumber] = useState(table?.table_number || '');
  const [editTableCapacity, setEditTableCapacity] = useState(table?.capacity || 4);
  const [isUpdatingTable, setIsUpdatingTable] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingTable, setIsDeletingTable] = useState(false);
  const [isReleasingClaim, setIsReleasingClaim] = useState(false);

  useEffect(() => {
    if (table) {
      setEditTableNumber(table.table_number);
      setEditTableCapacity(table.capacity || 4);
    }
  }, [table]);

  // Cancellation modal state
  const [cancelModalItem, setCancelModalItem] = useState<any | null>(null);
  const [cancelQty, setCancelQty] = useState<number>(1);
  const [cancelReason, setCancelReason] = useState<string>('Hết nguyên liệu');
  const [markItemOutOfStock, setMarkItemOutOfStock] = useState<boolean>(false);

  // Confirm settlement modal state
  const [showConfirmSettlement, setShowConfirmSettlement] = useState(false);
  const [settlementNote, setSettlementNote] = useState('');
  const [isSettling, setIsSettling] = useState(false);

  // Scope & Operation Identity refs (R1)
  const currentSessionRef = useRef<string | null>(null);
  const modalScopeRef = useRef<number>(0);
  const activeOperationRef = useRef<number>(0);
  const operationCounterRef = useRef<number>(0);

  // Reset modal state whenever the active table or session changes or closes
  useEffect(() => {
    // Invalidate prior scope on table/session change or close/reopen
    modalScopeRef.current += 1;
    activeOperationRef.current = 0;
    const currentSessionId = table?.active_session_id || null;
    currentSessionRef.current = currentSessionId;
    setIsSettling(false);
    setShowConfirmSettlement(false);
    setSettlementNote('');
    setActionError(null);
    setActionSuccess(null);

    if (currentSessionId) {
      loadSessionData(currentSessionId);
    } else {
      setBillSummary(null);
      setOrders([]);
    }
  }, [table?.table_id, table?.active_session_id]);

  const loadSessionData = async (targetSessionId?: string) => {
    const sessionId = targetSessionId || table?.active_session_id;
    if (!sessionId) return;
    const capturedScope = modalScopeRef.current;
    setIsLoading(true);
    setActionError(null);
    try {
      const summary = await request<BillSummary>(`/staff/sessions/${sessionId}/bill-summary`);
      if (modalScopeRef.current !== capturedScope || currentSessionRef.current !== sessionId) return;
      setBillSummary(summary);

      // Also fetch items for the table session
      const ordersRes = await request<{ orders: any[] }>('/guest/orders', {
        headers: { 'x-tenant-id': localStorage.getItem('staff_tenant_id') || '' }
      }).catch(() => ({ orders: [] }));
      if (modalScopeRef.current !== capturedScope || currentSessionRef.current !== sessionId) return;
      setOrders(ordersRes.orders || []);
    } catch (err: any) {
      if (modalScopeRef.current !== capturedScope || currentSessionRef.current !== sessionId) return;
      setActionError(err.message || 'Lỗi tải dữ liệu phiên');
    } finally {
      if (modalScopeRef.current === capturedScope && currentSessionRef.current === sessionId) {
        setIsLoading(false);
      }
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
    if (!table?.active_session_id || !billSummary) return;
    if (isSettling) return; // Prevent duplicate clicks while in-flight
    const operationId = ++operationCounterRef.current;
    activeOperationRef.current = operationId;
    const capturedScope = modalScopeRef.current;
    const targetSessionId = table.active_session_id;

    const isCurrentOperation = () => (
      modalScopeRef.current === capturedScope &&
      activeOperationRef.current === operationId &&
      currentSessionRef.current === targetSessionId
    );

    setIsSettling(true);
    setActionError(null);
    try {
      if (billSummary.unresolvedCount > 0) {
        setActionError('Còn món chưa được tiếp nhận hoặc phục vụ. Vui lòng hoàn tất hoặc hủy trước khi chốt hóa đơn.');
        return;
      }

      // Capture the exact amount and version the staff viewed on screen
      const displayedAmount = billSummary.validBillTotal;
      const displayedVersion = billSummary.settlementVersion;

      // Verify with server summary to prevent closing on stale data without re-confirmation
      const latestSummary = await request<any>(`/staff/sessions/${targetSessionId}/bill-summary`).catch(() => null);
      if (!isCurrentOperation()) return;

      if (latestSummary && (latestSummary.validBillTotal !== displayedAmount || latestSummary.settlementVersion !== displayedVersion)) {
        await loadSessionData(targetSessionId);
        if (!isCurrentOperation()) return;
        setShowConfirmSettlement(false);
        setActionError(
          `Số tiền thanh toán hoặc thông tin đơn đã thay đổi (từ ${displayedAmount.toLocaleString('vi-VN')}đ sang ${(latestSummary.validBillTotal ?? 0).toLocaleString('vi-VN')}đ). Vui lòng kiểm tra và xác nhận lại hóa đơn mới.`
        );
        return;
      }

      await request(`/staff/sessions/${targetSessionId}/confirm-payment-and-close`, {
        method: 'POST',
        body: JSON.stringify({
          settlementVersion: displayedVersion,
          expectedAmount: displayedAmount,
          note: settlementNote.trim() || undefined,
          requestId: `pay-${Date.now()}`
        })
      });

      if (!isCurrentOperation()) {
        // Old mutation completed on server: synchronize dashboard but do not close unrelated modal
        onRefresh();
        return;
      }

      setShowConfirmSettlement(false);
      onRefresh();
      onClose();
    } catch (err: any) {
      if (!isCurrentOperation()) return;
      if (err.code === 'PRICE_CHANGED' || err.code === 'PROMOTION_EXHAUSTED' || err.status === 409 || err.message?.includes('thay đổi') || err.message?.includes('hết lượt')) {
        await loadSessionData(targetSessionId);
        if (!isCurrentOperation()) return;
        setShowConfirmSettlement(false);
        setActionError(err.message || 'Số tiền thanh toán hoặc khuyến mãi đã thay đổi. Vui lòng kiểm tra và xác nhận lại hóa đơn mới.');
      } else {
        setActionError(err.message || 'Lỗi xác nhận thanh toán');
      }
    } finally {
      if (activeOperationRef.current === operationId && modalScopeRef.current === capturedScope) {
        setIsSettling(false);
      }
    }
  };

  // Close session without charge (F12)
  const handleCloseWithoutCharge = async () => {
    if (!table?.active_session_id) return;
    if (isSettling) return; // Prevent duplicate clicks
    const operationId = ++operationCounterRef.current;
    activeOperationRef.current = operationId;
    const capturedScope = modalScopeRef.current;
    const targetSessionId = table.active_session_id;

    const isCurrentOperation = () => (
      modalScopeRef.current === capturedScope &&
      activeOperationRef.current === operationId &&
      currentSessionRef.current === targetSessionId
    );

    setIsSettling(true);
    setActionError(null);
    try {
      await request(`/staff/sessions/${targetSessionId}/close-without-charge`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'WITHOUT_CHARGE' })
      });

      if (!isCurrentOperation()) {
        onRefresh();
        return;
      }

      onRefresh();
      onClose();
    } catch (err: any) {
      if (!isCurrentOperation()) return;
      setActionError(err.message || 'Lỗi kết thúc phiên');
    } finally {
      if (activeOperationRef.current === operationId && modalScopeRef.current === capturedScope) {
        setIsSettling(false);
      }
    }
  };

  // Mark table ready after cleaning (F11)
  const handleMarkReady = async () => {
    const capturedScope = modalScopeRef.current;
    try {
      await request(`/staff/tables/${table.table_id}/mark-ready`, { method: 'POST' });
      if (modalScopeRef.current !== capturedScope) {
        onRefresh();
        return;
      }
      onRefresh();
      onClose();
    } catch (err: any) {
      if (modalScopeRef.current !== capturedScope) return;
      setActionError(err.message || 'Lỗi đánh dấu sẵn sàng');
    }
  };

  // Open session from modal when table is empty
  const handleOpenFromModal = async () => {
    if (!table) return;
    setIsLoading(true);
    setActionError(null);
    try {
      await request(`/staff/tables/${table.table_id}/open`, { method: 'POST' });
      onRefresh();
      onClose();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi mở phiên bàn');
      setIsLoading(false);
    }
  };

  // Release device claim (Gaeru P1)
  const handleReleaseClaim = async () => {
    if (!table?.table_id) return;
    setIsReleasingClaim(true);
    setActionError(null);
    try {
      await request(`/staff/tables/${table.table_id}/release-claim`, { method: 'POST' });
      setActionSuccess('Đã giải phóng thiết bị gọi món của bàn này.');
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi giải phóng thiết bị');
    } finally {
      setIsReleasingClaim(false);
    }
  };

  const handleUpdateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!table || !editTableNumber.trim()) return;
    setIsUpdatingTable(true);
    setActionError(null);
    try {
      await request(`/staff/tables/${table.table_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          table_number: editTableNumber.trim(),
          capacity: Number(editTableCapacity) || 4
        })
      });
      setShowEditModal(false);
      setActionSuccess(`Đã cập nhật bàn "${editTableNumber.trim()}"`);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi cập nhật bàn');
    } finally {
      setIsUpdatingTable(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!table) return;
    setIsDeletingTable(true);
    setActionError(null);
    try {
      await request(`/staff/tables/${table.table_id}`, {
        method: 'DELETE'
      });
      setShowDeleteModal(false);
      onRefresh();
      onClose();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi xóa bàn');
      setShowDeleteModal(false);
    } finally {
      setIsDeletingTable(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up staff-density-modal">
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
          <div className="flex items-center gap-1">
            {hasPermission('table.manage') && (
              <>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="w-9 h-9 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition cursor-pointer"
                  title="Sửa bàn"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="w-9 h-9 rounded-full hover:bg-rose-100 flex items-center justify-center text-rose-500 hover:text-rose-700 transition cursor-pointer"
                  title="Xóa bàn"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
                          <div className="flex items-center gap-1.5">
                            <span>Lần gọi {round.orderNumber}</span>
                            {round.appliedPromotion && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                🎁 {round.appliedPromotion.title}
                              </span>
                            )}
                          </div>
                          <span className="text-slate-900">{round.acceptedOrServedSubtotal.toLocaleString('vi-VN')}đ</span>
                        </div>

                        <div className="space-y-1.5 pl-2 border-l-2 border-slate-200">
                          {round.items.map((item, idx) => (
                            <div key={idx} className="space-y-1 bg-slate-50/70 p-2 rounded-xl">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span className="font-bold text-slate-700 shrink-0">{item.quantity}x</span>
                                  <span className={`truncate ${item.status === 'CANCELLED' ? 'line-through text-slate-400' : 'text-slate-900 font-semibold'}`}>
                                    {item.name}
                                  </span>
                                  {item.variantName && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-[var(--brand-accent-tint)] text-[var(--brand-accent-dark)] rounded shrink-0">
                                      {item.variantName}
                                    </span>
                                  )}
                                  {item.status === 'CANCELLED' && (
                                    <span className="text-[10px] text-rose-600 font-bold shrink-0">(Đã hủy)</span>
                                  )}
                                  {item.status === 'PENDING' && (
                                    <span className="text-[10px] text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded-md font-extrabold shrink-0">Chờ nhận</span>
                                  )}
                                  {item.status === 'ACCEPTED' && (
                                    <span className="text-[10px] text-blue-700 bg-blue-100/90 px-1.5 py-0.5 rounded-md font-extrabold shrink-0">Đã nhận</span>
                                  )}
                                  {item.status === 'SERVED' && (
                                    <span className="text-[10px] text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded-md font-extrabold shrink-0">Đã phục vụ</span>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <span className={`font-bold ${item.status === 'CANCELLED' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                    {item.status === 'CANCELLED' ? '0đ' : `${item.subtotal.toLocaleString('vi-VN')}đ`}
                                  </span>
                                  {item.status !== 'CANCELLED' && typeof item.rawPrice === 'number' && item.rawPrice > item.subtotal && (
                                    <span className="block text-[10px] text-slate-400 line-through">
                                      {item.rawPrice.toLocaleString('vi-VN')}đ
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Item actions: quick accept / serve / cancel */}
                              {(item.status === 'PENDING' || item.status === 'ACCEPTED') && item.itemId && (
                                <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-200/60">
                                  {item.status === 'PENDING' && (
                                    <button
                                      onClick={() => handleAcceptItem(item.itemId)}
                                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Nhận món</span>
                                    </button>
                                  )}
                                  {item.status === 'ACCEPTED' && (
                                    <button
                                      onClick={() => handleServeItem(item.itemId)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                                    >
                                      <UtensilsCrossed className="w-3 h-3" />
                                      <span>Phục vụ</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setCancelModalItem({ id: item.itemId, name: item.name, quantity: item.quantity })}
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                                  >
                                    <X className="w-3 h-3" />
                                    <span>Hủy</span>
                                  </button>
                                </div>
                              )}

                              {item.note && (
                                <div className="text-[11px] text-amber-800 font-medium italic">
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
                      <span className="text-amber-800 font-medium">Chờ tiếp nhận (chưa tính vào tổng bill):</span>
                      <span className="font-bold text-amber-900">{billSummary.pendingTotal.toLocaleString('vi-VN')}đ</span>
                    </div>
                  )}

                  {/* Promo discount breakdown */}
                  {typeof billSummary.totalDiscount === 'number' && billSummary.totalDiscount > 0 && (
                    <div className="p-3 bg-emerald-50/70 border-t border-emerald-100 space-y-1 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Tạm tính (chưa giảm):</span>
                        <span className="font-semibold">{((billSummary.rawBillTotal || (billSummary.validBillTotal + billSummary.totalDiscount))).toLocaleString('vi-VN')}đ</span>
                      </div>
                      <div className="flex items-center justify-between text-emerald-700 font-bold">
                        <span className="flex items-center gap-1">🎁 Khuyến mãi giảm giá:</span>
                        <span>-{billSummary.totalDiscount.toLocaleString('vi-VN')}đ</span>
                      </div>
                      {billSummary.appliedPromotions && billSummary.appliedPromotions.length > 0 && (
                        <div className="pt-0.5 flex flex-wrap gap-1">
                          {billSummary.appliedPromotions.map((p: any) => (
                            <span key={p.id} className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">
                              {p.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Total Row */}
                  <div className="p-4 bg-slate-50 flex items-center justify-between border-t-2 border-slate-200">
                    <div>
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Tổng thanh toán</span>
                      <span className="text-[11px] text-slate-400">(Các món đã phục vụ/tiếp nhận)</span>
                    </div>
                    <span className="text-2xl font-black text-[var(--brand-accent-text)]">
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
                          Đơn có món đang chờ nhận hoặc chưa phục vụ. Khách muốn chốt bill ngay? Bấm nút bên dưới để tự động hoàn tất tất cả món.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleAcceptAndServeAll}
                      disabled={!hasPermission('order.manage') || !hasPermission('order.serve')}
                      className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 min-h-[44px]"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>⚡ Tiếp nhận & Phục vụ tất cả để chốt bill ngay</span>
                    </button>
                  </div>
                )}

                {/* Action Buttons: 0đ Session vs Settling Session */}
                {(() => {
                  const hasUnresolved = (billSummary.unresolvedCount || 0) > 0;
                  const totalPayable = billSummary ? (billSummary.validBillTotal || 0) : 0;

                  // Case 1: Still has pending / unserved items -> CANNOT confirm payment yet!
                  if (hasUnresolved) {
                    return (
                      <div className="space-y-2">
                        <button
                          disabled={true}
                          className="w-full min-h-[52px] bg-slate-100 border border-slate-300 text-slate-400 font-bold rounded-2xl py-3.5 px-4 flex items-center justify-center gap-2 cursor-not-allowed"
                          title="Chưa thể chốt bill khi còn món đang chờ tiếp nhận hoặc chưa phục vụ"
                        >
                          <CreditCard className="w-5 h-5 text-slate-400" />
                          <span>Còn {billSummary.unresolvedCount} món chưa xong - Chưa thể tính bill</span>
                        </button>
                        <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                          💡 Đơn đang chờ nhận không thể tính bill. Hãy bấm nút <strong>"Tiếp nhận & Phục vụ tất cả"</strong> ở trên hoặc bấm <strong>"Hủy"</strong> từng món nếu khách không dùng.
                        </p>
                      </div>
                    );
                  }

                  // Case 2: 0 unresolved items, but total is 0đ (e.g. empty session or all items cancelled) -> Tắt bàn 0đ
                  if (totalPayable === 0 && !billSummary.rounds.some(round => round.items.some(item => item.status === 'SERVED'))) {
                    return (
                      <button
                        onClick={handleCloseWithoutCharge}
                        disabled={isSettling || !hasPermission('session.close_without_charge')}
                        className="w-full min-h-[48px] bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 text-white font-black rounded-2xl py-3 px-4 shadow-md flex items-center justify-center gap-2 transition"
                      >
                        <XCircle className="w-5 h-5" />
                        <span>{isSettling ? 'Đang tắt bàn...' : 'Tắt bàn (0đ)'}</span>
                      </button>
                    );
                  }

                  // Case 3: Ready to pay (all served, total > 0)
                  return hasPermission('session.confirm_payment_close') ? (
                    <button
                      onClick={() => setShowConfirmSettlement(true)}
                      disabled={isSettling}
                      className="w-full min-h-[52px] bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] active:opacity-90 disabled:opacity-40 text-[var(--brand-on-accent)] font-black rounded-2xl py-3.5 px-4 shadow-lg flex items-center justify-center gap-2 transition"
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

                {/* Release Claim (Gaeru P1) */}
                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    <span>Đổi máy gọi món / giải phóng quyền đặt</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleReleaseClaim}
                    disabled={isReleasingClaim}
                    className="px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition cursor-pointer"
                  >
                    {isReleasingClaim ? 'Đang giải phóng...' : 'Giải phóng máy gọi'}
                  </button>
                </div>
              </div>
            )}
            </>
          ) : (
            <div className="text-center py-10 text-slate-500 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                <Store className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-slate-800 text-base">Bàn {table.table_number} đang trống</h4>
                <p className="text-xs text-slate-400">Sẵn sàng để mở phiên đón khách gọi món</p>
              </div>
              <button
                type="button"
                onClick={handleOpenFromModal}
                disabled={!hasPermission('session.open') || isLoading}
                className="py-3 px-6 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] active:opacity-90 disabled:opacity-50 text-[var(--brand-on-accent)] font-extrabold text-xs rounded-2xl shadow-md transition inline-flex items-center gap-2 min-h-[46px]"
              >
                <Plus className="w-4 h-4" />
                <span>{isLoading ? 'Đang mở bàn...' : 'Mở bàn đón khách ngay'}</span>
              </button>
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
                  className="w-4 h-4 rounded text-[var(--brand-accent)] focus:ring-[var(--brand-accent)]"
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
              <div className="flex items-center gap-2 text-[var(--brand-accent-text)]">
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
                  <span className="font-extrabold text-sm text-[var(--brand-accent-text)]">
                    {((billSummary.validBillTotal || 0) + (billSummary.pendingTotal || 0)).toLocaleString('vi-VN')}đ
                  </span>
                </div>
                {typeof billSummary.totalDiscount === 'number' && billSummary.totalDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Đã trừ khuyến mãi:</span>
                    <span>-{billSummary.totalDiscount.toLocaleString('vi-VN')}đ</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500">
                Sau khi xác nhận:
                <br />• Phiên bàn sẽ <strong>kết thúc</strong> ngay lập tức.
                <br />• Quyền truy cập của khách tại bàn sẽ bị thu hồi.
                <br />• Bàn chuyển sang trạng thái <strong>Sẵn sàng</strong> để đón lượt mới.
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
                  className="flex-1 py-2.5 rounded-xl bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] text-[var(--brand-on-accent)] font-bold text-xs shadow-md min-h-[44px]"
                >
                  {isSettling ? 'Đang xác nhận...' : 'Đã nhận đủ tiền'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EDIT TABLE MODAL */}
        {showEditModal && (
          <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-slide-up">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-[var(--brand-accent-text)]" />
                  <span>Chỉnh Sửa Bàn</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateTable} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Số Bàn / Tên Bàn *</label>
                  <input
                    type="text"
                    required
                    value={editTableNumber}
                    onChange={(e) => setEditTableNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-[var(--brand-accent)] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Sức Chứa Dự Kiến (Người)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={editTableCapacity}
                    onChange={(e) => setEditTableCapacity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-[var(--brand-accent)] text-sm"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingTable || !editTableNumber.trim()}
                    className="flex-1 py-2.5 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] active:scale-95 text-[var(--brand-on-accent)] font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                  >
                    {isUpdatingTable ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* DELETE TABLE CONFIRMATION MODAL */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-slide-up">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>Xác Nhận Xóa Bàn</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-600">
                Bạn có chắc chắn muốn xóa <strong className="text-slate-900">Bàn {table.table_number}</strong>?
                Mã QR tương ứng sẽ không thể dùng để gọi món nữa.
              </p>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={isDeletingTable}
                  onClick={handleDeleteTable}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
                >
                  {isDeletingTable ? 'Đang xóa...' : 'Xóa Bàn'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
