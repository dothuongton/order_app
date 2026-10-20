import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { request, ApiError } from '../api/client.js';
import { Tenant, MenuItem, MenuCategory, CartItem, Order, BillSummary } from '../types/index.js';
import { useNotification } from './NotificationContext.js';

interface GuestContextType {
  publicQrId: string | null;
  tenant: Tenant | null;
  table: { id: string; tableNumber: string; readiness: string; isEnabled: boolean } | null;
  session: { id: string; status: string; openedAt: string } | null;
  categories: MenuCategory[];
  menuItems: MenuItem[];
  cart: CartItem[];
  orders: Order[];
  billSummary: BillSummary | null;
  isLoading: boolean;
  isSessionClosed: boolean;
  isOnline: boolean;
  activeServiceRequests: any[];
  banners: any[];
  promotions: any[];
  loadTableMenu: (qrId: string) => Promise<void>;
  joinSession: (qrId: string) => Promise<void>;
  addToCart: (item: MenuItem, quantity?: number, note?: string, variant?: { id?: string; variantIds?: string[]; optionIds?: string[]; name: string; price_adjustment: number }) => void;
  updateCartQuantity: (menuItemId: string, quantity: number, note?: string, variantId?: string, variantName?: string, optionIds?: string[]) => void;
  removeFromCart: (menuItemId: string, note?: string, variantId?: string, variantName?: string, optionIds?: string[]) => void;
  clearCart: () => void;
  submitOrder: () => Promise<any>;
  requestAssistance: (note?: string) => Promise<any>;
  requestCheckout: (note?: string) => Promise<any>;
  refreshOrdersAndBill: () => Promise<void>;
}

interface ScopedGuestSession {
  qrId: string;
  sessionId: string;
  token: string;
  isClosed?: boolean;
}

const getAuthStorageKey = (qr: string) => `guest_auth_${qr}`;
const getCartStorageKey = (qr: string, sessId?: string | null) => `guest_cart_${qr}_${sessId || 'draft'}`;
const getReceiptStorageKey = (qr: string) => `guest_receipt_${qr}`;

const GuestContext = createContext<GuestContextType | null>(null);

export const GuestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket, playSuccessSound, showToast } = useNotification();
  const [publicQrId, setPublicQrId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [table, setTable] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [billSummary, setBillSummary] = useState<BillSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSessionClosed, setIsSessionClosed] = useState<boolean>(false);
  const [activeServiceRequests, setActiveServiceRequests] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);

  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const pendingOrder = useRef<{ payload: string; key: string } | null>(null);
  const submittingOrder = useRef<Promise<any> | null>(null);

  // Monitor network connectivity (Mất kết nối)
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Refresh orders & bill
  const refreshOrdersAndBill = useCallback(async () => {
    const token = sessionStorage.getItem('guest_token');
    if (!token) return;

    try {
      if (!isSessionClosed) {
        try {
          const sessionData = await request<any>('/guest/session');
          setActiveServiceRequests(sessionData.openRequests || []);
        } catch {}
      } else {
        setActiveServiceRequests([]);
      }

      const [ordersData, billData] = await Promise.all([
        request<{ orders: Order[] }>('/guest/orders'),
        request<BillSummary>('/guest/bill-summary')
      ]);

      setOrders(ordersData.orders || []);
      setBillSummary(billData);
    } catch (err: any) {
      if (err.code === 'SESSION_CLOSED' || err.code === 'ACCESS_REVOKED') {
        setIsSessionClosed(true);
        setActiveServiceRequests([]);
        setCart([]);
        if (publicQrId && billSummary) {
          try {
            sessionStorage.setItem(getReceiptStorageKey(publicQrId), JSON.stringify({
              qrId: publicQrId,
              sessionId: session?.id,
              billSummary: { ...billSummary, isClosed: true, sessionStatus: 'CLOSED' },
              orders,
              closedAt: new Date().toISOString()
            }));
          } catch {}
        }
        sessionStorage.removeItem('guest_token');
      }
    }
  }, [isSessionClosed, publicQrId, session?.id, billSummary, orders]);

  // Load menu by QR id with session scoping and isolation
  const loadTableMenu = useCallback(async (qrId: string) => {
    setIsLoading(true);
    setPublicQrId(qrId);
    pendingOrder.current = null;

    const scopedKey = getAuthStorageKey(qrId);
    let storedSession: ScopedGuestSession | null = null;
    try {
      const raw = sessionStorage.getItem(scopedKey);
      if (raw) storedSession = JSON.parse(raw);
    } catch {
      storedSession = null;
    }

    try {
      const data = await request<any>(`/public/tables/${qrId}/menu`);
      setTenant(data.tenant);
      setTable(data.table);
      setCategories(data.categories || []);
      setMenuItems(data.menuItems || []);
      setBanners(data.banners || []);
      setPromotions(data.promotions || []);

      if (data.session) {
        // Table has an active OPEN session
        setSession(data.session);
        setIsSessionClosed(false);
        // Clear old receipt snapshot from a past session on this table
        sessionStorage.removeItem(getReceiptStorageKey(qrId));

        // Check if current browser already has credentials matching this exact active session
        if (storedSession && storedSession.sessionId === data.session.id) {
          sessionStorage.setItem('guest_token', storedSession.token);
          try {
            const savedCart = sessionStorage.getItem(getCartStorageKey(qrId, data.session.id));
            if (savedCart) setCart(JSON.parse(savedCart));
          } catch {}
          await refreshOrdersAndBill();
        } else {
          // New guest or previous session from this device is outdated: clear old data
          sessionStorage.removeItem('guest_token');
          sessionStorage.removeItem(scopedKey);
          setOrders([]);
          setBillSummary(null);
          setCart([]);
          setActiveServiceRequests([]);
        }
      } else {
        // Table has NO active session (UNOPENED or CLOSED)
        // Check if this browser has a stored receipt snapshot for this table
        let storedReceipt: any = null;
        try {
          const rawReceipt = sessionStorage.getItem(getReceiptStorageKey(qrId));
          if (rawReceipt) storedReceipt = JSON.parse(rawReceipt);
        } catch {}

        if (storedReceipt && storedReceipt.billSummary) {
          // This guest just completed dining on this table -> show their closed receipt
          setSession({ id: storedReceipt.sessionId, status: 'CLOSED' });
          setIsSessionClosed(true);
          setBillSummary(storedReceipt.billSummary);
          setOrders(storedReceipt.orders || []);
          setCart([]);
          setActiveServiceRequests([]);
          sessionStorage.removeItem('guest_token');
          return;
        }

        // Clean UNOPENED state for fresh scan without prior receipt
        setSession(null);
        setIsSessionClosed(false);
        setOrders([]);
        setBillSummary(null);
        setCart([]);
        setActiveServiceRequests([]);
        sessionStorage.removeItem('guest_token');
        sessionStorage.removeItem(scopedKey);
        sessionStorage.removeItem(getReceiptStorageKey(qrId));
      }
    } finally {
      setIsLoading(false);
    }
  }, [refreshOrdersAndBill]);

  // Join table session
  const joinSession = useCallback(async (qrId: string) => {
    setIsLoading(true);
    try {
      const res = await request<any>(`/public/tables/${qrId}/join`, {
        method: 'POST',
        body: JSON.stringify({ deviceFingerprint: navigator.userAgent })
      });
      sessionStorage.setItem('guest_token', res.token);
      const scopedKey = getAuthStorageKey(qrId);
      sessionStorage.setItem(scopedKey, JSON.stringify({
        qrId,
        sessionId: res.sessionId,
        token: res.token,
        isClosed: false
      }));
      setSession({ id: res.sessionId, status: 'OPEN' });
      setIsSessionClosed(false);
      try {
        const savedCart = sessionStorage.getItem(getCartStorageKey(qrId, res.sessionId));
        if (savedCart) setCart(JSON.parse(savedCart));
      } catch {}
      await refreshOrdersAndBill();
    } catch (err: any) {
      if (err.code === 'SESSION_NOT_OPEN') {
        setSession(null);
        setIsSessionClosed(false);
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [refreshOrdersAndBill]);

  // Listen to socket session room events
  useEffect(() => {
    if (!socket || !session?.id) return;

    const joinRoom = () => {
      socket.emit('join_session_room', { sessionId: session.id, token: sessionStorage.getItem('guest_token') });
    };

    joinRoom();
    socket.on('connect', joinRoom);
    socket.on('reconnect', joinRoom);

    const handleSessionClosed = (payload?: any) => {
      setIsSessionClosed(true);
      setSession((prev: any) => prev ? { ...prev, status: 'CLOSED' } : { id: 'closed', status: 'CLOSED' });
      setActiveServiceRequests([]);
      setCart([]);
      if (publicQrId) {
        try {
          if (session?.id) sessionStorage.removeItem(getCartStorageKey(publicQrId, session.id));
          sessionStorage.removeItem(getAuthStorageKey(publicQrId));
          sessionStorage.removeItem('guest_token');
          if (billSummary) {
            sessionStorage.setItem(getReceiptStorageKey(publicQrId), JSON.stringify({
              qrId: publicQrId,
              sessionId: session?.id,
              billSummary: { ...billSummary, isClosed: true, sessionStatus: 'CLOSED' },
              orders,
              closedAt: new Date().toISOString()
            }));
          }
        } catch {}
      }
      showToast({
        title: 'Phiên bàn đã kết thúc',
        message: payload?.message || 'Hóa đơn đã được thanh toán. Cảm ơn quý khách!',
        type: 'success',
        duration: 7000
      });
    };

    const handleOrderUpdated = (payload?: any) => {
      refreshOrdersAndBill();
      if (payload?.message) {
        showToast({
          title: payload.type === 'CANCELLED' ? 'Món ăn bị hủy' : (payload.type === 'SERVED' ? 'Món ăn đã phục vụ' : 'Cập nhật món ăn'),
          message: payload.message,
          type: payload.type === 'CANCELLED' ? 'warning' : 'success',
          duration: 5000
        });
      }
    };

    const handleServiceRequestUpdated = (payload?: any) => {
      refreshOrdersAndBill();
      if (payload?.message) {
        showToast({
          title: 'Yêu cầu phục vụ',
          message: payload.message,
          type: 'info',
          duration: 4000
        });
      }
    };

    socket.on('session.closed', handleSessionClosed);
    socket.on('order.created', handleOrderUpdated);
    socket.on('order.updated', handleOrderUpdated);
    socket.on('service_request.created', handleServiceRequestUpdated);
    socket.on('service_request.updated', handleServiceRequestUpdated);

    // Fast polling backup (3s) to ensure real-time responsiveness even if websocket reconnects
    const interval = setInterval(() => {
      if (!isSessionClosed) {
        refreshOrdersAndBill();
      }
    }, 3000);

    return () => {
      socket.emit('leave_session_room');
      socket.off('connect', joinRoom);
      socket.off('reconnect', joinRoom);
      socket.off('session.closed', handleSessionClosed);
      socket.off('order.created', handleOrderUpdated);
      socket.off('order.updated', handleOrderUpdated);
      socket.off('service_request.created', handleServiceRequestUpdated);
      socket.off('service_request.updated', handleServiceRequestUpdated);
      clearInterval(interval);
    };
  }, [socket, session?.id, isSessionClosed, refreshOrdersAndBill]);

  // Cart operations
  const addToCart = (
    item: MenuItem,
    quantity: number = 1,
    note?: string,
    variant?: { id?: string; variantIds?: string[]; optionIds?: string[]; name: string; price_adjustment: number }
  ) => {
    setCart(prev => {
      const itemPrice = Math.max(0, Number(item.price) + (variant?.price_adjustment ? Number(variant.price_adjustment) : 0));
      const optKey = (variant?.optionIds || variant?.variantIds || []).slice().sort().join(',');
      const idx = prev.findIndex(c =>
        c.menuItemId === item.id &&
        (c.note || '') === (note || '') &&
        (c.variantName || '') === (variant?.name || '') &&
        ((c.optionIds || c.variantIds || []).slice().sort().join(',')) === optKey
      );
      if (idx > -1) {
        return prev.map((entry, index) => index === idx ? { ...entry, quantity: entry.quantity + quantity } : entry);
      }
      return [...prev, {
        menuItemId: item.id,
        variantId: variant?.id,
        variantIds: variant?.variantIds,
        optionIds: variant?.optionIds,
        variantName: variant?.name,
        name: item.name,
        price: itemPrice,
        quantity,
        note
      }];
    });
  };

  const updateCartQuantity = (menuItemId: string, quantity: number, note?: string, variantId?: string, variantName?: string, optionIds?: string[]) => {
    if (quantity <= 0) {
      removeFromCart(menuItemId, note, variantId, variantName, optionIds);
      return;
    }
    const optKey = optionIds ? optionIds.slice().sort().join(',') : null;
    setCart(prev => prev.map(c => {
      const matchesBase = c.menuItemId === menuItemId && (c.note || '') === (note || '');
      const matchesVariant = variantName !== undefined ? (c.variantName || '') === (variantName || '') : (c.variantId || '') === (variantId || '');
      const matchesOptions = optKey !== null ? ((c.optionIds || c.variantIds || []).slice().sort().join(',')) === optKey : true;
      return matchesBase && matchesVariant && matchesOptions ? { ...c, quantity } : c;
    }));
  };

  const removeFromCart = (menuItemId: string, note?: string, variantId?: string, variantName?: string, optionIds?: string[]) => {
    const optKey = optionIds ? optionIds.slice().sort().join(',') : null;
    setCart(prev => prev.filter(c => {
      const matchesBase = c.menuItemId === menuItemId && (c.note || '') === (note || '');
      const matchesVariant = variantName !== undefined ? (c.variantName || '') === (variantName || '') : (c.variantId || '') === (variantId || '');
      const matchesOptions = optKey !== null ? ((c.optionIds || c.variantIds || []).slice().sort().join(',')) === optKey : true;
      return !(matchesBase && matchesVariant && matchesOptions);
    }));
  };

  // Persist cart scoped to table and session
  useEffect(() => {
    if (!publicQrId || !session?.id || isSessionClosed) return;
    try {
      if (cart.length > 0) {
        sessionStorage.setItem(getCartStorageKey(publicQrId, session.id), JSON.stringify(cart));
      } else {
        sessionStorage.removeItem(getCartStorageKey(publicQrId, session.id));
      }
    } catch {}
  }, [cart, publicQrId, session?.id, isSessionClosed]);

  const clearCart = () => {
    setCart([]);
    if (publicQrId && session?.id) {
      sessionStorage.removeItem(getCartStorageKey(publicQrId, session.id));
    }
  };

  // Submit order with stable idempotency key
  const submitOrder = async () => {
    if (cart.length === 0) return;
    if (submittingOrder.current) return submittingOrder.current;
    const payload = JSON.stringify(cart.map(c => ({
      menuItemId: c.menuItemId,
      quantity: c.quantity,
      note: c.note,
      variantId: c.variantId,
      variantIds: c.variantIds,
      optionIds: c.optionIds
    })));
    if (pendingOrder.current?.payload !== payload) pendingOrder.current = { payload, key: crypto.randomUUID() };
    const idempotencyKey = pendingOrder.current.key;
    const operation = (async () => {

    try {
      const res = await request<any>('/guest/orders', {
        method: 'POST',
        headers: { 'x-idempotency-key': idempotencyKey },
        body: JSON.stringify({
          idempotencyKey,
          items: cart.map(c => ({
            menuItemId: c.menuItemId,
            quantity: c.quantity,
            note: c.note,
            variantId: c.variantId,
            variantIds: c.variantIds,
            optionIds: c.optionIds
          }))
        })
      });

      pendingOrder.current = null;
      playSuccessSound();
      const itemCount = cart.reduce((s, c) => s + c.quantity, 0);
      showToast({
        title: 'Đặt món thành công!',
        message: `Đã gửi ${itemCount} món đến nhân viên quán.`,
        type: 'success',
        duration: 4500
      });
      clearCart();
      await refreshOrdersAndBill();
      return res;
    } catch (err: any) {
      throw err;
    }
    })();
    submittingOrder.current = operation;
    try { return await operation; } finally { submittingOrder.current = null; }
  };

  const requestAssistance = async (note?: string) => {
    const res = await request<any>('/guest/service-requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'ASSISTANCE', note })
    });
    showToast({
      title: 'Đã gọi nhân viên',
      message: res?.message || 'Nhân viên phục vụ sẽ đến bàn bạn ngay lập tức.',
      type: 'info',
      duration: 4000
    });
    await refreshOrdersAndBill();
    return res;
  };

  const requestCheckout = async (note?: string) => {
    const res = await request<any>('/guest/service-requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'CHECKOUT', note })
    });
    showToast({
      title: 'Đã gửi yêu cầu thanh toán',
      message: res?.message || 'Nhân viên sẽ mang hóa đơn đến bàn bạn trong giây lát.',
      type: 'info',
      duration: 5000
    });
    await refreshOrdersAndBill();
    return res;
  };

  return (
    <GuestContext.Provider value={{
      publicQrId,
      tenant,
      table,
      session,
      categories,
      menuItems,
      cart,
      orders,
      billSummary,
      isLoading,
      isSessionClosed,
      isOnline,
      activeServiceRequests,
      banners,
      promotions,
      loadTableMenu,
      joinSession,
      addToCart,
      updateCartQuantity,
      removeFromCart,
      clearCart,
      submitOrder,
      requestAssistance,
      requestCheckout,
      refreshOrdersAndBill
    }}>
      {children}
    </GuestContext.Provider>
  );
};

export const useGuest = () => {
  const context = useContext(GuestContext);
  if (!context) throw new Error('useGuest must be used within GuestProvider');
  return context;
};
