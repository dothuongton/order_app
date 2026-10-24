import React, { useEffect, useState } from 'react';
import { request } from '../../api/client.js';
import { BillSummary } from '../../types/index.js';
import { X, Printer, Receipt, XCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { isSessionCancelled, formatCancelReason, getSessionReportStatus } from './StaffReports.js';

interface ReceiptDetailModalProps {
  session: {
    session_id: string;
    table_number: string;
    confirmed_amount: number;
    confirmed_at: string;
    confirmed_by_name: string;
    settlement_note?: string;
    opened_at?: string;
    session_status?: string;
    close_reason?: string;
    bill_status?: string;
    opening_guest_name?: string | null;
  } | null;
  onClose: () => void;
}

export const getReceiptItemsForDisplay = (items: BillSummary['rounds'][number]['items'], amount: number) =>
  Number(amount) === 0 ? items : items.filter(item => item.status !== 'CANCELLED');

export const ReceiptDetailModal: React.FC<ReceiptDetailModalProps> = ({ session, onClose }) => {
  const { currentTenant } = useAuth();
  const [billSummary, setBillSummary] = useState<BillSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.session_id) return;
    const fetchBill = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await request<BillSummary>(`/staff/sessions/${session.session_id}/bill-summary`);
        setBillSummary(data);
      } catch (err: any) {
        setError(err.message || 'Không thể tải chi tiết hóa đơn');
      } finally {
        setIsLoading(false);
      }
    };
    fetchBill();
  }, [session?.session_id]);

  if (!session) return null;

  const handlePrint = () => {
    window.print();
  };

  // Flatten items for printing summary
  const allItems = billSummary?.rounds?.flatMap(r => r.items) || [];
  const showZeroValueItems = Number(session.confirmed_amount) === 0;
  const displayItems = getReceiptItemsForDisplay(allItems, session.confirmed_amount);
  const isCancelled = isSessionCancelled(session);
  const receiptStatus = getSessionReportStatus(session);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] staff-density-modal">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {Number(session.confirmed_amount) === 0 ? 'Biên nhận phiên 0đ' : 'Hóa đơn thanh toán'}
              </h3>
              <p className="text-xs text-slate-500">Bàn {session.table_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Receipt Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 print:p-0">
          {isLoading ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
              <p className="text-xs">Đang tải hóa đơn...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
              {error}
            </div>
          ) : (
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-200/80 font-mono text-xs space-y-3 print:bg-white print:border-none print:p-0">
              {/* Receipt Header */}
              <div className="text-center pb-3 border-b border-dashed border-slate-300 space-y-1">
                <h2 className="font-extrabold text-base text-slate-900 font-sans tracking-wide">
                  {currentTenant?.name || 'NHÀ HÀNG'}
                </h2>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest font-sans font-bold">
                  HÓA ĐƠN BÁN HÀNG
                </p>
                <div className="text-[11px] text-slate-600 pt-1 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Bàn:</span>
                    <strong className="font-bold text-slate-900 font-sans">Bàn {session.table_number}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Mã phiên:</span>
                    <span>#{session.session_id.slice(0, 8).toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Thời gian:</span>
                    <span>{new Date(session.confirmed_at).toLocaleString('vi-VN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{Number(session.confirmed_amount) === 0 ? 'Người xử lý:' : 'Thu ngân:'}</span>
                    <span>{session.confirmed_by_name}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="shrink-0">Người yêu cầu mở bàn:</span>
                    <span className="text-right">{billSummary?.openingGuestName || session.opening_guest_name || 'Không ghi nhận tên'}</span>
                  </div>
                  {receiptStatus && (
                    <div className="flex justify-between items-center pt-0.5 font-sans">
                      <span className="text-slate-600">Trạng thái:</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                        isCancelled ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}>
                        {isCancelled && <XCircle className="w-3 h-3 text-rose-600 shrink-0" />}
                        <span>{receiptStatus.label}</span>
                      </span>
                    </div>
                  )}
                  {session.settlement_note && (
                    <div className="flex justify-between text-amber-700 pt-0.5">
                      <span>Ghi chú:</span>
                      <span className="italic">{session.settlement_note}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 py-1">
                <div className="flex justify-between font-bold text-slate-500 text-[10px] uppercase pb-1 border-b border-slate-200">
                  <span className="flex-1">Món ăn</span>
                  <span className="w-10 text-center">SL</span>
                  <span className="w-16 text-right">Đơn giá</span>
                  <span className="w-20 text-right">T.Tiền</span>
                </div>

                {showZeroValueItems && allItems.length > 0 && (
                  <p className="text-[10px] font-bold text-rose-700 bg-rose-50 rounded-lg px-2 py-1.5">
                    Món khách đã gọi trong phiên 0đ (hiển thị cả món đã hủy)
                  </p>
                )}

                {displayItems.map((item, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between items-baseline text-slate-800">
                      <span className={`flex-1 font-sans font-semibold text-[11px] pr-1 ${
                        item.status === 'CANCELLED' ? 'line-through text-slate-400' : 'text-slate-800'
                      }`}>
                        {item.name}
                        {item.variantName && (
                          <span className="ml-1 text-[10px] text-[var(--brand-accent-dark)] font-bold">({item.variantName})</span>
                        )}
                      </span>
                      <span className="w-10 text-center font-bold">{item.quantity}</span>
                      <span className="w-16 text-right text-slate-500">
                        {item.price.toLocaleString('vi-VN')}
                      </span>
                      <span className="w-20 text-right font-bold text-slate-900">
                        {item.subtotal.toLocaleString('vi-VN')}đ
                      </span>
                    </div>
                    {item.note && (
                      <div className="text-[10px] text-amber-700 italic pl-1">
                        * {item.note}
                      </div>
                    )}
                    {showZeroValueItems && item.status === 'CANCELLED' && (
                      <div className="text-[10px] text-rose-700 font-semibold pl-1">
                        Đã hủy · {formatCancelReason(item.cancelReason).replace(/^Đã hủy:\s*/, '')}
                      </div>
                    )}
                  </div>
                ))}

                {displayItems.length === 0 && (
                  <p className="text-center py-4 text-slate-400 italic">
                    {isCancelled ? 'Không ghi nhận món đã gọi trong phiên này' : 'Không có món ăn phát sinh trong hóa đơn này'}
                  </p>
                )}
              </div>

              {/* Total Calculation */}
              <div className="pt-3 border-t border-dashed border-slate-300 space-y-1.5">
                <div className="flex justify-between items-center text-sm font-sans font-extrabold text-slate-900">
                  <span>TỔNG CỘNG:</span>
                  <span className="text-base text-[var(--brand-accent-text)] font-black">
                    {Number(session.confirmed_amount).toLocaleString('vi-VN')}đ
                  </span>
                </div>
                {receiptStatus && (
                  <div className="flex items-center justify-center gap-1.5 text-[11px] font-sans font-bold pt-1">
                    <span className={`${isCancelled ? 'text-rose-600' : 'text-amber-700'} flex items-center gap-1`}>
                      {isCancelled ? <XCircle className="w-3.5 h-3.5" /> : <Receipt className="w-3.5 h-3.5" />}
                      <span>{receiptStatus.label.toUpperCase()}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Receipt Footer */}
              <div className="text-center pt-3 border-t border-slate-200 text-[10px] text-slate-400 font-sans">
                <p>Cảm ơn Quý khách & Hẹn gặp lại!</p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="p-4 border-t border-slate-100 flex items-center gap-2 bg-slate-50 print:hidden">
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] text-[var(--brand-on-accent)] font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 min-h-[44px]"
          >
            <Printer className="w-4 h-4" />
            <span>In hóa đơn</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition min-h-[44px]"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
