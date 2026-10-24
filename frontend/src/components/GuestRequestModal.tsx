import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Clock, AlertCircle, Eye, X, Send, Loader2 } from 'lucide-react';

export interface GuestRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantName?: string;
  tableNumber?: string;
  deviceState: 'IDLE' | 'REQUESTER' | 'CLAIMED' | 'VIEWER';
  canRequest: boolean;
  pendingRequest: {
    requestId: string;
    guestName: string;
    requestedAt?: string;
    expiresAt?: string;
    remainingSeconds?: number;
    canWithdraw?: boolean;
  } | null;
  onRequestOpen: (guestName: string) => Promise<void>;
  onWithdraw: () => Promise<void>;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export const GuestRequestModal: React.FC<GuestRequestModalProps> = ({
  isOpen,
  onClose,
  tenantName = 'Nhà Hàng',
  tableNumber = '--',
  deviceState,
  canRequest,
  pendingRequest,
  onRequestOpen,
  onWithdraw,
  returnFocusRef
}) => {
  const [guestName, setGuestName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remainingTime, setRemainingTime] = useState<number>(0);

  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Countdown timer for pending approval
  useEffect(() => {
    if (!pendingRequest?.expiresAt) {
      setRemainingTime(0);
      return;
    }
    const updateCountdown = () => {
      if (!pendingRequest?.expiresAt) {
        setRemainingTime(0);
        return;
      }
      const diff = Math.max(0, Math.floor((new Date(pendingRequest.expiresAt).getTime() - Date.now()) / 1000));
      setRemainingTime(diff);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [pendingRequest?.expiresAt]);

  // Accessibility: Focus trap, Escape key, and Return Focus
  useEffect(() => {
    if (!isOpen) return;

    // Save previous active element to restore on close
    previousActiveElementRef.current = (document.activeElement as HTMLElement) || returnFocusRef?.current || null;

    // Prevent background scrolling while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus input or first focusable element
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      } else if (modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length > 0) focusables[0].focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);

      // Return focus to previous element or returnFocusRef
      const targetFocus = returnFocusRef?.current || previousActiveElementRef.current;
      if (targetFocus && typeof targetFocus.focus === 'function') {
        setTimeout(() => targetFocus.focus(), 10);
      }
    };
  }, [isOpen, onClose, returnFocusRef]);

  if (!isOpen) return null;

  const isRequester = deviceState === 'REQUESTER';
  const isReplacement = deviceState === 'VIEWER' && canRequest;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = guestName.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onRequestOpen(trimmed);
      setGuestName('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể gửi yêu cầu mở bàn');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdrawClick = async () => {
    if (isWithdrawing) return;
    if (!confirm('Bạn có chắc muốn rút yêu cầu mở bàn?')) return;

    setIsWithdrawing(true);
    setErrorMessage(null);
    try {
      await onWithdraw();
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể rút yêu cầu');
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-request-dialog-title"
        aria-describedby="guest-request-dialog-desc"
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-slide-up flex flex-col"
      >
        {/* Header Bar */}
        <div className="p-5 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="min-w-0 flex-1 pr-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700 uppercase tracking-wider truncate">
              <span>{tenantName}</span>
              <span>•</span>
              <span>Bàn {tableNumber}</span>
            </div>
            <h2 id="guest-request-dialog-title" className="text-lg font-extrabold text-slate-900 mt-0.5 truncate">
              {isRequester
                ? 'Đang chờ nhân viên duyệt'
                : isReplacement
                ? 'Yêu cầu đổi máy gọi món'
                : 'Yêu cầu mở bàn'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng và xem thực đơn"
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          <p id="guest-request-dialog-desc" className="text-xs text-slate-600 leading-relaxed">
            {isRequester
              ? 'Yêu cầu của bạn đã được gửi tới nhân viên quán. Vui lòng đợi nhân viên xác nhận để bắt đầu gọi món.'
              : isReplacement
              ? 'Bàn đã mở nhưng chưa có máy gọi món. Nhập tên để gửi yêu cầu cấp quyền gọi món cho thiết bị của bạn hoặc chọn chỉ xem thực đơn.'
              : 'Quý khách vui lòng nhập tên để gửi yêu cầu mở bàn. Nhân viên duyệt xong bạn sẽ có thể đặt món trực tiếp.'}
          </p>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {isRequester ? (
            /* Waiting State for REQUESTER */
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping"></span>
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">Trạng thái: Chờ duyệt</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-amber-900 font-mono font-bold bg-amber-100/80 px-2.5 py-1 rounded-lg">
                    <Clock className="w-3.5 h-3.5 text-amber-700" />
                    <span>{Math.floor(remainingTime / 60)}:{(remainingTime % 60).toString().padStart(2, '0')}</span>
                  </div>
                </div>

                <div className="text-xs text-slate-700 font-medium">
                  Tên khách:{' '}
                  <span className="font-extrabold text-slate-900 text-sm">{pendingRequest?.guestName || 'Khách'}</span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleWithdrawClick}
                  disabled={isWithdrawing}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isWithdrawing && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isWithdrawing ? 'Đang rút yêu cầu...' : 'Rút yêu cầu mở bàn'}</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Eye className="w-4 h-4 text-slate-500" />
                  <span>Xem thực đơn trong khi chờ</span>
                </button>
              </div>
            </div>
          ) : (
            /* Input Form State for IDLE / VIEWER with canRequest */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="guest-request-name-input" className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tên quý khách <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    id="guest-request-name-input"
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Ví dụ: Anh Ba, Bàn 4 người..."
                    maxLength={80}
                    disabled={isSubmitting}
                    required
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600 transition disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || !guestName.trim()}
                  className="w-full min-h-[48px] px-4 py-3 bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-sm rounded-xl transition shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang gửi yêu cầu...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>{isReplacement ? 'Gửi yêu cầu đổi máy' : 'Gửi yêu cầu mở bàn'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Eye className="w-4 h-4 text-slate-500" />
                  <span>Chỉ xem thực đơn</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 text-center leading-normal">
                Quý khách có thể xem thực đơn trước ở chế độ chỉ đọc. Thiết bị chưa được duyệt quyền sẽ không thể gửi đơn gọi món.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
