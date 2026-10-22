import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useNotification } from '../../context/NotificationContext.js';
import { request } from '../../api/client.js';
import { StaffTable, ServiceRequest } from '../../types/index.js';
import { TableDetailModal } from './TableDetailModal.js';
import { QRModal } from '../../components/QRModal.js';
import { StaffReports } from './StaffReports.js';
import { StaffMenuManage } from './StaffMenuManage.js';
import { StaffCmsManage } from './StaffCmsManage.js';
import { usePush } from '../../context/PushContext.js';
import { PushSettingsModal } from './PushSettingsModal.js';
import { getStaffThemeCssVars } from '../../lib/theme.js';
import {
  Store, Volume2, VolumeX, LogOut, LayoutGrid, UtensilsCrossed,
  Bell, BarChart2, Plus, QrCode, CheckCircle2, Clock, Check,
  CreditCard, Sparkles, RefreshCw, Mic, Ban, X, XCircle, Receipt,
  Smartphone, BellRing, Search, ShieldAlert, Palette, Settings, AlertTriangle
} from 'lucide-react';

export const StaffDashboard: React.FC = () => {
  const { user, currentTenant, logout, hasPermission } = useAuth();
  const {
    socket,
    soundEnabled,
    soundMode,
    cycleSoundMode,
    toggleSound,
    requestWakeLock,
    playOrderSound,
    playAlertSound,
    testSound,
    showToast,
    isAudioUnlocked,
    unlockAudio
  } = useNotification();

  const [activeTab, setActiveTab] = useState<'tables' | 'orders' | 'requests' | 'reports' | 'menu' | 'cms'>('tables');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'served'>('all');
  const [tableStatusFilter, setTableStatusFilter] = useState<'all' | 'serving' | 'checkout' | 'zero' | 'empty'>('all');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tables, setTables] = useState<StaffTable[]>([]);
  const [openRequests, setOpenRequests] = useState<ServiceRequest[]>([]);
  const [selectedTable, setSelectedTable] = useState<StaffTable | null>(null);
  const [selectedQrTableId, setSelectedQrTableId] = useState<string | null>(null);
  const [showPushModal, setShowPushModal] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const { state: pushState, isSubscribed: isPushSubscribed } = usePush();

  // Cancellation modal state
  const [cancelModalItem, setCancelModalItem] = useState<{ id: string; name: string; quantity: number; tableNumber?: string } | null>(null);
  const [cancelQty, setCancelQty] = useState<number>(1);
  const [cancelReason, setCancelReason] = useState<string>('Hết nguyên liệu');
  const [markItemOutOfStock, setMarkItemOutOfStock] = useState<boolean>(true);

  // Add Table state
  const [showAddTableModal, setShowAddTableModal] = useState<boolean>(false);
  const [newTableNumber, setNewTableNumber] = useState<string>('');
  const [newTableCapacity, setNewTableCapacity] = useState<number>(4);
  const [isAddingTable, setIsAddingTable] = useState<boolean>(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await request<{ tables: StaffTable[]; openRequests: ServiceRequest[] }>('/staff/dashboard/snapshot');
      setTables(data.tables || []);
      setOpenRequests(data.openRequests || []);
    } catch (err) {
      console.error('Failed to fetch dashboard', err);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Screen unlock / visibility wakeup: immediate fetch & audio sync
  useEffect(() => {
    const handleWakeup = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchDashboard();
      }
    };

    document.addEventListener('visibilitychange', handleWakeup);
    window.addEventListener('focus', handleWakeup);

    return () => {
      document.removeEventListener('visibilitychange', handleWakeup);
      window.removeEventListener('focus', handleWakeup);
    };
  }, [fetchDashboard]);

  // Keep screen awake while on staff dashboard
  useEffect(() => {
    requestWakeLock();
  }, [requestWakeLock]);

  // Connect to staff socket room
  useEffect(() => {
    if (!socket || !currentTenant?.id) return;

    const joinRoom = () => {
      fetchDashboard();
      socket.emit('join_staff_room', { tenantId: currentTenant.id, token: localStorage.getItem('staff_token') });
    };

    joinRoom();
    socket.on('connect', joinRoom);

    const handleOrderCreated = (payload: any) => {
      const tableName = payload?.tableName || 'Bàn';
      const eventId = payload?.orderId ? `order-${payload.orderId}` : undefined;
      playOrderSound(tableName, eventId);
      showToast({
        title: `🔔 Khách gọi món mới (${tableName})`,
        message: `Lượt gọi #${payload?.orderNumber || 'mới'} gồm ${payload?.itemsCount || 1} món`,
        type: 'info',
        duration: 7000
      });
      fetchDashboard();
    };

    const handleServiceRequestCreated = (payload: any) => {
      const tableName = payload?.tableName || 'Bàn';
      const isCheckout = payload?.type === 'CHECKOUT';
      const count = payload?.callCount;
      const eventId = payload?.requestId ? `req-${payload.requestId}-${count || 1}` : undefined;
      playAlertSound(tableName, payload?.type, eventId);
      showToast({
        title: isCheckout
          ? `💳 Yêu cầu thanh toán (${tableName}) ${count && count > 1 ? `• Nhắc lần ${count}` : ''}`
          : `🙋 Khách gọi phục vụ (${tableName}) ${count && count > 1 ? `• Gọi lần ${count}` : ''}`,
        message: isCheckout
          ? (count && count > 1 ? `Khách tại ${tableName} vừa nhắc lại yêu cầu thanh toán (lần ${count})` : 'Khách yêu cầu thanh toán hóa đơn tại bàn')
          : `Khách cần nhân viên hỗ trợ${payload?.note ? ': ' + payload.note : ''}${count && count > 1 ? ` (Lần ${count})` : ''}`,
        type: 'warning',
        duration: 8000
      });
      fetchDashboard();
    };

    const handleUpdate = () => {
      fetchDashboard();
    };

    socket.on('order.created', handleOrderCreated);
    socket.on('order.updated', handleUpdate);
    socket.on('service_request.created', handleServiceRequestCreated);
    socket.on('service_request.updated', handleUpdate);
    socket.on('table.updated', handleUpdate);

    // Backup polling (20s) as safety net while WebSockets handle instant real-time events (optimizing DB load for 100+ stores)
    const interval = setInterval(fetchDashboard, 20000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboard();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      socket.emit('leave_staff_room');
      socket.off('connect', joinRoom);
      socket.off('reconnect', joinRoom);
      socket.off('order.created', handleOrderCreated);
      socket.off('order.updated', handleUpdate);
      socket.off('service_request.created', handleServiceRequestCreated);
      socket.off('service_request.updated', handleUpdate);
      socket.off('table.updated', handleUpdate);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [socket, currentTenant?.id, playOrderSound, playAlertSound, showToast, fetchDashboard]);

  // Permission safeguard: automatically switch to tables tab if current tab is locked for current role
  useEffect(() => {
    if (activeTab === 'reports' && !hasPermission('report.view')) {
      setActiveTab('tables');
    }
    if (activeTab === 'menu' && !hasPermission('menu.manage')) {
      setActiveTab('tables');
    }
    if (activeTab === 'cms' && !['owner', 'manager'].includes(currentTenant?.role || '')) {
      setActiveTab('tables');
    }
  }, [activeTab, currentTenant?.role, hasPermission]);

  // Quick Open Session (F01)
  const handleQuickOpenSession = async (tableId: string) => {
    try {
      await request(`/staff/tables/${tableId}/open`, { method: 'POST' });
      showToast({ title: 'Đã mở bàn thành công', type: 'success', duration: 2500 });
      fetchDashboard();
    } catch (err: any) {
      showToast({ title: err.message || 'Lỗi mở phiên bàn', type: 'error' });
    }
  };

  const handleQuickCloseWithoutCharge = async (sessionId: string) => {
    try {
      await request(`/staff/sessions/${sessionId}/close-without-charge`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'WITHOUT_CHARGE' })
      });
      showToast({
        title: 'Đã tắt bàn thành công',
        message: 'Bàn đã về trạng thái trống sẵn sàng đón khách',
        type: 'success',
        duration: 2500
      });
      fetchDashboard();
    } catch (err: any) {
      showToast({ title: err.message || 'Lỗi đóng phiên 0đ', type: 'error' });
    }
  };

  // Quick Order item handlers directly from Orders tab
  const handleQuickAcceptAll = async (sessionId: string) => {
    try {
      await request(`/staff/sessions/${sessionId}/accept-all`, { method: 'POST' });
      showToast({ title: 'Đã tiếp nhận tất cả món', type: 'success', duration: 3000 });
      fetchDashboard();
    } catch (err: any) {
      showToast({ title: err.message || 'Lỗi tiếp nhận món', type: 'error' });
    }
  };

  const handleQuickServeAll = async (sessionId: string) => {
    try {
      await request(`/staff/sessions/${sessionId}/serve-all`, { method: 'POST' });
      showToast({ title: 'Đã đánh dấu phục vụ tất cả món', type: 'success', duration: 3000 });
      fetchDashboard();
    } catch (err: any) {
      showToast({ title: err.message || 'Lỗi phục vụ', type: 'error' });
    }
  };

  const handleQuickAcceptItem = async (orderItemId: string, quantity: number) => {
    try {
      await request(`/staff/order-items/${orderItemId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ quantity })
      });
      fetchDashboard();
    } catch (err: any) {
      showToast({ title: err.message || 'Lỗi nhận món', type: 'error' });
    }
  };

  const handleQuickServeItem = async (orderItemId: string, quantity: number) => {
    try {
      await request(`/staff/order-items/${orderItemId}/serve`, {
        method: 'POST',
        body: JSON.stringify({ quantity })
      });
      fetchDashboard();
    } catch (err: any) {
      showToast({ title: err.message || 'Lỗi phục vụ', type: 'error' });
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
      showToast({
        title: 'Đã hủy món thành công',
        message: markItemOutOfStock ? 'Đã hủy món và cập nhật HẾT HÀNG trên thực đơn' : 'Đã hủy món thành công',
        type: 'warning',
        duration: 3500
      });
      setCancelModalItem(null);
      fetchDashboard();
    } catch (err: any) {
      showToast({ title: err.message || 'Lỗi hủy món', type: 'error' });
    }
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNumber.trim()) return;
    setIsAddingTable(true);
    try {
      const res = await request<any>('/staff/tables', {
        method: 'POST',
        body: JSON.stringify({
          table_number: newTableNumber.trim(),
          capacity: Number(newTableCapacity) || 4
        })
      });
      showToast({
        title: 'Thêm bàn thành công',
        message: res.message || `Đã tạo ${newTableNumber.trim()}`,
        type: 'success'
      });
      setShowAddTableModal(false);
      setNewTableNumber('');
      setNewTableCapacity(4);
      await fetchDashboard();
    } catch (err: any) {
      showToast({
        title: 'Lỗi tạo bàn',
        message: err.message || 'Không thể tạo bàn mới',
        type: 'error'
      });
    } finally {
      setIsAddingTable(false);
    }
  };

  // Quick Service Request Actions
  const handleAcceptRequest = async (id: string) => {
    try {
      await request(`/staff/service-requests/${id}/accept`, { method: 'POST' });
      fetchDashboard();
    } catch (err: any) {
      alert(err.message || 'Lỗi tiếp nhận');
    }
  };

  const handleCompleteRequest = async (id: string) => {
    try {
      await request(`/staff/service-requests/${id}/complete`, { method: 'POST' });
      fetchDashboard();
    } catch (err: any) {
      alert(err.message || 'Lỗi hoàn tất');
    }
  };

  const pendingOrdersCount = tables.reduce((sum, t) => sum + (t.counts?.pending || 0), 0);
  const checkoutRequestsCount = openRequests.filter(r => r.type === 'CHECKOUT').length;

  const countServing = useMemo(() => {
    return tables.filter(t => t.active_session_id && ((t.counts?.pending || 0) + (t.counts?.accepted || 0) + (t.counts?.served || 0) > 0)).length;
  }, [tables]);

  const countCheckout = useMemo(() => {
    return tables.filter(t => t.hasCheckout).length;
  }, [tables]);

  const countZero = useMemo(() => {
    return tables.filter(t => t.active_session_id && ((t.counts?.pending || 0) + (t.counts?.accepted || 0) + (t.counts?.served || 0) === 0)).length;
  }, [tables]);

  const countEmpty = useMemo(() => {
    return tables.filter(t => !t.active_session_id).length;
  }, [tables]);

  // Filter and sort tables:
  // - Tables with active invoice / session / orders are placed ABOVE empty tables
  // - Within active tables: checkout request first, then more items first
  // - Within empty tables (or if all empty): sorted in natural order (A01, A02, B01, AKA Vip...)
  const filteredTables = useMemo(() => {
    const list = tables.filter((table) => {
      // 1. Text Search Filter
      if (tableSearch.trim()) {
        const q = tableSearch.trim().toLowerCase();
        if (!table.table_number.toLowerCase().includes(q)) return false;
      }

      // 2. Status Tab Filter
      if (tableStatusFilter === 'serving') {
        const totalItems = (table.counts?.pending || 0) + (table.counts?.accepted || 0) + (table.counts?.served || 0);
        return table.active_session_id && totalItems > 0;
      }
      if (tableStatusFilter === 'checkout') {
        return table.hasCheckout;
      }
      if (tableStatusFilter === 'zero') {
        const totalItems = (table.counts?.pending || 0) + (table.counts?.accepted || 0) + (table.counts?.served || 0);
        return table.active_session_id && totalItems === 0;
      }
      if (tableStatusFilter === 'empty') {
        return !table.active_session_id;
      }

      return true;
    });

    return list.sort((a, b) => {
      const aHasSession = Boolean(a.active_session_id);
      const bHasSession = Boolean(b.active_session_id);

      // Active table with bill/session displayed on top of empty table
      if (aHasSession && !bHasSession) return -1;
      if (!aHasSession && bHasSession) return 1;

      // When both are active: checkout request first
      if (aHasSession && bHasSession) {
        if (a.hasCheckout && !b.hasCheckout) return -1;
        if (!a.hasCheckout && b.hasCheckout) return 1;

        const aTotal = (a.counts?.pending || 0) + (a.counts?.accepted || 0) + (a.counts?.served || 0);
        const bTotal = (b.counts?.pending || 0) + (b.counts?.accepted || 0) + (b.counts?.served || 0);
        if (aTotal !== bTotal) return bTotal - aTotal;
      }

      // Natural alphanumeric order (A01, A02, B01, AKA Vip...)
      return a.table_number.localeCompare(b.table_number, 'vi', { numeric: true, sensitivity: 'base' });
    });
  }, [tables, tableSearch, tableStatusFilter]);

  const staffThemeStyles = useMemo(() => {
    return getStaffThemeCssVars(
      currentTenant?.activeThemeConfig?.staffTheme,
      currentTenant?.activeThemeConfig?.staffDensity
    );
  }, [currentTenant?.activeThemeConfig?.staffTheme, currentTenant?.activeThemeConfig?.staffDensity]);

  const staffDensity = currentTenant?.activeThemeConfig?.staffDensity || 'comfortable';

  return (
    <div
      className={`staff-portal min-h-screen bg-slate-100 flex flex-col w-full max-w-lg lg:max-w-[1200px] mx-auto shadow-2xl pb-[calc(6rem+env(safe-area-inset-bottom))] px-0 md:px-6 transition-all ${
        staffDensity === 'compact' ? '' : 'density-comfortable'
      }`}
      style={staffThemeStyles}
    >
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white px-3 py-2.5 shadow-md flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-orange-600 flex items-center justify-center font-black shrink-0 overflow-hidden">
            {currentTenant?.logoUrl ? (
              <img src={currentTenant.logoUrl} alt={currentTenant.name} className="w-full h-full object-cover" />
            ) : (
              <Store className="w-4 h-4 text-white" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-extrabold text-xs sm:text-sm leading-tight truncate">{currentTenant?.name || 'Nhà Hàng'}</h1>
            <div className="text-[10px] sm:text-[11px] text-slate-400 truncate">
              <span>{user?.fullName}</span>
              <span className="mx-1">•</span>
              <span className="capitalize text-orange-400 font-semibold">{currentTenant?.role}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Audio Sound Mode Switcher (Voice -> Chime -> Off) */}
          <button
            onClick={cycleSoundMode}
            className={`w-9 h-9 rounded-xl transition flex items-center justify-center border text-xs font-bold shrink-0 ${
              soundMode === 'voice'
                ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25'
                : soundMode === 'chime'
                ? 'text-orange-400 bg-orange-500/15 border-orange-500/30 hover:bg-orange-500/25'
                : 'text-slate-400 bg-slate-800/80 border-slate-700 hover:bg-slate-800'
            }`}
            title={`Chế độ âm thanh: ${soundMode === 'voice' ? 'Giọng nói tiếng Việt' : soundMode === 'chime' ? 'Chỉ chuông báo' : 'Đã tắt âm'}. Nhấn để chuyển đổi.`}
          >
            {soundMode === 'voice' && <Mic className="w-4 h-4 text-emerald-400 animate-pulse" />}
            {soundMode === 'chime' && <Volume2 className="w-4 h-4 text-orange-400" />}
            {soundMode === 'off' && <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Web Push Notification Settings Button - Icon Only */}
          <button
            onClick={() => setShowPushModal(true)}
            className={`w-9 h-9 rounded-xl transition flex items-center justify-center border text-xs font-bold relative shrink-0 ${
              pushState === 'granted' && isPushSubscribed
                ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25'
                : pushState === 'key_mismatch'
                ? 'text-amber-400 bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/25 animate-pulse'
                : pushState === 'server_disabled'
                ? 'text-slate-500 bg-slate-800/40 border-slate-700/50'
                : pushState === 'http_insecure'
                ? 'text-rose-400 bg-rose-500/15 border-rose-500/30 hover:bg-rose-500/25'
                : pushState === 'denied'
                ? 'text-rose-400 bg-rose-500/15 border-rose-500/30 hover:bg-rose-500/25'
                : pushState === 'ios_need_install'
                ? 'text-amber-400 bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/25 animate-pulse'
                : 'text-slate-300 bg-slate-800/80 border-slate-700 hover:bg-slate-800'
            }`}
            title={`Thông báo đẩy: ${pushState === 'granted' && isPushSubscribed ? 'Đã bật' : pushState === 'server_disabled' ? 'Chưa bật trên máy chủ' : pushState === 'key_mismatch' ? 'Cần cập nhật khóa' : pushState === 'http_insecure' ? 'Cần HTTPS' : pushState === 'denied' ? 'Bị chặn' : pushState === 'ios_need_install' ? 'Cần cài Home Screen' : 'Chưa bật'}. Nhấn để quản lý.`}
          >
            <BellRing className="w-4 h-4" />
            {pushState === 'granted' && isPushSubscribed && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400"></span>
            )}
          </button>

          {/* Test Sound Button - Icon Only */}
          {soundEnabled && (
            <button
              onClick={testSound}
              className="w-9 h-9 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-xl transition flex items-center justify-center shrink-0"
              title="Nghe thử âm báo mẫu"
            >
              <Bell className="w-4 h-4" />
            </button>
          )}

          {/* Logout Button */}
          <button
            onClick={logout}
            className="w-9 h-9 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 flex items-center justify-center transition shrink-0"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Insecure HTTP warning banner */}
      {pushState === 'http_insecure' && (
        <div
          onClick={() => setShowPushModal(true)}
          className="bg-rose-500/20 border-b border-rose-500/30 text-rose-200 px-4 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer hover:bg-rose-500/30 transition"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>iPhone yêu cầu HTTPS để nhận chuông thông báo khi khóa máy</span>
          </div>
          <span className="text-[10px] text-rose-300 font-bold underline shrink-0">Xem cách mở</span>
        </div>
      )}

      {/* iOS Safari Home Screen notification prompt */}
      {pushState === 'ios_need_install' && (
        <div
          onClick={() => setShowPushModal(true)}
          className="bg-amber-500/20 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer hover:bg-amber-500/30 transition"
        >
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
            <span>iPhone: Thêm vào Màn hình chính để nhận chuông khi khóa máy</span>
          </div>
          <span className="text-[10px] text-amber-300 font-bold underline shrink-0">Xem cách cài</span>
        </div>
      )}

      {/* Key mismatch notification prompt */}
      {pushState === 'key_mismatch' && (
        <div
          onClick={() => setShowPushModal(true)}
          className="bg-amber-500/20 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer hover:bg-amber-500/30 transition"
        >
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
            <span>Khóa thông báo máy chủ đã thay đổi: Nhấn để cập nhật lại</span>
          </div>
          <span className="text-[10px] text-amber-300 font-bold underline shrink-0">Cập nhật</span>
        </div>
      )}

      {/* Sync error notification prompt */}
      {pushState === 'sync_error' && (
        <div
          onClick={() => setShowPushModal(true)}
          className="bg-amber-500/20 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer hover:bg-amber-500/30 transition"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Chưa đồng bộ thông báo với máy chủ: Nhấn để kết nối lại</span>
          </div>
          <span className="text-[10px] text-amber-300 font-bold underline shrink-0">Kết nối lại</span>
        </div>
      )}

      {/* Push notification prompt if not yet subscribed and server is available */}
      {(!isPushSubscribed && pushState !== 'server_disabled' && pushState !== 'key_mismatch' && pushState !== 'sync_error' && (pushState === 'default' || pushState === 'granted')) && (
        <div
          onClick={() => setShowPushModal(true)}
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 px-4 py-2.5 text-xs font-black flex items-center justify-between cursor-pointer transition shadow-md"
        >
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 animate-bounce shrink-0 text-slate-950" />
            <span>Nhấn để Bật Web Push (nhận chuông thông báo khi iPhone tắt/khóa màn hình)</span>
          </div>
          <span className="bg-slate-950 text-white text-[10px] px-2.5 py-1 rounded-lg font-black uppercase tracking-wider shrink-0 shadow-xs">
            Bật ngay
          </span>
        </div>
      )}

      {/* Main Container */}
      <main className="p-4 flex-1">
        {/* TAB 1: Tables Overview */}
        {activeTab === 'tables' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-extrabold text-slate-900 text-lg">Danh sách bàn</h2>
                <p className="text-xs text-slate-500">Trạng thái thời gian thực của các bàn phục vụ</p>
              </div>
              <div className="flex items-center gap-1.5">
                {hasPermission('table.manage') && (
                  <button
                    type="button"
                    onClick={() => setShowAddTableModal(true)}
                    className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1 min-h-[38px] cursor-pointer"
                    title="Tạo thêm bàn mới"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm bàn</span>
                  </button>
                )}
                <button
                  onClick={fetchDashboard}
                  className="p-2 text-slate-500 hover:text-slate-900 rounded-full hover:bg-white min-h-[44px] min-w-[44px] flex items-center justify-center transition"
                  title="Làm mới"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Search & Filter Bar for 100 Tables */}
            <div className="space-y-2.5">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Tìm nhanh số bàn (vd: 12, A01)..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200/90 rounded-2xl pl-10 pr-9 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 shadow-xs"
                />
                {tableSearch && (
                  <button
                    onClick={() => setTableSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-full"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Interactive Status Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-bold no-scrollbar">
                <button
                  type="button"
                  onClick={() => setTableStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    tableStatusFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-xs ring-2 ring-slate-900/30'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Hiển thị tất cả bàn"
                >
                  <span>Tất cả bàn</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    tableStatusFilter === 'all'
                      ? 'bg-slate-700 text-slate-200'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {tables.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTableStatusFilter(tableStatusFilter === 'serving' ? 'all' : 'serving')}
                  className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    tableStatusFilter === 'serving'
                      ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-500/30'
                      : 'bg-blue-50 text-blue-900 border border-blue-200 hover:bg-blue-100/70'
                  }`}
                  title="Lọc các bàn đang có khách gọi món"
                >
                  <span>Đang dùng</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    tableStatusFilter === 'serving'
                      ? 'bg-blue-800 text-white'
                      : 'bg-blue-600 text-white'
                  }`}>
                    {countServing}
                  </span>
                </button>

                {countCheckout > 0 && (
                  <button
                    type="button"
                    onClick={() => setTableStatusFilter(tableStatusFilter === 'checkout' ? 'all' : 'checkout')}
                    className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      tableStatusFilter === 'checkout'
                        ? 'bg-amber-600 text-white shadow-xs ring-2 ring-amber-500/30'
                        : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200/80 animate-pulse'
                    }`}
                    title="Lọc các bàn đang xin thanh toán"
                  >
                    <span>Cần bill</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      tableStatusFilter === 'checkout'
                        ? 'bg-amber-800 text-white'
                        : 'bg-amber-600 text-white'
                    }`}>
                      {countCheckout}
                    </span>
                  </button>
                )}

                {countZero > 0 && (
                  <button
                    type="button"
                    onClick={() => setTableStatusFilter(tableStatusFilter === 'zero' ? 'all' : 'zero')}
                    className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      tableStatusFilter === 'zero'
                        ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-500/30'
                        : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100/70'
                    }`}
                    title="Lọc các bàn mở nhầm chưa có món"
                  >
                    <span>Bàn 0đ</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      tableStatusFilter === 'zero'
                        ? 'bg-rose-800 text-white'
                        : 'bg-rose-600 text-white'
                    }`}>
                      {countZero}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setTableStatusFilter(tableStatusFilter === 'empty' ? 'all' : 'empty')}
                  className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    tableStatusFilter === 'empty'
                      ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-500/30'
                      : 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100/70'
                  }`}
                  title="Lọc các bàn trống sẵn sàng đón khách"
                >
                  <span>Bàn trống</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    tableStatusFilter === 'empty'
                      ? 'bg-emerald-800 text-white'
                      : 'bg-emerald-600 text-white'
                  }`}>
                    {countEmpty}
                  </span>
                </button>
              </div>
            </div>

            {/* Tables Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredTables.length === 0 ? (
                <div className="col-span-2 text-center py-12 bg-white rounded-3xl border border-slate-200/90 p-6 space-y-2">
                  <Store className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700 text-sm">Không tìm thấy bàn nào</p>
                  <p className="text-xs text-slate-400">
                    {tableSearch ? `Không có bàn nào khớp với "${tableSearch}"` : 'Không có bàn nào thuộc bộ lọc này'}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setTableSearch(''); setTableStatusFilter('all'); }}
                    className="mt-2 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold rounded-xl text-xs transition inline-flex items-center gap-1"
                  >
                    Xem lại tất cả bàn
                  </button>
                </div>
              ) : (
                filteredTables.map((table) => {
                  const isServing = !!table.active_session_id;
                  const totalItems = (table.counts?.pending || 0) + (table.counts?.accepted || 0) + (table.counts?.served || 0);
                  const hasPending = (table.counts?.pending || 0) > 0;
                  const hasCheckout = table.hasCheckout;
                  const isZeroOrder = isServing && totalItems === 0;

                  return (
                    <div
                      key={table.table_id}
                      className={`bg-white rounded-2xl p-3 sm:p-3.5 border transition shadow-xs flex flex-col justify-between min-h-[148px] ${
                        hasCheckout
                          ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-400/50 animate-pulse-attention'
                          : isZeroOrder
                          ? 'border-rose-200 bg-rose-50/20'
                          : isServing
                          ? 'border-blue-200 hover:border-blue-300'
                          : 'border-slate-200'
                      }`}
                    >
                      {/* Header + Info (Clickable to open detail modal) */}
                      <div
                        onClick={() => setSelectedTable(table)}
                        className="cursor-pointer select-none"
                      >
                        {/* Table Number & Status Pill */}
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-black text-slate-900 text-base sm:text-lg">
                            Bàn {table.table_number}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                            hasCheckout
                              ? 'bg-amber-500 text-white animate-pulse'
                              : isZeroOrder
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : isServing
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {hasCheckout
                              ? 'Yêu cầu bill'
                              : isZeroOrder
                              ? 'Bàn 0đ'
                              : isServing
                              ? 'Phục vụ'
                              : 'Bàn trống'}
                          </span>
                        </div>

                        {/* Counts / Session info */}
                        <div className="mt-2 text-xs">
                          {isServing ? (
                            isZeroOrder ? (
                              <span className="text-rose-500 font-medium text-[11px] leading-tight block">
                                Chưa có order (mở nhầm)
                              </span>
                            ) : hasPending ? (
                              <span className="font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-md text-[11px] inline-block">
                                {table.counts.pending} món chờ nhận
                              </span>
                            ) : (
                              <span className="text-slate-600 font-semibold text-[11px] inline-block">
                                {totalItems} món đang phục vụ
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400 text-[11px] inline-block">
                              Sẵn sàng đón khách
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions: Always exactly 2 buttons (1 primary flex-1 + 1 QR icon) */}
                      <div className="flex items-center gap-1.5 pt-2.5 border-t border-slate-100 mt-2">
                        {!isServing ? (
                          <button
                            onClick={() => handleQuickOpenSession(table.table_id)}
                            disabled={!hasPermission('session.open')}
                            className="flex-1 py-1.5 px-2 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-bold text-xs rounded-xl shadow-xs transition min-h-[38px] flex items-center justify-center gap-1 whitespace-nowrap"
                            title="Mở phiên bàn"
                          >
                            <Plus className="w-3.5 h-3.5 shrink-0" />
                            <span>Mở bàn</span>
                          </button>
                        ) : isZeroOrder ? (
                          <button
                            onClick={() => handleQuickCloseWithoutCharge(table.active_session_id!)}
                            disabled={!hasPermission('session.close_without_charge')}
                            className="flex-1 py-1.5 px-2 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-bold text-xs rounded-xl border border-rose-300 transition min-h-[38px] flex items-center justify-center gap-1 whitespace-nowrap"
                            title="Tắt bàn mở nhầm"
                          >
                            <XCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                            <span>Tắt</span>
                          </button>
                        ) : hasCheckout ? (
                          <button
                            onClick={() => setSelectedTable(table)}
                            className="flex-1 py-1.5 px-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-black text-xs rounded-xl shadow-xs transition min-h-[38px] flex items-center justify-center gap-1 whitespace-nowrap animate-pulse"
                            title="Khách yêu cầu thanh toán"
                          >
                            <CreditCard className="w-3.5 h-3.5 shrink-0" />
                            <span>Thanh toán</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedTable(table)}
                            className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-black active:bg-slate-800 text-white font-bold text-xs rounded-xl transition min-h-[38px] flex items-center justify-center gap-1 whitespace-nowrap"
                            title="Xem chi tiết đơn"
                          >
                            <Receipt className="w-3.5 h-3.5 shrink-0" />
                            <span>Xem đơn ({totalItems})</span>
                          </button>
                        )}

                        <button
                          onClick={() => setSelectedQrTableId(table.table_id)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 rounded-xl hover:bg-slate-100 min-h-[38px] min-w-[38px] shrink-0 flex items-center justify-center border border-slate-200 transition"
                          title="Xem mã QR"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Direct Orders Feed with Classification Filter */}
        {activeTab === 'orders' && (() => {
          const allActiveItems = tables.flatMap(t => (t.active_session_id ? t.activeItems || [] : []));
          const countPending = allActiveItems.filter(i => i.status === 'PENDING').length;
          const countAccepted = allActiveItems.filter(i => i.status === 'ACCEPTED').length;
          const countServed = allActiveItems.filter(i => i.status === 'SERVED').length;

          const tablesWithFilteredItems = tables
            .filter(t => t.active_session_id && t.activeItems && t.activeItems.length > 0)
            .map(table => {
              const items = (table.activeItems || []).filter(item => {
                if (orderStatusFilter === 'pending') return item.status === 'PENDING';
                if (orderStatusFilter === 'accepted') return item.status === 'ACCEPTED';
                if (orderStatusFilter === 'served') return item.status === 'SERVED';
                return true;
              });
              return { table, items };
            })
            .filter(({ items }) => items.length > 0);

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-extrabold text-slate-900 text-lg">Quản lý đơn món</h2>
                  <p className="text-xs text-slate-500">Phân loại & xử lý món trực tiếp tại các bàn</p>
                </div>
                <button
                  onClick={fetchDashboard}
                  className="p-2 text-slate-500 hover:text-slate-900 rounded-full hover:bg-white min-h-[44px] min-w-[44px] flex items-center justify-center transition"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Classification Segmented Control Bar */}
              <div className="grid grid-cols-4 p-1 bg-slate-200/80 rounded-2xl gap-1 text-[10px] sm:text-[11px] font-bold">
                <button
                  onClick={() => setOrderStatusFilter('all')}
                  className={`py-2 px-1 rounded-xl transition flex flex-col items-center justify-center gap-0.5 ${
                    orderStatusFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">Tất cả</span>
                  <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    orderStatusFilter === 'all' ? 'bg-slate-100 text-slate-700' : 'bg-slate-300 text-slate-600'
                  }`}>
                    {allActiveItems.length}
                  </span>
                </button>

                <button
                  onClick={() => setOrderStatusFilter('pending')}
                  className={`py-2 px-1 rounded-xl transition flex flex-col items-center justify-center gap-0.5 ${
                    orderStatusFilter === 'pending'
                      ? 'bg-amber-500 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-amber-700'
                  }`}
                >
                  <span className="truncate">Chờ nhận</span>
                  <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    orderStatusFilter === 'pending'
                      ? 'bg-amber-700 text-white'
                      : countPending > 0
                      ? 'bg-amber-200 text-amber-900 animate-pulse font-black'
                      : 'bg-slate-300 text-slate-600'
                  }`}>
                    {countPending}
                  </span>
                </button>

                <button
                  onClick={() => setOrderStatusFilter('accepted')}
                  className={`py-2 px-1 rounded-xl transition flex flex-col items-center justify-center gap-0.5 ${
                    orderStatusFilter === 'accepted'
                      ? 'bg-blue-600 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-blue-700'
                  }`}
                >
                  <span className="truncate">Phục vụ</span>
                  <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    orderStatusFilter === 'accepted'
                      ? 'bg-blue-800 text-white'
                      : countAccepted > 0
                      ? 'bg-blue-100 text-blue-900 font-black'
                      : 'bg-slate-300 text-slate-600'
                  }`}>
                    {countAccepted}
                  </span>
                </button>

                <button
                  onClick={() => setOrderStatusFilter('served')}
                  className={`py-2 px-1 rounded-xl transition flex flex-col items-center justify-center gap-0.5 ${
                    orderStatusFilter === 'served'
                      ? 'bg-emerald-600 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  <span className="truncate">Hoàn tất</span>
                  <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    orderStatusFilter === 'served'
                      ? 'bg-emerald-800 text-white'
                      : countServed > 0
                      ? 'bg-emerald-100 text-emerald-900 font-black'
                      : 'bg-slate-300 text-slate-600'
                  }`}>
                    {countServed}
                  </span>
                </button>
              </div>

              {/* Order Cards List or Empty State */}
              {tablesWithFilteredItems.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-6">
                  <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <h3 className="font-bold text-slate-800 text-base">
                    {orderStatusFilter === 'pending'
                      ? 'Không có món nào chờ xác nhận'
                      : orderStatusFilter === 'accepted'
                      ? 'Không có món nào cần phục vụ'
                      : orderStatusFilter === 'served'
                      ? 'Chưa có món nào đã hoàn tất'
                      : 'Không có món nào đang xử lý'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {orderStatusFilter === 'pending'
                      ? 'Tất cả các món khách gọi đều đã được tiếp nhận!'
                      : orderStatusFilter === 'accepted'
                      ? 'Bếp đang làm hoặc tất cả món đã được mang ra bàn!'
                      : orderStatusFilter === 'served'
                      ? 'Các món ăn sau khi phục vụ ra bàn sẽ hiển thị tại đây.'
                      : 'Khi khách gọi món, danh sách món và ghi chú sẽ hiển thị ngay tại đây'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {tablesWithFilteredItems.map(({ table, items }) => {
                  const pendingCount = items.filter(i => i.status === 'PENDING').length;
                  const acceptedCount = items.filter(i => i.status === 'ACCEPTED').length;
                  const servedCount = items.filter(i => i.status === 'SERVED').length;

                  return (
                    <div key={table.table_id} className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-sm space-y-3">
                      {/* Table Header & Action Buttons */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 text-base">Bàn {table.table_number}</span>
                          {pendingCount > 0 ? (
                            <span className="text-[11px] font-bold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full animate-pulse">
                              {pendingCount} món chờ nhận
                            </span>
                          ) : acceptedCount > 0 ? (
                            <span className="text-[11px] font-bold bg-blue-100 text-blue-900 px-2.5 py-0.5 rounded-full">
                              {acceptedCount} món cần phục vụ
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded-full">
                              {servedCount} món đã hoàn tất
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {pendingCount > 0 && hasPermission('order.manage') && (
                            <button
                              onClick={() => handleQuickAcceptAll(table.active_session_id!)}
                              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
                            >
                              Nhận tất cả ({pendingCount})
                            </button>
                          )}
                          {acceptedCount > 0 && hasPermission('order.serve') && (
                            <button
                              onClick={() => handleQuickServeAll(table.active_session_id!)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
                            >
                              Phục vụ tất cả ({acceptedCount})
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedTable(table)}
                            className="p-1.5 text-slate-400 hover:text-slate-800 rounded-xl hover:bg-slate-100"
                            title="Mở toàn bộ hóa đơn"
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Itemized Dish List */}
                      <div className="space-y-2">
                        {items.map((item, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-2xl border transition ${
                              item.status === 'PENDING'
                                ? 'bg-amber-50/70 border-amber-200'
                                : item.status === 'ACCEPTED'
                                ? 'bg-blue-50/50 border-blue-200'
                                : item.status === 'SERVED'
                                ? 'bg-emerald-50/40 border-emerald-200'
                                : 'bg-slate-50 border-slate-200 opacity-60'
                            }`}
                          >
                            <div className="space-y-2">
                              {/* Row 1: Quantity + Dish Name + Status (Full Width, never truncated) */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-baseline gap-2 min-w-0 flex-1 flex-wrap">
                                  <span className="font-black text-slate-900 text-sm sm:text-base shrink-0">{item.quantity}x</span>
                                  <span className="font-extrabold text-slate-900 text-sm sm:text-base break-words line-clamp-2 leading-tight">{item.name}</span>
                                  {item.variantName && (
                                    <span className="text-[11px] font-bold px-2 py-0.5 bg-orange-100 text-orange-700 rounded-md shrink-0">
                                      {item.variantName}
                                    </span>
                                  )}
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                  item.status === 'PENDING' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                  item.status === 'ACCEPTED' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                  item.status === 'SERVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {item.status === 'PENDING' ? 'Chờ nhận' :
                                   item.status === 'ACCEPTED' ? 'Cần phục vụ' :
                                   item.status === 'SERVED' ? 'Đã phục vụ' : 'Đã hủy'}
                                </span>
                              </div>

                              {/* Row 2: Customer Note (if any) */}
                              {item.note && (
                                <div className="px-2.5 py-1.5 bg-amber-100/90 text-amber-950 font-bold text-xs rounded-xl border border-amber-300 flex items-start gap-1.5 shadow-2xs">
                                  <span className="text-amber-700 shrink-0">📌 Ghi chú:</span>
                                  <span className="break-words font-medium">{item.note}</span>
                                </div>
                              )}

                              {/* Row 3: Action Buttons (Spacious on mobile) */}
                              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100/80">
                                {item.status === 'PENDING' && hasPermission('order.manage') && (
                                  <button
                                    onClick={() => handleQuickAcceptItem(item.orderItemId, item.quantity)}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-xs min-h-[40px] flex items-center justify-center gap-1"
                                  >
                                    <span>Nhận món</span>
                                  </button>
                                )}
                                {item.status === 'ACCEPTED' && hasPermission('order.serve') && (
                                  <button
                                    onClick={() => handleQuickServeItem(item.orderItemId, item.quantity)}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs min-h-[40px] flex items-center justify-center gap-1"
                                  >
                                    <span>Đã phục vụ</span>
                                  </button>
                                )}
                                {(item.status === 'PENDING' || item.status === 'ACCEPTED') && hasPermission('order.cancel') && (
                                  <button
                                    onClick={() => {
                                      setCancelModalItem({
                                        id: item.orderItemId,
                                        name: item.name,
                                        quantity: item.quantity,
                                        tableNumber: table.table_number
                                      });
                                      setCancelQty(item.quantity);
                                      setCancelReason('Hết nguyên liệu');
                                      setMarkItemOutOfStock(true);
                                    }}
                                    className="px-3 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition min-h-[40px] flex items-center gap-1 text-xs font-bold"
                                    title="Hủy món vì hết nguyên liệu"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    <span>Hủy món</span>
                                  </button>
                                )}
                                {item.status === 'SERVED' && (
                                  <span className="text-emerald-700 font-bold text-xs flex items-center gap-1 py-1">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                    <span>Hoàn tất</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Footer Actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <span className="text-slate-400">
                          {items.length} món • Lượt gọi #{items[items.length - 1]?.orderNumber || 1}
                        </span>
                        <button
                          onClick={() => setSelectedTable(table)}
                          className="font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1"
                        >
                          <span>Xem hóa đơn & Chốt bill &rarr;</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
        })()}

        {/* TAB 3: Service Requests Feed - Grouped by Table */}
        {activeTab === 'requests' && (() => {
          // Group openRequests by table_id
          const requestsGroupedByTable = openRequests.reduce((acc, req) => {
            const tid = req.table_id || 'unknown';
            if (!acc[tid]) {
              acc[tid] = {
                tableNumber: req.table_number,
                tableId: req.table_id,
                requests: []
              };
            }
            acc[tid].requests.push(req);
            return acc;
          }, {} as Record<string, { tableNumber: string; tableId: string; requests: ServiceRequest[] }>);

          const tableEntries = Object.values(requestsGroupedByTable);

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-extrabold text-slate-900 text-lg">Yêu cầu hỗ trợ & Thanh toán</h2>
                  <p className="text-xs text-slate-500">Phân nhóm và hiển thị số lần theo từng bàn</p>
                </div>
                <button
                  onClick={fetchDashboard}
                  className="p-2 text-slate-500 hover:text-slate-900 rounded-full hover:bg-white min-h-[44px] min-w-[44px] flex items-center justify-center transition"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {tableEntries.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-6">
                  <Bell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <h3 className="font-bold text-slate-800">Không có yêu cầu nào</h3>
                  <p className="text-xs text-slate-400 mt-1">Khi khách bấm gọi hoặc xin thanh toán sẽ hiện tại đây</p>
                </div>
              ) : (
                tableEntries.map((group) => {
                  const checkoutReq = group.requests.find(r => r.type === 'CHECKOUT');
                  const assistanceReq = group.requests.find(r => r.type === 'ASSISTANCE');
                  const tableObj = tables.find(t => t.table_id === group.tableId);

                  return (
                    <div
                      key={group.tableId}
                      className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm space-y-3.5"
                    >
                      {/* Table Card Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 text-lg">Bàn {group.tableNumber}</span>
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {group.requests.length} yêu cầu
                          </span>
                        </div>
                        {tableObj && (
                          <button
                            onClick={() => setSelectedTable(tableObj)}
                            className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 min-h-[36px]"
                          >
                            <span>Xem bàn &rarr;</span>
                          </button>
                        )}
                      </div>

                      {/* Checkout Request if present */}
                      {checkoutReq && (
                        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm">
                              <CreditCard className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>Yêu cầu thanh toán</span>
                              {checkoutReq.call_count && checkoutReq.call_count > 1 ? (
                                <span className="text-[11px] bg-amber-600 text-white font-black px-2 py-0.5 rounded-full animate-pulse">
                                  Nhắc {checkoutReq.call_count} lần
                                </span>
                              ) : (
                                <span className="text-[10px] bg-amber-200/80 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                                  Lần 1
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {new Date(checkoutReq.updated_at || checkoutReq.created_at).toLocaleTimeString('vi-VN')}
                            </span>
                          </div>

                          {checkoutReq.note && (
                            <p className="text-xs text-amber-800 italic bg-white/80 p-2 rounded-xl border border-amber-200/60">
                              Ghi chú: {checkoutReq.note}
                            </p>
                          )}

                          <button
                            onClick={() => {
                              if (tableObj) setSelectedTable(tableObj);
                            }}
                            className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-xs min-h-[44px] flex items-center justify-center gap-1.5"
                          >
                            <CreditCard className="w-4 h-4" />
                            <span>Mở tổng bill bàn {group.tableNumber} để chốt tiền</span>
                          </button>
                        </div>
                      )}

                      {/* Assistance Request if present */}
                      {assistanceReq && (
                        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-blue-900 font-extrabold text-sm">
                              <Bell className="w-4 h-4 text-blue-600 shrink-0" />
                              <span>Khách gọi hỗ trợ</span>
                              {assistanceReq.call_count && assistanceReq.call_count > 1 ? (
                                <span className="text-[11px] bg-blue-600 text-white font-black px-2 py-0.5 rounded-full animate-pulse">
                                  Gọi {assistanceReq.call_count} lần
                                </span>
                              ) : (
                                <span className="text-[10px] bg-blue-200/80 text-blue-900 font-bold px-2 py-0.5 rounded-full">
                                  Lần 1
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {new Date(assistanceReq.updated_at || assistanceReq.created_at).toLocaleTimeString('vi-VN')}
                            </span>
                          </div>

                          {assistanceReq.note && (
                            <div className="px-2.5 py-1.5 bg-white border border-blue-200 rounded-xl text-xs text-blue-900 font-medium">
                              📌 "{assistanceReq.note}"
                            </div>
                          )}

                          <div className="flex gap-2">
                            {assistanceReq.status === 'PENDING' && (
                              <button
                                onClick={() => handleAcceptRequest(assistanceReq.id)}
                                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs min-h-[44px]"
                              >
                                Tiếp nhận
                              </button>
                            )}
                            <button
                              onClick={() => handleCompleteRequest(assistanceReq.id)}
                              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs min-h-[44px]"
                            >
                              Đã hỗ trợ xong
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}

        {/* TAB 4: Reports & Analytics */}
        {activeTab === 'reports' && <StaffReports />}

        {/* TAB 5: Menu Management */}
        {activeTab === 'menu' && <StaffMenuManage />}

        {/* TAB 6: Multi-Tenant CMS Management */}
        {activeTab === 'cms' && <StaffCmsManage />}
      </main>

      {/* Staff Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 px-2 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] w-full max-w-lg lg:max-w-[1200px] mx-auto flex items-center justify-around shadow-lg">
        <button
          onClick={() => setActiveTab('tables')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition ${
            activeTab === 'tables' ? 'text-orange-600 bg-orange-50 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] mt-1">Bàn</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition relative ${
            activeTab === 'orders' ? 'text-orange-600 bg-orange-50 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <UtensilsCrossed className="w-5 h-5" />
          <span className="text-[10px] mt-1">Đơn món</span>
          {pendingOrdersCount > 0 && (
            <span className="absolute top-1.5 right-4 px-1.5 py-0.2 bg-orange-600 text-white rounded-full text-[9px] font-black">
              {pendingOrdersCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition relative ${
            activeTab === 'requests' ? 'text-orange-600 bg-orange-50 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <Bell className="w-5 h-5" />
          <span className="text-[10px] mt-1">Hỗ trợ</span>
          {openRequests.length > 0 && (
            <span className="absolute top-1.5 right-4 w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
          )}
        </button>

        {hasPermission('report.view') && (
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition ${
              activeTab === 'reports' ? 'text-orange-600 bg-orange-50 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <BarChart2 className="w-5 h-5" />
            <span className="text-[10px] mt-1">Báo cáo</span>
          </button>
        )}

        {hasPermission('menu.manage') && (
          <button
            onClick={() => setActiveTab('menu')}
            className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition ${
              activeTab === 'menu' ? 'text-orange-600 bg-orange-50 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <Store className="w-5 h-5" />
            <span className="text-[10px] mt-1">Món</span>
          </button>
        )}

        {['owner', 'manager'].includes(currentTenant?.role || '') && (
          <button
            onClick={() => setActiveTab('cms')}
            className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition ${
              activeTab === 'cms' ? 'text-orange-600 bg-orange-50 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[10px] mt-1">Thiết lập</span>
          </button>
        )}
      </nav>

      {/* Table Detail Modal */}
      <TableDetailModal
        table={selectedTable}
        onClose={() => setSelectedTable(null)}
        onRefresh={fetchDashboard}
      />

      {/* QR Code Modal */}
      <QRModal
        tableId={selectedQrTableId}
        onClose={() => setSelectedQrTableId(null)}
      />

      {/* Web Push Notification Settings Modal */}
      <PushSettingsModal
        isOpen={showPushModal}
        onClose={() => setShowPushModal(false)}
      />

      {/* Cancellation Modal for Staff Dashboard */}
      {cancelModalItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Hủy món: {cancelModalItem.name}</h3>
                {cancelModalItem.tableNumber && (
                  <p className="text-xs text-slate-500">Bàn {cancelModalItem.tableNumber}</p>
                )}
              </div>
              <button
                onClick={() => setCancelModalItem(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Số lượng cần hủy</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={cancelModalItem.quantity}
                  value={cancelQty}
                  onChange={(e) => setCancelQty(Math.max(1, Math.min(cancelModalItem.quantity, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-center text-slate-900 text-base"
                />
                <span className="text-xs text-slate-400 font-medium">/ {cancelModalItem.quantity}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Lý do hủy đơn</label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-800"
              >
                <option value="Hết nguyên liệu">Hết nguyên liệu</option>
                <option value="Hết món">Hết món</option>
                <option value="Khách đổi ý trước khi làm">Khách đổi ý trước khi làm</option>
                <option value="Lý do khác">Lý do khác</option>
              </select>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700 bg-amber-50/80 p-3 rounded-xl border border-amber-200">
              <input
                type="checkbox"
                checked={markItemOutOfStock}
                onChange={(e) => setMarkItemOutOfStock(e.target.checked)}
                className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 mt-0.5"
              />
              <div>
                <span className="font-bold text-amber-900 block">Đánh dấu hết hàng trên thực đơn</span>
                <span className="text-[11px] text-amber-700">Khách quét QR sẽ thấy món tạm ngưng và không thể đặt thêm.</span>
              </div>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setCancelModalItem(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs min-h-[44px]"
              >
                Đóng
              </button>
              <button
                onClick={handleConfirmCancel}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs shadow-md min-h-[44px]"
              >
                Xác nhận hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD TABLE MODAL */}
      {showAddTableModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-slide-up">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Store className="w-5 h-5 text-orange-600" />
                <span>Thêm Bàn Phục Vụ Mới</span>
              </h3>
              <button
                type="button"
                onClick={() => { setShowAddTableModal(false); setNewTableNumber(''); }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddTable} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Số Bàn / Tên Bàn *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Bàn 06, A03, VIP 1..."
                  value={newTableNumber}
                  onChange={(e) => setNewTableNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-orange-500 text-sm"
                  autoFocus
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Mỗi bàn sẽ tự động được cấp mã QR riêng để khách quét gọi món.</span>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Sức Chứa Dự Kiến (Người)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={newTableCapacity}
                  onChange={(e) => setNewTableCapacity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-orange-500 text-sm"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowAddTableModal(false); setNewTableNumber(''); }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isAddingTable || !newTableNumber.trim()}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {isAddingTable ? 'Đang tạo...' : 'Tạo Bàn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
