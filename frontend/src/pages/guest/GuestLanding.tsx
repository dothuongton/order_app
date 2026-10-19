import React, { useEffect, useState } from 'react';
import { useGuest } from '../../context/GuestContext.js';
import { GuestMenu } from './GuestMenu.js';
import { GuestOrders } from './GuestOrders.js';
import { GuestBill } from './GuestBill.js';
import { CartDrawer } from '../../components/CartDrawer.js';
import { UtensilsCrossed, ClipboardList, Receipt, ShoppingBag, AlertCircle, Sparkles } from 'lucide-react';

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
    isSessionClosed
  } = useGuest();

  const [activeTab, setActiveTab] = useState<'menu' | 'orders' | 'bill'>('menu');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await loadTableMenu(qrId);
        // Try auto-joining session if table is open
        try {
          await joinSession(qrId);
        } catch (err: any) {
          // If session is not open, it's normal (AT02)
        }
      } catch (err: any) {
        setInitError(err.message || 'Không thể tải thông tin bàn');
      }
    };
    init();
  }, [qrId, loadTableMenu, joinSession]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (isLoading && !table) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
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
    <div className="min-h-screen flex flex-col bg-slate-50 max-w-md mx-auto relative shadow-2xl pb-[calc(5rem+env(safe-area-inset-bottom))]">
      {/* Top Bar / Restaurant & Table Info */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/80 px-4 py-3 flex items-center justify-between shadow-xs">
        <div>
          <span className="text-[11px] font-semibold text-orange-600 uppercase tracking-wider block">
            {tenant?.name || 'Nhà Hàng'}
          </span>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-extrabold text-slate-900">Bàn {table?.tableNumber || '--'}</h1>
            {session && !isSessionClosed ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Phiên mở
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                Chưa mở phiên
              </span>
            )}
          </div>
        </div>

        {/* Orders badge button */}
        {orders.length > 0 && (
          <button
            onClick={() => setActiveTab('orders')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 font-bold text-xs rounded-xl border border-orange-200 active:bg-orange-100"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>{orders.length} lần gọi</span>
          </button>
        )}
      </header>

      {/* Notice Banner: If table session is closed (F10) */}
      {isSessionClosed && (
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

      {/* Notice Banner: If table not opened yet (AT02) */}
      {!session && !isSessionClosed && (
        <div className="bg-amber-500 text-white px-4 py-3 shadow-sm flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-xs font-medium leading-tight">
            Bàn chưa được mở gọi món. Quý khách vui lòng liên hệ nhân viên để mở bàn trước khi gửi món.
          </p>
        </div>
      )}

      {/* Main Tab Content */}
      <main className="flex-1">
        {activeTab === 'menu' && <GuestMenu />}
        {activeTab === 'orders' && <GuestOrders />}
        {activeTab === 'bill' && <GuestBill />}
      </main>

      {/* Floating Cart Bar (when items are in cart and session is open) */}
      {cartCount > 0 && session && !isSessionClosed && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] inset-x-0 z-30 px-4 max-w-md mx-auto pointer-events-none">
          <button
            onClick={() => setIsCartOpen(true)}
            className="pointer-events-auto w-full min-h-[52px] bg-slate-900 hover:bg-black text-white font-bold rounded-2xl p-3.5 shadow-2xl flex items-center justify-between active:scale-[0.98] transition border border-slate-700"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center font-black">
                {cartCount}
              </span>
              <span className="text-sm font-semibold">Xem lần gọi mới</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-orange-400">
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
            activeTab === 'menu' ? 'text-orange-600 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <UtensilsCrossed className="w-5 h-5" />
          <span className="text-[11px] mt-1">Thực đơn</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition relative ${
            activeTab === 'orders' ? 'text-orange-600 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span className="text-[11px] mt-1">Đơn đã gọi</span>
          {orders.length > 0 && (
            <span className="absolute top-1.5 right-6 w-2 h-2 rounded-full bg-orange-600"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('bill')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition ${
            activeTab === 'bill' ? 'text-orange-600 font-bold' : 'text-slate-500 font-medium'
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
