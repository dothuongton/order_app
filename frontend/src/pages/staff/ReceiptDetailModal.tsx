import { OrderSourceBadge, InvoiceSourceSummary, orderSourceLabel } from '../../components/OrderSourceBadge.js';
import React, { useEffect, useState } from 'react';
import { request } from '../../api/client.js';
import { BillSummary } from '../../types/index.js';
import { X, Printer, Receipt, XCircle, RefreshCw, Download, UserCheck, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { isSessionCancelled, formatCancelReason, getSessionReportStatus } from './StaffReports.js';
import { formatPaymentMethodLabel } from './TableDetailModal.js';

interface ReceiptDetailModalProps {
  session: {
    session_id: string;
    table_number: string;
    confirmed_amount: number;
    confirmed_at: string;
    confirmed_by_name: string;
    settlement_note?: string;
    payment_method?: string;
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

export function escapeReceiptHtml(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface GenerateReceiptHtmlOptions {
  session: {
    session_id: string;
    table_number: string;
    confirmed_amount: number;
    confirmed_at: string;
    confirmed_by_name: string;
    settlement_note?: string;
    payment_method?: string;
    opened_at?: string;
    session_status?: string;
    close_reason?: string;
    bill_status?: string;
    opening_guest_name?: string | null;
  };
  currentTenantName?: string;
  billSummary: BillSummary | null;
  showOrderSource: boolean;
  showNotes: boolean;
}

export function generateReceiptHtml(options: GenerateReceiptHtmlOptions): string {
  const { session, currentTenantName, billSummary, showOrderSource, showNotes } = options;
  const allItems = billSummary?.rounds?.flatMap(r => r.items) || [];
  const originByItem = new Map(billSummary?.rounds?.flatMap(round => round.items.map(item => [item.itemId, round] as const)) || []);
  const displayItems = getReceiptItemsForDisplay(allItems, session.confirmed_amount);
  const isZero = Number(session.confirmed_amount) === 0;
  const isCancelled = isSessionCancelled(session);
  const receiptStatus = getSessionReportStatus(session);
  const formattedTime = new Date(session.confirmed_at).toLocaleString('vi-VN');

  const staffOrigins = (billSummary?.rounds || []).filter(origin => origin.source === 'STAFF_POS');
  const uniqueOrigins = [...new Map(staffOrigins.map(origin => [orderSourceLabel(origin), origin])).values()];

  const itemsHtml = displayItems.map(item => {
    const origin = originByItem.get(item.itemId);
    const sourceLabel = origin && origin.source === 'STAFF_POS' ? orderSourceLabel(origin) : '';
    const originBadgeHtml = showOrderSource && sourceLabel
      ? `<div style="font-size: 10px; color: #5b21b6; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 4px; padding: 1px 6px; display: inline-block; margin-bottom: 2px;">${escapeReceiptHtml(sourceLabel)}</div>`
      : '';
    const noteHtml = showNotes && item.note
      ? `<div style="font-size: 10px; color: #b45309; font-style: italic; padding-left: 4px; word-break: break-word; overflow-wrap: anywhere;">* ${escapeReceiptHtml(item.note)}</div>`
      : '';
    const cancelledHtml = isZero && item.status === 'CANCELLED'
      ? `<div style="font-size: 10px; color: #b91c1c; font-weight: 600; padding-left: 4px;">Đã hủy · ${escapeReceiptHtml(formatCancelReason(item.cancelReason).replace(/^Đã hủy:\s*/, ''))}</div>`
      : '';
    const nameStyle = item.status === 'CANCELLED' ? 'text-decoration: line-through; color: #94a3b8;' : 'color: #1e293b;';
    const variantHtml = item.variantName ? `<span style="font-size: 10px; color: #0f766e; font-weight: bold; margin-left: 4px;">(${escapeReceiptHtml(item.variantName)})</span>` : '';

    return `
      <div style="border-bottom: 1px dashed #e2e8f0; padding: 6px 0;">
        ${originBadgeHtml}
        <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 11px;">
          <span style="flex: 1; font-weight: 600; ${nameStyle} padding-right: 6px;">
            ${escapeReceiptHtml(item.name)}${variantHtml}
          </span>
          <span style="width: 35px; text-align: center; font-weight: bold;">${item.quantity}</span>
          <span style="width: 65px; text-align: right; color: #64748b;">${item.price.toLocaleString('vi-VN')}</span>
          <span style="width: 75px; text-align: right; font-weight: bold; color: #0f172a;">${item.subtotal.toLocaleString('vi-VN')}đ</span>
        </div>
        ${noteHtml}
        ${cancelledHtml}
      </div>
    `;
  }).join('');

  const orderSourceSummaryHtml = showOrderSource && uniqueOrigins.length > 0
    ? `
      <div style="margin-bottom: 12px; padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 11px;">
        <strong style="color: #334155;">Người gọi món: </strong>
        ${uniqueOrigins.map(o => `<span style="font-size: 10px; color: #5b21b6; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 4px; padding: 1px 6px; display: inline-block; margin: 2px;">${escapeReceiptHtml(orderSourceLabel(o))}</span>`).join(' ')}
      </div>
    `
    : '';

  const openingGuestHtml = showOrderSource
    ? `
      <div style="display: flex; justify-content: space-between; padding: 2px 0;">
        <span style="color: #64748b;">Người yêu cầu mở bàn:</span>
        <span style="font-weight: 500; text-align: right;">${escapeReceiptHtml(billSummary?.openingGuestName || session.opening_guest_name || 'Không ghi nhận tên')}</span>
      </div>
    `
    : '';

  const settlementNoteHtml = showNotes && session.settlement_note
    ? `
      <div style="margin-top: 8px; padding: 8px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; text-align: left;">
        <div style="font-size: 10px; font-weight: bold; color: #92400e; text-transform: uppercase;">Ghi chú thanh toán:</div>
        <div style="font-size: 11px; color: #78350f; font-style: italic; margin-top: 2px; word-break: break-word; overflow-wrap: anywhere; white-space: pre-wrap;">
          ${escapeReceiptHtml(session.settlement_note)}
        </div>
      </div>
    `
    : '';

  const statusBadgeHtml = receiptStatus
    ? `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0;">
        <span style="color: #64748b;">Trạng thái:</span>
        <span style="font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 9999px; ${isCancelled ? 'background: #fff1f2; color: #be123c; border: 1px solid #fecdd3;' : 'background: #fffbeb; color: #92400e; border: 1px solid #fde68a;'}">
          ${escapeReceiptHtml(receiptStatus.label)}
        </span>
      </div>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hóa đơn Bàn ${escapeReceiptHtml(session.table_number)} - #${escapeReceiptHtml(session.session_id.slice(0, 8).toUpperCase())}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 12px;
      min-height: 100vh;
    }
    .receipt-container {
      background: #ffffff;
      width: 100%;
      max-width: 380px;
      padding: 24px 20px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      border: 1px solid #e2e8f0;
      font-family: "Courier New", Courier, monospace, sans-serif;
    }
    .actions-bar {
      margin-top: 16px;
      display: flex;
      gap: 10px;
      width: 100%;
      max-width: 380px;
      justify-content: center;
    }
    .btn {
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: background-color 0.15s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .btn-primary { background: #0284c7; color: #ffffff; }
    .btn-primary:hover { background: #0369a1; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .receipt-container {
        box-shadow: none;
        border: none;
        max-width: 100%;
        padding: 0;
        border-radius: 0;
      }
      .actions-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    ${orderSourceSummaryHtml}
    <div style="text-align: center; padding-bottom: 12px; border-bottom: 1px dashed #cbd5e1;">
      <h1 style="font-size: 16px; font-weight: 800; font-family: sans-serif; letter-spacing: 0.5px; margin-bottom: 4px;">
        ${escapeReceiptHtml(currentTenantName || 'NHÀ HÀNG')}
      </h1>
      <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; font-family: sans-serif;">
        ${isZero ? 'BIÊN NHẬN PHIÊN 0đ' : 'HÓA ĐƠN BÁN HÀNG'}
      </div>
      <div style="font-size: 11px; margin-top: 10px; line-height: 1.5;">
        <div style="display: flex; justify-content: space-between; padding: 2px 0;">
          <span style="color: #64748b;">Bàn:</span>
          <strong style="font-family: sans-serif; color: #0f172a;">Bàn ${escapeReceiptHtml(session.table_number)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 2px 0;">
          <span style="color: #64748b;">Mã phiên:</span>
          <span>#${escapeReceiptHtml(session.session_id.slice(0, 8).toUpperCase())}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 2px 0;">
          <span style="color: #64748b;">Thời gian:</span>
          <span>${escapeReceiptHtml(formattedTime)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 2px 0;">
          <span style="color: #64748b;">${isZero ? 'Người xử lý:' : 'Thu ngân:'}</span>
          <span>${escapeReceiptHtml(session.confirmed_by_name)}</span>
        </div>
        ${!isZero ? `
        <div style="display: flex; justify-content: space-between; padding: 2px 0;">
          <span style="color: #64748b;">Phương thức thanh toán:</span>
          <span style="font-weight: 600;">${escapeReceiptHtml(formatPaymentMethodLabel(session.payment_method))}</span>
        </div>
        ` : ''}
        ${openingGuestHtml}
        ${statusBadgeHtml}
        ${settlementNoteHtml}
      </div>
    </div>

    <!-- Items -->
    <div style="padding: 10px 0;">
      <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 4px;">
        <span style="flex: 1;">Món ăn</span>
        <span style="width: 35px; text-align: center;">SL</span>
        <span style="width: 65px; text-align: right;">Đơn giá</span>
        <span style="width: 75px; text-align: right;">T.Tiền</span>
      </div>
      ${itemsHtml || '<div style="text-align: center; color: #94a3b8; font-style: italic; padding: 16px 0; font-size: 11px;">Không có món ăn phát sinh trong hóa đơn này</div>'}
    </div>

    <!-- Total -->
    <div style="border-top: 1px dashed #cbd5e1; padding-top: 12px; margin-top: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: center; font-family: sans-serif;">
        <span style="font-size: 13px; font-weight: 800;">TỔNG CỘNG:</span>
        <span style="font-size: 16px; font-weight: 900; color: #0284c7;">
          ${Number(session.confirmed_amount).toLocaleString('vi-VN')}đ
        </span>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; font-family: sans-serif;">
      <p>Cảm ơn Quý khách & Hẹn gặp lại!</p>
    </div>
  </div>

  <div class="actions-bar">
    <button class="btn btn-primary" onclick="window.print()">In hoặc Lưu PDF</button>
  </div>
</body>
</html>`;
}

export const ReceiptDetailModal: React.FC<ReceiptDetailModalProps> = ({ session, onClose }) => {
  const { currentTenant } = useAuth();
  const [billSummary, setBillSummary] = useState<BillSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOrderSource, setShowOrderSource] = useState(true);
  const [showNotes, setShowNotes] = useState(true);

  useEffect(() => {
    if (!session?.session_id) return;
    let cancelled = false;
    setBillSummary(null);
    const fetchBill = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await request<BillSummary>(`/staff/sessions/${session.session_id}/bill-summary`);
        if (cancelled) return;
        setBillSummary(data);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Không thể tải chi tiết hóa đơn');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchBill();
    return () => { cancelled = true; };
  }, [session?.session_id]);

  if (!session) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const html = generateReceiptHtml({
      session,
      currentTenantName: currentTenant?.name,
      billSummary,
      showOrderSource,
      showNotes,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTable = (session.table_number || '0').replace(/\s+/g, '_');
    const safeDate = new Date(session.confirmed_at || Date.now()).toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `Hoa_don_Ban_${safeTable}_${safeDate}_${session.session_id.slice(0, 8)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Flatten items for printing summary
  const allItems = billSummary?.rounds?.flatMap(r => r.items) || [];
  const originByItem = new Map(billSummary?.rounds?.flatMap(round => round.items.map(item => [item.itemId, round] as const)) || []);
  const isZero = Number(session.confirmed_amount) === 0;
  const showZeroValueItems = isZero;
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

        {/* View Options Toolbar (print:hidden) */}
        <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap print:hidden text-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tùy chọn hiển thị:</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowOrderSource(prev => !prev)}
              className={`px-2.5 py-1 rounded-lg text-xs transition flex items-center gap-1.5 border min-h-[32px] ${
                showOrderSource
                  ? 'bg-sky-50 text-sky-700 border-sky-200 font-semibold shadow-xs'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
              }`}
              aria-pressed={showOrderSource}
              title="Bật / tắt hiển thị thông tin người đặt món"
            >
              <UserCheck className={`w-3.5 h-3.5 ${showOrderSource ? 'text-sky-600' : 'text-slate-400'}`} />
              <span>Người đặt: <strong className={showOrderSource ? 'text-sky-700' : 'text-slate-500'}>{showOrderSource ? 'Bật' : 'Tắt'}</strong></span>
            </button>
            <button
              type="button"
              onClick={() => setShowNotes(prev => !prev)}
              className={`px-2.5 py-1 rounded-lg text-xs transition flex items-center gap-1.5 border min-h-[32px] ${
                showNotes
                  ? 'bg-amber-50 text-amber-800 border-amber-200 font-semibold shadow-xs'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
              }`}
              aria-pressed={showNotes}
              title="Bật / tắt hiển thị ghi chú trên hóa đơn"
            >
              <FileText className={`w-3.5 h-3.5 ${showNotes ? 'text-amber-700' : 'text-slate-400'}`} />
              <span>Ghi chú: <strong className={showNotes ? 'text-amber-800' : 'text-slate-500'}>{showNotes ? 'Bật' : 'Tắt'}</strong></span>
            </button>
          </div>
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
              {showOrderSource && <InvoiceSourceSummary origins={billSummary?.rounds || []} />}
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
                  {!isZero && (
                    <div className="flex justify-between items-center">
                      <span>Phương thức thanh toán:</span>
                      <span className="font-semibold text-slate-900 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200/80 text-[11px] font-sans">
                        {formatPaymentMethodLabel(session.payment_method)}
                      </span>
                    </div>
                  )}
                  {showOrderSource && (
                    <div className="flex justify-between gap-3">
                      <span className="shrink-0">Người yêu cầu mở bàn:</span>
                      <span className="text-right truncate">{billSummary?.openingGuestName || session.opening_guest_name || 'Không ghi nhận tên'}</span>
                    </div>
                  )}
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
                  {showNotes && session.settlement_note && (
                    <div className="pt-2 text-left border-t border-dashed border-amber-200/80">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1 font-sans">
                        <FileText className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>Ghi chú thanh toán:</span>
                      </div>
                      <div className="text-[11px] text-amber-900 italic bg-amber-50/80 p-2.5 rounded-xl border border-amber-200/60 break-words [overflow-wrap:anywhere] whitespace-pre-wrap leading-relaxed font-sans">
                        {session.settlement_note}
                      </div>
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
                    {showOrderSource && <OrderSourceBadge {...originByItem.get(item.itemId)} />}
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
                    {showNotes && item.note && (
                      <div className="text-[10px] text-amber-700 italic pl-1 break-words [overflow-wrap:anywhere]">
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
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] text-[var(--brand-on-accent)] font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 min-h-[44px]"
          >
            <Printer className="w-4 h-4" />
            <span>In hóa đơn</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 min-h-[44px] shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Tải hóa đơn</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition min-h-[44px]"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
