import React, { useEffect, useState } from 'react';
import { request } from '../../api/client.js';
import { BillSummary } from '../../types/index.js';
import { X, Printer, Receipt, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface ReceiptDetailModalProps {
  session: {
    session_id: string;
    table_number: string;
    confirmed_amount: number;
    confirmed_at: string;
    confirmed_by_name: string;
    settlement_note?: string;
    opened_at?: string;
  } | null;
  onClose: () => void;
}

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
  const validItems = allItems.filter(i => i.status !== 'CANCELLED');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] staff-density-modal">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Hóa đơn thanh toán</h3>
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
                    <span>Thu ngân:</span>
                    <span>{session.confirmed_by_name}</span>
                  </div>
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

                {validItems.map((item, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between items-baseline text-slate-800">
                      <span className="flex-1 font-sans font-semibold text-[11px] pr-1">
                        {item.name}
                        {item.variantName && (
                          <span className="ml-1 text-[10px] text-orange-700 font-bold">({item.variantName})</span>
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
                  </div>
                ))}

                {validItems.length === 0 && (
                  <p className="text-center py-4 text-slate-400 italic">Không có món ăn phát sinh trong hóa đơn này</p>
                )}
              </div>

              {/* Total Calculation */}
              <div className="pt-3 border-t border-dashed border-slate-300 space-y-1.5">
                <div className="flex justify-between items-center text-sm font-sans font-extrabold text-slate-900">
                  <span>TỔNG CỘNG:</span>
                  <span className="text-base text-orange-600 font-black">
                    {Number(session.confirmed_amount).toLocaleString('vi-VN')}đ
                  </span>
                </div>
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 font-sans font-bold pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>ĐÃ THANH TOÁN (GHI NHẬN THỦ CÔNG)</span>
                </div>
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
            className="flex-1 py-2.5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 min-h-[44px]"
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
