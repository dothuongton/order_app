import React, { useEffect, useState, useRef } from 'react';
import { useGuest } from '../../context/GuestContext.js';
import { GuestMenu } from './GuestMenu.js';
import { GuestOrders } from './GuestOrders.js';
import { GuestBill } from './GuestBill.js';
import { CartDrawer } from '../../components/CartDrawer.js';
import { GuestRequestModal } from '../../components/GuestRequestModal.js';
import { UtensilsCrossed, ClipboardList, Receipt, ShoppingBag, AlertCircle, Sparkles, WifiOff, Clock, UserCheck, Shield, Eye } from 'lucide-react';

interface GuestLandingProps {
  qrId: string;
}

export const GuestLanding: React.FC<GuestLandingProps> = ({ qrId }) => {
  const {
    tenant,
    table,
    session,
    cart,
    orders,
    loadTableMenu,
    joinSession,
    isLoading,
    isSessionClosed,
    isOnline,
    orderingMode,
    tableStatus,
    deviceState,
    pendingRequest,
    canOrder,
    canRequest,
    requestOpenTable,
    withdrawOpenRequest
  } = useGuest();

  const [activeTab, setActiveTab] = useState<'menu' | 'orders' | 'bill'>('menu');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [waitingForOpen, setWaitingForOpen] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isRequestModalDismissed, setIsRequestModalDismissed] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const activeQrRef = useRef<string>(qrId);
  activeQrRef.current = qrId;
  const requestTriggerRef = useRef<HTMLButtonElement>(null);

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

  const handleRequestTable = async (guestName: string) => {
    await requestOpenTable(guestName);
  };

  const handleWithdraw = async () => {
    await withdrawOpenRequest();
  };

  useEffect(() => {
    const init = async () => {
      try {
        const menuData = await loadTableMenu(qrId);
        if (activeQrRef.current !== qrId) return;

        if (menuData?.session && menuData.session.status === 'OPEN') {
          const isSingleDevice = (menuData.table?.ordering_mode || menuData.table?.orderingMode) === 'approved_single_device';
          const isClaimed = (menuData.table?.device_state || menuData.table?.deviceState) === 'CLAIMED';

          if (isSingleDevice && !isClaimed) {
            // In single-device mode, non-claimed devices remain in viewer mode without joining session
            if (activeQrRef.current === qrId) setWaitingForOpen(false);
            return;
          }

          const scopedKey = `guest_auth_${qrId}`;
          let hasValidToken = false;
          try {
            const raw = sessionStorage.getItem(scopedKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed.sessionId === menuData.session.id && sessionStorage.getItem('guest_token')) {
                hasValidToken = true;
              }
            }
          } catch {}

          if (!hasValidToken) {
            try {
              await joinSession(qrId);
              if (activeQrRef.current === qrId) setWaitingForOpen(false);
            } catch (err: any) {
              if (activeQrRef.current === qrId) {
                if (err.code === 'SESSION_NOT_OPEN') setWaitingForOpen(true);
                else setInitError(err.message || 'Không thể tham gia phiên bàn');
              }
            }
          } else {
            if (activeQrRef.current === qrId) setWaitingForOpen(false);
          }
        } else if (!menuData?.session) {
          // Table has no active session
          const receiptRaw = sessionStorage.getItem(`guest_receipt_${qrId}`);
          if (!receiptRaw && activeQrRef.current === qrId) {
            setWaitingForOpen(true);
          }
        }
      } catch (err: any) {
        if (activeQrRef.current === qrId) setInitError(err.message || 'Không thể tải thông tin bàn');
      }
    };

    init();
  }, [qrId, loadTableMenu, joinSession]);

  // When a device gets approved into CLAIMED state, join session if not already joined
  const joiningClaimRef = useRef(false);
  useEffect(() => {
    if (deviceState !== 'CLAIMED' || !session || session.status !== 'OPEN' || isSessionClosed) return;
    const scopedKey = `guest_auth_${qrId}`;
    let hasValidToken = false;
    try {
      const raw = sessionStorage.getItem(scopedKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.sessionId === session.id && sessionStorage.getItem('guest_token')) {
          hasValidToken = true;
        }
      }
    } catch {}

    if (!hasValidToken && !joiningClaimRef.current) {
      joiningClaimRef.current = true;
      joinSession(qrId)
        .catch((err: any) => {
          setInitError(err.message || 'Không thể tham gia phiên đặt món');
        })
        .finally(() => {
          joiningClaimRef.current = false;
        });
    }
  }, [deviceState, session, qrId, joinSession, isSessionClosed]);

  // A guest who scans before staff open the table should not need to reload.
  // Stop after the first successful join; never auto-join a later customer session.
  useEffect(() => {
    if (!waitingForOpen || isSessionClosed) return;
    const timer = setInterval(() => {
      loadTableMenu(qrId).then((data) => {
        if (data?.session && data.session.status === 'OPEN') {
          joinSession(qrId).then(() => setWaitingForOpen(false)).catch(() => {});
        }
      }).catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [waitingForOpen, isSessionClosed, qrId, loadTableMenu, joinSession]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (isLoading && !table) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-medium text-slate-500">Đang tải thực đơn bàn...</p>
        </div>
      </div>
    );
  }

  if (initError && !table) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white rounded-3xl p-6 text-center max-w-sm shadow-xl border border-slate-100">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900">Không tìm thấy bàn</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">{initError}</p>
          <p className="text-xs text-slate-400">Vui lòng quét đúng mã QR dán tại bàn</p>
        </div>
      </div>
    );
  }

  if (tenant?.status === 'suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white rounded-3xl p-6 text-center max-w-sm shadow-xl border border-slate-100">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900">{tenant.name}</h2>
          <p className="text-sm font-semibold text-amber-600 mt-1">Cửa hàng tạm ngưng phục vụ</p>
          <p className="text-xs text-slate-500 mt-2 mb-4">Hệ thống gọi món trực tuyến của quán đang tạm dừng hoạt động theo chính sách quản trị. Quý khách vui lòng liên hệ nhân viên tại quầy.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ '--brand-color': /^#[0-9a-fA-F]{6}$/.test(tenant?.activeThemeConfig?.primaryColor || '') ? tenant!.activeThemeConfig!.primaryColor : '#0f766e' } as React.CSSProperties} className="guest-storefront min-h-screen flex flex-col bg-slate-50 max-w-md mx-auto relative shadow-2xl pb-[calc(5rem+env(safe-area-inset-bottom))]">
      {/* Top Bar / Restaurant & Table Info */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/80 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {tenant?.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={tenant.name}
              className="w-10 h-10 rounded-xl object-cover border border-slate-200 shadow-xs shrink-0"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center font-black text-sm shrink-0">
              {tenant?.name?.[0] || '🍜'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider block truncate">
              {tenant?.name || 'Nhà Hàng'}
            </span>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-slate-900 truncate">Bàn {table?.tableNumber || '--'}</h1>
              {session && !isSessionClosed ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Phiên mở
                </span>
              ) : isSessionClosed ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                  Đã kết thúc
                </span>
              ) : tableStatus === 'OCCUPIED' && deviceState === 'VIEWER' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  Đang phục vụ (Chế độ xem)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Chưa mở phiên
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Orders badge button */}
        {orders.length > 0 && (
          <button
            onClick={() => setActiveTab('orders')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-800 font-bold text-xs rounded-xl border border-teal-200 active:bg-teal-100"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>{orders.length} lần gọi</span>
          </button>
        )}
      </header>

      {/* Connection Warning Banner (Mất kết nối) */}
      {!isOnline && (
        <div className="bg-rose-600 text-white px-4 py-2.5 shadow-sm flex items-center gap-2.5 text-xs font-semibold animate-pulse">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Mất kết nối mạng. Đang tự động kết nối lại...</span>
        </div>
      )}

      {/* Notice Banner: If table session is closed (F10) */}
      {isSessionClosed && !waitingForOpen && (
        <div className="bg-emerald-600 text-white p-4 shadow-sm flex items-center gap-3">
          <Sparkles className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-bold text-sm">Phiên bàn đã kết thúc</h4>
            <p className="text-xs opacity-90 mt-0.5">
              Cảm ơn quý khách đã dùng bữa! Quý khách vẫn có thể xem lại thực đơn công khai bên dưới.
            </p>
          </div>
        </div>
      )}

      {/* Gaeru Flow - Single Device Mode Dialog and State Banners */}
      {orderingMode === 'approved_single_device' ? (
        <>
          {/* Modal / Bottom Sheet: Shown before interacting with menu if device needs to request claim or is waiting */}
          <GuestRequestModal
            isOpen={!isSessionClosed && deviceState !== 'CLAIMED' && !isRequestModalDismissed && (canRequest || deviceState === 'REQUESTER')}
            onClose={() => setIsRequestModalDismissed(true)}
            tenantName={tenant?.name}
            tableNumber={table?.tableNumber}
            deviceState={deviceState}
            canRequest={canRequest}
            pendingRequest={pendingRequest}
            onRequestOpen={handleRequestTable}
            onWithdraw={handleWithdraw}
            returnFocusRef={requestTriggerRef}
          />

          {/* If guest dismissed modal and can request claim: Show top prompt with CTA to reopen modal */}
          {isRequestModalDismissed && canRequest && !isSessionClosed && (
            <div className="mx-4 mt-3 p-3.5 bg-teal-50 border border-teal-200 rounded-2xl flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="w-4 h-4 text-teal-700 shrink-0" />
                <span className="text-xs text-teal-950 font-medium truncate">Bạn đang ở chế độ xem thực đơn</span>
              </div>
              <button
                ref={requestTriggerRef}
                onClick={() => setIsRequestModalDismissed(false)}
                className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shrink-0 transition shadow-xs cursor-pointer"
              >
                {deviceState === 'VIEWER' ? 'Yêu cầu đổi máy' : 'Yêu cầu mở bàn'}
              </button>
            </div>
          )}

          {/* If guest dismissed modal while in REQUESTER state: Show compact waiting banner */}
          {isRequestModalDismissed && deviceState === 'REQUESTER' && (
            <div className="mx-4 mt-3 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping shrink-0"></span>
                <span className="text-xs text-amber-950 font-medium truncate">
                  Đang chờ duyệt: <strong className="font-bold">{pendingRequest?.guestName}</strong> ({Math.floor(remainingTime / 60)}:{(remainingTime % 60).toString().padStart(2, '0')})
                </span>
              </div>
              <button
                ref={requestTriggerRef}
                onClick={() => setIsRequestModalDismissed(false)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shrink-0 transition shadow-xs cursor-pointer"
              >
                Chi tiết
              </button>
            </div>
          )}

          {/* Read-Only Viewer Banner (Another device holds claim or request is pending from another device) */}
          {deviceState === 'VIEWER' && !canRequest && !isSessionClosed && (
            <div className="mx-4 mt-3 p-3.5 bg-slate-100 border border-slate-200 rounded-2xl flex items-center gap-2.5 text-xs text-slate-700 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
              <div>
                {tableStatus === 'PENDING'
                  ? 'Bàn đang có yêu cầu mở bàn chờ nhân viên duyệt. Bạn đang ở chế độ xem thực đơn.'
                  : 'Bàn này đang được đặt món bởi thiết bị khác. Bạn đang ở chế độ xem thực đơn.'}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Legacy Multi-Device Mode Notice Banner */
        !session && !isSessionClosed && (
          <div className="bg-amber-500 text-white px-4 py-3 shadow-sm flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-xs font-medium leading-tight">
              Bàn chưa được mở gọi món. Quý khách vui lòng liên hệ nhân viên để mở bàn trước khi gửi món.
            </p>
          </div>
        )
      )}

      {/* Main Tab Content */}
      <main className="flex-1">
        {activeTab === 'menu' && <GuestMenu />}
        {activeTab === 'orders' && <GuestOrders />}
        {activeTab === 'bill' && <GuestBill />}
      </main>

      {/* Floating Cart Bar (when items are in cart and session is open) */}
      {cartCount > 0 && session && !isSessionClosed && canOrder && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] inset-x-0 z-30 px-4 max-w-md mx-auto pointer-events-none">
          <button
            onClick={() => setIsCartOpen(true)}
            className="pointer-events-auto w-full min-h-[52px] bg-slate-900 hover:bg-black text-white font-bold rounded-2xl p-3.5 shadow-2xl flex items-center justify-between active:scale-[0.98] transition border border-slate-700"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-black">
                {cartCount}
              </span>
              <span className="text-sm font-semibold">Xem lần gọi mới</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-teal-400">
                {cartSubtotal.toLocaleString('vi-VN')}đ
              </span>
              <ShoppingBag className="w-4 h-4 text-slate-300" />
            </div>
          </button>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200/80 px-2 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] max-w-md mx-auto flex items-center justify-around shadow-lg">
        <button
          onClick={() => setActiveTab('menu')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition ${
            activeTab === 'menu' ? 'text-teal-700 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <UtensilsCrossed className="w-5 h-5" />
          <span className="text-[11px] mt-1">Thực đơn</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition relative ${
            activeTab === 'orders' ? 'text-teal-700 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span className="text-[11px] mt-1">Đơn đã gọi</span>
          {orders.length > 0 && (
            <span className="absolute top-1.5 right-6 w-2 h-2 rounded-full bg-teal-600"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('bill')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition ${
            activeTab === 'bill' ? 'text-teal-700 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <Receipt className="w-5 h-5" />
          <span className="text-[11px] mt-1">Tổng bill</span>
        </button>
      </nav>

      {/* Cart Drawer Modal */}
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
};
