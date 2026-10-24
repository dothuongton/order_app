import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useNotification } from '../../context/NotificationContext.js';
import { request } from '../../api/client.js';
import { StaffTable, ServiceRequest, PendingTableRequest } from '../../types/index.js';
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
  Smartphone, BellRing, Search, ShieldAlert, Palette, Settings, AlertTriangle,
  ChevronRight, ArrowLeft, UserCheck, Sliders, Radio, Tag, Image as ImageIcon,
  Edit3, User, Loader2, Layers, KeyRound
} from 'lucide-react';
import { StaffChangePasswordModal } from './StaffChangePasswordModal.js';
import { TableManageModal } from './TableManageModal.js';

export const StaffDashboard: React.FC = () => {
  const { user, currentTenant, logout, hasPermission, updateUserProfile } = useAuth();
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

  const [activeTab, setActiveTab] = useState<'tables' | 'orders' | 'requests' | 'settings' | 'reports' | 'menu' | 'cms'>('tables');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'served'>('all');
  const [tableStatusFilter, setTableStatusFilter] = useState<'all' | 'pending' | 'checkout' | 'serving' | 'assistance' | 'empty' | 'zero'>('all');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tables, setTables] = useState<StaffTable[]>([]);
  const [openRequests, setOpenRequests] = useState<ServiceRequest[]>([]);
  const [selectedTable, setSelectedTable] = useState<StaffTable | null>(null);
  const [selectedQrTableId, setSelectedQrTableId] = useState<string | null>(null);
  const [showPushModal, setShowPushModal] = useState<boolean>(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState<boolean>(false);
  const [showTableManageModal, setShowTableManageModal] = useState<boolean>(false);
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

  const [pendingRequests, setPendingRequests] = useState<PendingTableRequest[]>([]);

  // CMS initial subTab state
  const [cmsSubTab, setCmsSubTab] = useState<'branding' | 'banners' | 'promotions' | 'history'>('branding');

  // Staff Profile Modal state
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [profileName, setProfileName] = useState<string>('');
  const [profilePhone, setProfilePhone] = useState<string>('');
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Swipe gesture detection to navigate back from subviews to settings
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);

  const handleSubViewTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleSubViewTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartXRef.current;
    const deltaY = touchEndY - touchStartYRef.current;
    if (deltaX > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      setActiveTab('settings');
    }
  };

  const handleOpenProfileModal = () => {
    setProfileName(user?.fullName || '');
    setProfilePhone(user?.phone || '');
    setProfileMsg(null);
    setShowProfileModal(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = profileName.trim();
    if (!trimmed) {
      setProfileMsg({ type: 'error', text: 'Tên nhân viên không được để trống' });
      return;
    }
    setIsSavingProfile(true);
    setProfileMsg(null);
    try {
      await updateUserProfile({ fullName: trimmed, phone: profilePhone.trim() || undefined });
      setProfileMsg({ type: 'success', text: 'Cập nhật thông tin thành công' });
      setTimeout(() => setShowProfileModal(false), 800);
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err.message || 'Không thể cập nhật thông tin' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await request<{ tables: StaffTable[]; openRequests: ServiceRequest[] }>('/staff/dashboard/snapshot');
      setTables(data.tables || []);
      setOpenRequests(data.openRequests || []);
    } catch (err) {
      console.error('Failed to fetch dashboard', err);
    }
  }, []);

  const fetchPendingRequests = useCallback(async () => {
    try {
      const data = await request<{ requests: PendingTableRequest[] }>('/staff/requests/pending');
      setPendingRequests(data.requests || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchPendingRequests();
  }, [fetchDashboard, fetchPendingRequests]);

  const handleApproveRequest = async (tableId: string) => {
    try {
      await request(`/staff/tables/${tableId}/approve-request`, { method: 'POST' });
      showToast({ title: 'Đã duyệt mở bàn thành công', type: 'success', duration: 3000 });
      fetchDashboard();
      fetchPendingRequests();
    } catch (err: any) {
      showToast({ title: err.message || 'Lỗi duyệt mở bàn', type: 'error' });
    }
  };

  const handleRejectRequest = async (tableId: string) => {
    try {
      await request(`/staff/tables/${tableId}/reject-request`, { method: 'POST' });
      showToast({ title: 'Đã từ chối yêu cầu mở bàn', type: 'info', duration: 3000 });
      fetchDashboard();
      fetchPendingRequests();
    } catch (err: any) {
      showToast({ title: err.message || 'Lỗi từ chối mở bàn', type: 'error' });
    }
  };

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
      fetchPendingRequests();
    };

    const handleTableRequested = (payload: any) => {
      fetchDashboard();
      fetchPendingRequests();
      const tableName = payload?.tableNumber ? `Bàn ${payload.tableNumber}` : 'Bàn';
      playAlertSound(tableName, 'ASSISTANCE');
      showToast({
        title: `✨ Yêu cầu mở ${tableName}`,
        message: `Khách "${payload?.guestName || 'Khách'}" vừa yêu cầu mở bàn`,
        type: 'info',
        duration: 8000
      });
    };

    socket.on('order.created', handleOrderCreated);
    socket.on('order.updated', handleUpdate);
    socket.on('service_request.created', handleServiceRequestCreated);
    socket.on('service_request.updated', handleUpdate);
    socket.on('table.updated', handleUpdate);
    socket.on('table_session:requested', handleTableRequested);
    socket.on('table_session:withdrawn', handleUpdate);
    socket.on('table_session:opened', handleUpdate);
    socket.on('table_session:rejected', handleUpdate);

    // Backup polling (20s) as safety net while WebSockets handle instant real-time events (optimizing DB load for 100+ stores)
    const interval = setInterval(() => {
      fetchDashboard();
      fetchPendingRequests();
    }, 20000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboard();
        fetchPendingRequests();
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
      socket.off('table_session:requested', handleTableRequested);
      socket.off('table_session:withdrawn', handleUpdate);
      socket.off('table_session:opened', handleUpdate);
      socket.off('table_session:rejected', handleUpdate);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [socket, currentTenant?.id, playOrderSound, playAlertSound, showToast, fetchDashboard, fetchPendingRequests]);

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
  const countPending = pendingRequests.length;
  const countCheckout = useMemo(() => {
    return tables.filter(t => t.hasCheckout || openRequests.some(r => r.table_id === t.table_id && r.type === 'CHECKOUT')).length;
  }, [tables, openRequests]);

  const countServing = useMemo(() => {
    return tables.filter(t => t.active_session_id && ((t.counts?.pending || 0) + (t.counts?.accepted || 0) + (t.counts?.served || 0) > 0)).length;
  }, [tables]);

  const countAssistance = useMemo(() => {
    return openRequests.filter(r => r.type === 'ASSISTANCE').length;
  }, [openRequests]);

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

      // 2. Status Tab Filter (6 Cards matching media_1792817203178_71b41676)
      if (tableStatusFilter === 'pending') {
        return pendingRequests.some(r => r.table_id === table.table_id);
      }
      if (tableStatusFilter === 'checkout') {
        return table.hasCheckout || openRequests.some(r => r.table_id === table.table_id && r.type === 'CHECKOUT');
      }
      if (tableStatusFilter === 'serving') {
        const totalItems = (table.counts?.pending || 0) + (table.counts?.accepted || 0) + (table.counts?.served || 0);
        return table.active_session_id && totalItems > 0;
      }
      if (tableStatusFilter === 'assistance') {
        return table.hasAssistance || openRequests.some(r => r.table_id === table.table_id && r.type === 'ASSISTANCE');
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
      className={`staff-portal min-h-screen bg-[var(--brand-surface-soft)] flex flex-col lg:flex-row w-full text-[var(--brand-text)] transition-all ${
        staffDensity === 'compact' ? '' : 'density-comfortable'
      }`}
      style={staffThemeStyles}
    >
      {/* Desktop Left Sidebar (>= 1024px) */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200/90 shrink-0 sticky top-0 h-screen z-30 select-none overflow-y-auto">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--brand-accent)] text-[var(--brand-on-accent)] font-black flex items-center justify-center shrink-0 overflow-hidden shadow-xs text-base">
            {currentTenant?.logoUrl ? (
              <img src={currentTenant.logoUrl} alt={currentTenant.name} className="w-full h-full object-cover" />
            ) : (
              <span>{(currentTenant?.name || 'Q')[0].toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold text-sm text-slate-900 truncate leading-tight">
              {currentTenant?.name || 'Nhà Hàng'}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="capitalize text-[10px] px-1.5 py-0.2 rounded-md bg-[var(--brand-accent-tint)] text-[var(--brand-accent-dark)] font-bold border border-[var(--brand-line)]">
                {currentTenant?.role}
              </span>
            </div>
          </div>
        </div>

        {/* 4 Main Nav items */}
        <nav className="p-3 space-y-1.5 flex-1">
          {/* 1. Bàn */}
          <button
            type="button"
            onClick={() => setActiveTab('tables')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
              activeTab === 'tables'
                ? 'bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] font-extrabold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-[var(--brand-surface-soft)]'
            }`}
          >
            <LayoutGrid className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-left">Bàn</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
              {tables.length}
            </span>
          </button>

          {/* 2. Đơn món */}
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer relative ${
              activeTab === 'orders'
                ? 'bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] font-extrabold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-[var(--brand-surface-soft)]'
            }`}
          >
            <UtensilsCrossed className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-left">Đơn món</span>
            {pendingOrdersCount > 0 && (
              <span className="px-2 py-0.5 bg-amber-600 text-white rounded-full text-[10px] font-black animate-pulse">
                {pendingOrdersCount}
              </span>
            )}
          </button>

          {/* 3. Hỗ trợ */}
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer relative ${
              activeTab === 'requests'
                ? 'bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] font-extrabold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-[var(--brand-surface-soft)]'
            }`}
          >
            <Bell className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-left">Hỗ trợ</span>
            {openRequests.length > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            )}
          </button>

          {/* 4. Cài đặt */}
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
              ['settings', 'reports', 'menu', 'cms'].includes(activeTab)
                ? 'bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] font-extrabold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-[var(--brand-surface-soft)]'
            }`}
          >
            <Settings className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-left">Cài đặt</span>
          </button>
        </nav>

        {/* Sidebar Footer: User & Sound */}
        <div className="p-3 border-t border-slate-100 space-y-2 bg-slate-50/60">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 px-1">
            <span className="truncate">{user?.fullName}</span>
            <button
              onClick={cycleSoundMode}
              className="text-[11px] text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1 cursor-pointer"
              title="Chuyển chế độ âm thanh"
            >
              {soundMode === 'voice' && <Mic className="w-3.5 h-3.5 text-emerald-600" />}
              {soundMode === 'chime' && <Volume2 className="w-3.5 h-3.5 text-[var(--brand-accent-text)]" />}
              {soundMode === 'off' && <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
              <span className="capitalize">{soundMode}</span>
            </button>
          </div>
          <button
            onClick={logout}
            className="w-full py-2 px-3 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-600 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 w-full pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/90 text-slate-900 px-3 sm:px-5 py-2.5 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-[var(--brand-accent)] text-[var(--brand-on-accent)] font-black flex items-center justify-center shrink-0 overflow-hidden shadow-xs text-xs">
              {currentTenant?.logoUrl ? (
                <img src={currentTenant.logoUrl} alt={currentTenant.name} className="w-full h-full object-cover" />
              ) : (
                <span>{(currentTenant?.name || 'Q')[0].toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-extrabold text-xs sm:text-sm leading-tight text-slate-900 truncate">
                {currentTenant?.name || 'Nhà Hàng'}
              </h1>
              <div className="text-[10px] sm:text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                <span className="font-medium text-slate-700">{user?.fullName}</span>
                <span>•</span>
                <span className="capitalize font-bold text-[var(--brand-accent-text)]">{currentTenant?.role}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Audio Sound Mode Switcher (Voice -> Chime -> Off) */}
            <button
              onClick={cycleSoundMode}
              className={`w-9 h-9 rounded-xl transition flex items-center justify-center border text-xs font-bold shrink-0 cursor-pointer ${
                soundMode === 'voice'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                  : soundMode === 'chime'
                  ? 'text-[var(--brand-accent-dark)] bg-[var(--brand-accent-tint)] border-[var(--brand-line)] hover:bg-[var(--brand-accent-strong)]'
                  : 'text-slate-400 bg-slate-100 border-slate-200 hover:bg-slate-200'
              }`}
              title={`Chế độ âm thanh: ${soundMode === 'voice' ? 'Giọng nói tiếng Việt' : soundMode === 'chime' ? 'Chỉ chuông báo' : 'Đã tắt âm'}. Nhấn để chuyển đổi.`}
            >
              {soundMode === 'voice' && <Mic className="w-4 h-4 text-emerald-600 animate-pulse" />}
              {soundMode === 'chime' && <Volume2 className="w-4 h-4 text-[var(--brand-accent-text)]" />}
              {soundMode === 'off' && <VolumeX className="w-4 h-4 text-slate-400" />}
            </button>

            {/* Web Push Notification Settings Button */}
            <button
              onClick={() => setShowPushModal(true)}
              className={`w-9 h-9 rounded-xl transition flex items-center justify-center border text-xs font-bold relative shrink-0 cursor-pointer ${
                pushState === 'granted' && isPushSubscribed
                  ? 'text-[var(--brand-accent-dark)] bg-[var(--brand-accent-tint)] border-[var(--brand-line)] hover:bg-[var(--brand-accent-strong)]'
                  : pushState === 'key_mismatch' || pushState === 'ios_need_install'
                  ? 'text-amber-700 bg-amber-50 border-amber-300 hover:bg-amber-100 animate-pulse'
                  : pushState === 'http_insecure' || pushState === 'denied'
                  ? 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100'
                  : 'text-[var(--brand-muted)] bg-[var(--brand-surface-soft)] border-[var(--brand-line)] hover:bg-[var(--brand-accent-tint)]'
              }`}
              title={`Thông báo đẩy PWA: ${pushState === 'granted' && isPushSubscribed ? 'Đã bật' : pushState === 'server_disabled' ? 'Chưa bật trên máy chủ' : pushState === 'key_mismatch' ? 'Cần cập nhật khóa' : pushState === 'http_insecure' ? 'Cần HTTPS' : pushState === 'denied' ? 'Bị chặn' : pushState === 'ios_need_install' ? 'Cần cài Home Screen' : 'Chưa bật'}. Nhấn để quản lý.`}
            >
              <Radio className="w-4 h-4 text-[var(--brand-accent-text)]" />
              {pushState === 'granted' && isPushSubscribed && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white"></span>
              )}
            </button>

            {/* Quick Support Button */}
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`w-9 h-9 rounded-xl transition flex items-center justify-center border text-xs font-bold relative shrink-0 cursor-pointer ${
                activeTab === 'requests'
                  ? 'text-[var(--brand-accent-dark)] bg-[var(--brand-accent-tint)] border-[var(--brand-line)] shadow-2xs'
                  : 'text-slate-600 bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
              title="Yêu cầu hỗ trợ & thanh toán"
            >
              <Bell className="w-4 h-4 text-slate-700" />
              {openRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-amber-600 text-white rounded-full text-[9px] font-black animate-pulse shadow-xs">
                  {openRequests.length}
                </span>
              )}
            </button>

            {/* Logout Button */}
            <button
              onClick={logout}
              className="w-9 h-9 text-slate-500 hover:text-rose-600 rounded-xl bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 flex items-center justify-center transition shrink-0 cursor-pointer"
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
            className="bg-rose-50 border-b border-rose-200 text-rose-800 px-4 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer hover:bg-rose-100/70 transition"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>iPhone yêu cầu HTTPS để nhận chuông thông báo khi khóa máy</span>
            </div>
            <span className="text-[10px] text-rose-700 font-bold underline shrink-0">Xem cách mở</span>
          </div>
        )}

        {/* iOS Safari Home Screen notification prompt */}
        {pushState === 'ios_need_install' && (
          <div
            onClick={() => setShowPushModal(true)}
            className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition"
          >
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-amber-600 shrink-0" />
              <span>iPhone: Thêm vào Màn hình chính để nhận chuông khi khóa máy</span>
            </div>
            <span className="text-[10px] text-amber-700 font-bold underline shrink-0">Xem cách cài</span>
          </div>
        )}

        {/* Key mismatch notification prompt */}
        {pushState === 'key_mismatch' && (
          <div
            onClick={() => setShowPushModal(true)}
            className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition"
          >
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-600 shrink-0 animate-spin" />
              <span>Khóa thông báo máy chủ đã thay đổi: Nhấn để cập nhật lại</span>
            </div>
            <span className="text-[10px] text-amber-700 font-bold underline shrink-0">Cập nhật</span>
          </div>
        )}

        {/* Sync error notification prompt */}
        {pushState === 'sync_error' && (
          <div
            onClick={() => setShowPushModal(true)}
            className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Chưa đồng bộ thông báo với máy chủ: Nhấn để kết nối lại</span>
            </div>
            <span className="text-[10px] text-amber-700 font-bold underline shrink-0">Kết nối lại</span>
          </div>
        )}

        {/* Push notification prompt if not yet subscribed and server is available */}
        {(!isPushSubscribed && pushState !== 'server_disabled' && pushState !== 'key_mismatch' && pushState !== 'sync_error' && (pushState === 'default' || pushState === 'granted')) && (
          <div
            onClick={() => setShowPushModal(true)}
            className="bg-[var(--brand-accent)] text-[var(--brand-on-accent)] px-4 py-2.5 text-xs font-bold flex items-center justify-between cursor-pointer hover:opacity-95 transition shadow-xs"
          >
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 animate-bounce shrink-0 text-white" />
              <span>Nhấn để Bật Web Push (nhận chuông thông báo khi điện thoại tắt/khóa màn hình)</span>
            </div>
            <span className="bg-white text-[var(--brand-accent-text)] text-[10px] px-2.5 py-1 rounded-lg font-black uppercase tracking-wider shrink-0 shadow-xs">
              Bật ngay
            </span>
          </div>
        )}

        {/* Main Content (Mobile: full-bleed, Tablet: max-w-[900px], Desktop: max-w-[1200px]) */}
        <main className="p-3 sm:p-5 flex-1 w-full max-w-full md:max-w-[900px] lg:max-w-[1200px] mx-auto">
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
                    className="px-3 py-1.5 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] active:scale-95 text-[var(--brand-on-accent)] font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1 min-h-[38px] cursor-pointer"
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

            {/* Gaeru P1: Pending Table Open Requests */}
            {pendingRequests.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                    </span>
                    <h3 className="font-extrabold text-amber-950 text-xs uppercase tracking-wide">
                      Yêu cầu mở bàn chờ duyệt ({pendingRequests.length})
                    </h3>
                  </div>
                  <span className="text-[10px] text-amber-700 font-medium">Hết hạn sau 15 phút</span>
                </div>

                <div className="space-y-2">
                  {pendingRequests.map((req) => (
                    <div
                      key={req.session_id}
                      className="bg-white border border-amber-200/80 rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 text-sm">
                            Bàn {req.table_number || req.table_id}
                          </span>
                          {req.guest_name && (
                            <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                              {req.guest_name}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500">
                          Yêu cầu lúc {new Date(req.requested_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRejectRequest(req.table_id)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition min-h-[36px] cursor-pointer"
                        >
                          Từ chối
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveRequest(req.table_id)}
                          className="px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs transition min-h-[36px] cursor-pointer"
                        >
                          Duyệt mở
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                  className="w-full bg-white border border-slate-200/90 rounded-2xl pl-10 pr-9 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/30 focus:border-[var(--brand-accent)] shadow-xs"
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

              {/* 6 Large Stat Cards (Matching Image media_1792817203178_71b41676) */}
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {/* 1. Tất cả */}
                <button
                  type="button"
                  onClick={() => setTableStatusFilter('all')}
                  className={`p-3 sm:p-3.5 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                    tableStatusFilter === 'all'
                      ? 'bg-[var(--brand-accent)] text-white border-[var(--brand-accent)] shadow-sm'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Hiển thị tất cả bàn"
                >
                  <span className="text-xl sm:text-2xl font-bold leading-tight">
                    {tables.length}
                  </span>
                  <span className={`text-xs sm:text-sm font-medium mt-1 ${
                    tableStatusFilter === 'all' ? 'text-white' : 'text-slate-700'
                  }`}>
                    Tất cả
                  </span>
                </button>

                {/* 2. Chờ duyệt */}
                <button
                  type="button"
                  onClick={() => setTableStatusFilter(tableStatusFilter === 'pending' ? 'all' : 'pending')}
                  className={`p-3 sm:p-3.5 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                    tableStatusFilter === 'pending'
                      ? 'bg-[var(--brand-accent)] text-white border-[var(--brand-accent)] shadow-sm'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Lọc các bàn đang chờ duyệt mở bàn"
                >
                  <span className="text-xl sm:text-2xl font-bold leading-tight">
                    {countPending}
                  </span>
                  <span className={`text-xs sm:text-sm font-medium mt-1 ${
                    tableStatusFilter === 'pending' ? 'text-white' : 'text-slate-700'
                  }`}>
                    Chờ duyệt
                  </span>
                </button>

                {/* 3. Yêu cầu thanh toán */}
                <button
                  type="button"
                  onClick={() => setTableStatusFilter(tableStatusFilter === 'checkout' ? 'all' : 'checkout')}
                  className={`p-3 sm:p-3.5 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                    tableStatusFilter === 'checkout'
                      ? 'bg-[var(--brand-accent)] text-white border-[var(--brand-accent)] shadow-sm'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Lọc các bàn yêu cầu thanh toán"
                >
                  <span className="text-xl sm:text-2xl font-bold leading-tight">
                    {countCheckout}
                  </span>
                  <span className={`text-xs sm:text-sm font-medium mt-1 leading-tight ${
                    tableStatusFilter === 'checkout' ? 'text-white' : 'text-slate-700'
                  }`}>
                    Yêu cầu thanh toán
                  </span>
                </button>

                {/* 4. Đang phục vụ */}
                <button
                  type="button"
                  onClick={() => setTableStatusFilter(tableStatusFilter === 'serving' ? 'all' : 'serving')}
                  className={`p-3 sm:p-3.5 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                    tableStatusFilter === 'serving'
                      ? 'bg-[var(--brand-accent)] text-white border-[var(--brand-accent)] shadow-sm'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Lọc các bàn đang phục vụ món"
                >
                  <span className="text-xl sm:text-2xl font-bold leading-tight">
                    {countServing}
                  </span>
                  <span className={`text-xs sm:text-sm font-medium mt-1 ${
                    tableStatusFilter === 'serving' ? 'text-white' : 'text-slate-700'
                  }`}>
                    Đang phục vụ
                  </span>
                </button>

                {/* 5. Cần hỗ trợ */}
                <button
                  type="button"
                  onClick={() => setTableStatusFilter(tableStatusFilter === 'assistance' ? 'all' : 'assistance')}
                  className={`p-3 sm:p-3.5 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                    tableStatusFilter === 'assistance'
                      ? 'bg-[var(--brand-accent)] text-white border-[var(--brand-accent)] shadow-sm'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Lọc các bàn đang gọi nhân viên hỗ trợ"
                >
                  <span className="text-xl sm:text-2xl font-bold leading-tight">
                    {countAssistance}
                  </span>
                  <span className={`text-xs sm:text-sm font-medium mt-1 ${
                    tableStatusFilter === 'assistance' ? 'text-white' : 'text-slate-700'
                  }`}>
                    Cần hỗ trợ
                  </span>
                </button>

                {/* 6. Trống */}
                <button
                  type="button"
                  onClick={() => setTableStatusFilter(tableStatusFilter === 'empty' ? 'all' : 'empty')}
                  className={`p-3 sm:p-3.5 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                    tableStatusFilter === 'empty'
                      ? 'bg-[var(--brand-accent)] text-white border-[var(--brand-accent)] shadow-sm'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Lọc các bàn trống sẵn sàng đón khách"
                >
                  <span className="text-xl sm:text-2xl font-bold leading-tight">
                    {countEmpty}
                  </span>
                  <span className={`text-xs sm:text-sm font-medium mt-1 ${
                    tableStatusFilter === 'empty' ? 'text-white' : 'text-slate-700'
                  }`}>
                    Trống
                  </span>
                </button>
              </div>

              {/* Alert Chips for Attention States (Cần bill / Bàn 0đ) */}
              {(countCheckout > 0 || countZero > 0) && (
                <div className="flex items-center gap-2 pt-0.5 text-xs font-bold overflow-x-auto no-scrollbar">
                  {countCheckout > 0 && (
                    <button
                      type="button"
                      onClick={() => setTableStatusFilter(tableStatusFilter === 'checkout' ? 'all' : 'checkout')}
                      className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        tableStatusFilter === 'checkout'
                          ? 'bg-amber-500 text-white shadow-xs ring-2 ring-amber-400/40'
                          : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100/80 animate-pulse'
                      }`}
                      title="Lọc các bàn đang xin thanh toán"
                    >
                      <span>Cần bill</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full font-black bg-amber-600 text-white">
                        {countCheckout}
                      </span>
                    </button>
                  )}
                  {countZero > 0 && (
                    <button
                      type="button"
                      onClick={() => setTableStatusFilter(tableStatusFilter === 'zero' ? 'all' : 'zero')}
                      className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        tableStatusFilter === 'zero'
                          ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-500/30'
                          : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100/80'
                      }`}
                      title="Lọc các bàn mở nhầm chưa có món"
                    >
                      <span>Bàn 0đ</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full font-black bg-rose-600 text-white">
                        {countZero}
                      </span>
                    </button>
                  )}
                </div>
              )}
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
                    className="mt-2 px-3 py-1.5 bg-[var(--brand-accent-tint)] hover:bg-[var(--brand-accent-strong)] text-[var(--brand-accent-dark)] font-bold rounded-xl text-xs transition inline-flex items-center gap-1"
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
                              ? 'bg-[var(--brand-accent-tint)] text-[var(--brand-accent-dark)] border border-[var(--brand-line)]'
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
                            className="flex-1 py-1.5 px-2 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] active:scale-95 text-[var(--brand-on-accent)] font-bold text-xs rounded-xl shadow-xs transition min-h-[38px] flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
                            title="Mở phiên bàn"
                          >
                            <Plus className="w-3.5 h-3.5 shrink-0" />
                            <span>Mở bàn</span>
                          </button>
                        ) : isZeroOrder ? (
                          <button
                            onClick={() => handleQuickCloseWithoutCharge(table.active_session_id!)}
                            disabled={!hasPermission('session.close_without_charge')}
                            className="flex-1 py-1.5 px-2 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-bold text-xs rounded-xl border border-rose-300 transition min-h-[38px] flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
                            title="Tắt bàn mở nhầm"
                          >
                            <XCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                            <span>Tắt</span>
                          </button>
                        ) : hasCheckout ? (
                          <button
                            onClick={() => setSelectedTable(table)}
                            className="flex-1 py-1.5 px-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-black text-xs rounded-xl shadow-xs transition min-h-[38px] flex items-center justify-center gap-1 whitespace-nowrap animate-pulse cursor-pointer"
                            title="Khách yêu cầu thanh toán"
                          >
                            <CreditCard className="w-3.5 h-3.5 shrink-0" />
                            <span>Thanh toán</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedTable(table)}
                            className="flex-1 py-1.5 px-2 bg-[var(--brand-accent-strong)] hover:opacity-90 active:scale-95 text-[var(--brand-accent-dark)] font-bold text-xs rounded-xl transition min-h-[38px] flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
                            title="Xem chi tiết đơn"
                          >
                            <Receipt className="w-3.5 h-3.5 shrink-0" />
                            <span>Xem đơn ({totalItems})</span>
                          </button>
                        )}

                        <button
                          onClick={() => setSelectedQrTableId(table.table_id)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 rounded-xl hover:bg-[var(--brand-surface-soft)] min-h-[38px] min-w-[38px] shrink-0 flex items-center justify-center border border-slate-200 transition cursor-pointer"
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
                                    <span className="text-[11px] font-bold px-2 py-0.5 bg-[var(--brand-accent-tint)] text-[var(--brand-accent-dark)] rounded-md shrink-0">
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
                          className="font-bold text-[var(--brand-accent-text)] hover:underline flex items-center gap-1"
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
                            className="text-xs font-bold text-[var(--brand-accent-text)] hover:underline flex items-center gap-1 min-h-[36px]"
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
                            className="w-full py-2.5 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] text-[var(--brand-on-accent)] font-bold text-xs rounded-xl shadow-xs min-h-[44px] flex items-center justify-center gap-1.5"
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

        {/* TAB 4: Settings Hub (R3) */}
        {activeTab === 'settings' && (
          <div className="space-y-4 max-w-2xl mx-auto animate-fade-in">
            {/* Header */}
            <div>
              <h2 className="font-extrabold text-slate-900 text-lg">Cài đặt & Quản lý</h2>
              <p className="text-xs text-slate-500">Trung tâm quản lý, báo cáo và thiết lập hệ thống quán</p>
            </div>

            {/* Quick Summary Strip (strictly from existing tables state, zero new API requests) */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 p-3 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
              <div className="text-center p-2 rounded-xl bg-slate-50">
                <span className="text-lg sm:text-xl font-black text-slate-900 block leading-tight">{tables.length}</span>
                <span className="text-[10px] sm:text-xs text-slate-500 font-bold">Tổng số bàn</span>
              </div>
              <div className="text-center p-2 rounded-xl bg-blue-50/70">
                <span className="text-lg sm:text-xl font-black text-blue-700 block leading-tight">{countServing}</span>
                <span className="text-[10px] sm:text-xs text-blue-700 font-bold">Đang dùng</span>
              </div>
              <div className="text-center p-2 rounded-xl bg-emerald-50/70">
                <span className="text-lg sm:text-xl font-black text-emerald-700 block leading-tight">{countEmpty}</span>
                <span className="text-[10px] sm:text-xs text-emerald-700 font-bold">Bàn trống</span>
              </div>
            </div>

            {/* Gaeru Row-list of Features */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
              {/* Row 1: Báo cáo & Thống kê (report.view) */}
              {hasPermission('report.view') && (
                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-xs">
                      <BarChart2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm">Báo cáo</div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        Xem doanh thu, số lượt phục vụ và món bán chạy trong ca
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                </button>
              )}

              {/* Row 2: Quản lý thực đơn (menu.manage) */}
              {hasPermission('menu.manage') && (
                <button
                  type="button"
                  onClick={() => setActiveTab('menu')}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-xs">
                      <UtensilsCrossed className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm">Món</div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        Cập nhật danh mục món ăn, giá tiền và tình trạng món
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                </button>
              )}

              {/* Row 3: Khuyến mãi & Giảm giá (owner / manager) */}
              {['owner', 'manager'].includes(currentTenant?.role || '') && (
                <button
                  type="button"
                  onClick={() => {
                    setCmsSubTab('promotions');
                    setActiveTab('cms');
                  }}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-xs">
                      <Tag className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm">Khuyến mãi & Mã giảm giá</div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        Tạo và quản lý các chương trình ưu đãi, mã giảm giá cho khách
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                </button>
              )}

              {/* Row 4: Banner & Quảng cáo (owner / manager) */}
              {['owner', 'manager'].includes(currentTenant?.role || '') && (
                <button
                  type="button"
                  onClick={() => {
                    setCmsSubTab('banners');
                    setActiveTab('cms');
                  }}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-xs">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm">Banner & Hình ảnh quảng cáo</div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        Cập nhật hình ảnh banner quảng cáo trên trang thực đơn của khách
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                </button>
              )}

              {/* Row 5: Thiết lập quán & Giao diện (owner / manager) */}
              {['owner', 'manager'].includes(currentTenant?.role || '') && (
                <button
                  type="button"
                  onClick={() => {
                    setCmsSubTab('branding');
                    setActiveTab('cms');
                  }}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-xs">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm">Thiết lập quán & Giao diện</div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        Cấu hình thông tin quán, màu sắc theme và chế độ hiển thị
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                </button>
              )}

              {/* Row 6: Quản lý bàn (Thêm, Sửa, Xóa bàn) */}
              <button
                type="button"
                onClick={() => setShowTableManageModal(true)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition text-left cursor-pointer group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-xs">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">Quản lý bàn</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {tables.length} bàn
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      Thêm bàn mới, chỉnh sửa số bàn, sức chứa hoặc xóa bàn
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
              </button>

              {/* Row 7: Web Push Notification Settings */}
              <button
                type="button"
                onClick={() => setShowPushModal(true)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition text-left cursor-pointer group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-xs">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">Thông báo đẩy</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        pushState === 'granted' && isPushSubscribed
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {pushState === 'granted' && isPushSubscribed ? 'Đang bật' : 'Chưa bật'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      Cài đặt chuông báo và quyền nhận thông báo khi khóa máy
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
              </button>

              {/* Row 8: Âm thanh thông báo */}
              <button
                type="button"
                onClick={cycleSoundMode}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition text-left cursor-pointer group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-xs">
                    {soundMode === 'voice' && <Mic className="w-5 h-5" />}
                    {soundMode === 'chime' && <Volume2 className="w-5 h-5" />}
                    {soundMode === 'off' && <VolumeX className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">Âm thanh thông báo</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                        soundMode === 'voice'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : soundMode === 'chime'
                          ? 'bg-[var(--brand-accent-tint)] text-[var(--brand-accent-dark)] border border-[var(--brand-line)]'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {soundMode === 'voice' ? 'Giọng nói' : soundMode === 'chime' ? 'Chuông' : 'Tắt'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      Chuyển đổi giữa giọng đọc tiếng Việt, chuông báo hoặc tắt âm
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
              </button>

              {/* Row 9: Tài khoản & Phiên làm việc + Đổi tên + Đổi mật khẩu */}
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 shadow-xs">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{user?.fullName || 'Tài khoản'}</div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      {user?.email} • Vai trò: <span className="font-semibold capitalize text-slate-700">{currentTenant?.role}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleOpenProfileModal}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    title="Chỉnh sửa thông tin cá nhân"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Đổi tên</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChangePasswordModal(true)}
                    className="px-3 py-2 rounded-xl bg-[var(--brand-accent-tint)] hover:opacity-90 text-[var(--brand-accent-text)] text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    title="Đổi mật khẩu tài khoản"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Đổi mật khẩu</span>
                  </button>
                </div>
              </div>

              {/* Row 10: Nút đăng xuất nằm ở hàng riêng dưới cùng */}
              <div className="p-4 bg-slate-50/50">
                <button
                  type="button"
                  onClick={logout}
                  className="w-full py-3 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs active:scale-[0.99]"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Đăng xuất khỏi hệ thống</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-views with Back to Settings button (R3) & Touch Swipe Back Support */}
        {activeTab === 'reports' && (
          <div
            className="space-y-3"
            onTouchStart={handleSubViewTouchStart}
            onTouchEnd={handleSubViewTouchEnd}
          >
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-50 font-bold text-xs shadow-xs transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại Cài đặt</span>
            </button>
            <StaffReports />
          </div>
        )}

        {activeTab === 'menu' && (
          <div
            className="space-y-3"
            onTouchStart={handleSubViewTouchStart}
            onTouchEnd={handleSubViewTouchEnd}
          >
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-50 font-bold text-xs shadow-xs transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại Cài đặt</span>
            </button>
            <StaffMenuManage />
          </div>
        )}

        {activeTab === 'cms' && (
          <div
            className="space-y-3"
            onTouchStart={handleSubViewTouchStart}
            onTouchEnd={handleSubViewTouchEnd}
          >
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-50 font-bold text-xs shadow-xs transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại Cài đặt</span>
            </button>
            <StaffCmsManage initialSubTab={cmsSubTab} />
          </div>
        )}
      </main>
      </div>

      {/* Staff Bottom Navigation (< 1024px: Mobile & Tablet) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-2 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] w-full flex items-center justify-around shadow-lg">
        {/* 1. Bàn */}
        <button
          type="button"
          onClick={() => setActiveTab('tables')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition relative cursor-pointer ${
            activeTab === 'tables' ? 'text-[var(--brand-accent-text)] bg-[var(--brand-accent-tint)] font-extrabold shadow-2xs' : 'text-slate-500 font-medium'
          }`}
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] mt-1">Bàn</span>
          {pendingRequests.length > 0 && (
            <span className="absolute top-1.5 right-4 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[9px] font-black animate-pulse">
              {pendingRequests.length}
            </span>
          )}
        </button>

        {/* 2. Đơn món */}
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition relative cursor-pointer ${
            activeTab === 'orders' ? 'text-[var(--brand-accent-text)] bg-[var(--brand-accent-tint)] font-extrabold shadow-2xs' : 'text-slate-500 font-medium'
          }`}
        >
          <UtensilsCrossed className="w-5 h-5" />
          <span className="text-[10px] mt-1">Đơn món</span>
          {pendingOrdersCount > 0 && (
            <span className="absolute top-1.5 right-4 px-1.5 py-0.2 bg-amber-600 text-white rounded-full text-[9px] font-black animate-pulse">
              {pendingOrdersCount}
            </span>
          )}
        </button>

        {/* 3. Hỗ trợ */}
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition relative cursor-pointer ${
            activeTab === 'requests' ? 'text-[var(--brand-accent-text)] bg-[var(--brand-accent-tint)] font-extrabold shadow-2xs' : 'text-slate-500 font-medium'
          }`}
        >
          <Bell className="w-5 h-5" />
          <span className="text-[10px] mt-1">Hỗ trợ</span>
          {openRequests.length > 0 && (
            <span className="absolute top-1.5 right-4 px-1.5 py-0.2 bg-amber-600 text-white rounded-full text-[9px] font-black animate-pulse">
              {openRequests.length}
            </span>
          )}
        </button>

        {/* 4. Cài đặt */}
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition cursor-pointer ${
            ['settings', 'reports', 'menu', 'cms'].includes(activeTab)
              ? 'text-[var(--brand-accent-text)] bg-[var(--brand-accent-tint)] font-extrabold shadow-2xs'
              : 'text-slate-500 font-medium'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] mt-1">Cài đặt</span>
        </button>
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
                className="w-4 h-4 rounded text-[var(--brand-accent)] focus:ring-[var(--brand-accent)] mt-0.5"
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
                <Store className="w-5 h-5 text-[var(--brand-accent-text)]" />
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-[var(--brand-accent)] text-sm"
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-[var(--brand-accent)] text-sm"
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
                  className="flex-1 py-2.5 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] active:scale-95 text-[var(--brand-on-accent)] font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {isAddingTable ? 'Đang tạo...' : 'Tạo Bàn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Profile Modal (Đổi thông tin cá nhân & tên nhân viên) */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Thông tin cá nhân</h3>
                  <p className="text-[11px] text-slate-500">Tùy chỉnh tên hiển thị của tài khoản</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-4 space-y-3.5">
              {profileMsg && (
                <div className={`p-3 rounded-xl text-xs font-semibold ${
                  profileMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {profileMsg.text}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email đăng nhập
                </label>
                <input
                  type="text"
                  value={user?.email || ''}
                  disabled
                  className="w-full px-3 py-2 text-xs bg-slate-100 text-slate-500 rounded-xl border border-slate-200 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Vai trò tại quán
                </label>
                <input
                  type="text"
                  value={currentTenant?.role ? currentTenant.role.toUpperCase() : ''}
                  disabled
                  className="w-full px-3 py-2 text-xs bg-slate-100 text-slate-500 rounded-xl border border-slate-200 cursor-not-allowed"
                />
              </div>

              <div>
                <label htmlFor="staff-profile-name" className="block text-xs font-bold text-slate-700 mb-1">
                  Họ và tên nhân viên <span className="text-rose-500">*</span>
                </label>
                <input
                  id="staff-profile-name"
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Nhập họ và tên..."
                  maxLength={100}
                  required
                  disabled={isSavingProfile}
                  className="w-full px-3 py-2 text-sm bg-slate-50 hover:bg-white focus:bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)] transition"
                />
              </div>

              <div>
                <label htmlFor="staff-profile-phone" className="block text-xs font-bold text-slate-700 mb-1">
                  Số điện thoại liên hệ
                </label>
                <input
                  id="staff-profile-phone"
                  type="tel"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  placeholder="Ví dụ: 0912345678"
                  maxLength={20}
                  disabled={isSavingProfile}
                  className="w-full px-3 py-2 text-sm bg-slate-50 hover:bg-white focus:bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)] transition"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  disabled={isSavingProfile}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="flex-1 py-2.5 rounded-xl bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] text-[var(--brand-on-accent)] font-bold text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>Lưu thông tin</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Change Password Modal */}
      <StaffChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
      />

      {/* Table Manage Modal (Thêm, Sửa, Xóa bàn) */}
      <TableManageModal
        isOpen={showTableManageModal}
        onClose={() => setShowTableManageModal(false)}
        tables={tables}
        onRefresh={fetchDashboard}
      />
    </div>
  );
};
