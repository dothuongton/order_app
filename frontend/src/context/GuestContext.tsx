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
  activeServiceRequests: any[];
  banners: any[];
  promotions: any[];
  loadTableMenu: (qrId: string) => Promise<void>;
  joinSession: (qrId: string) => Promise<void>;
  addToCart: (item: MenuItem, quantity?: number, note?: string, variant?: { id: string; name: string; price_adjustment: number }) => void;
  updateCartQuantity: (menuItemId: string, quantity: number, note?: string, variantId?: string) => void;
  removeFromCart: (menuItemId: string, note?: string, variantId?: string) => void;
  clearCart: () => void;
  submitOrder: () => Promise<any>;
  requestAssistance: (note?: string) => Promise<any>;
  requestCheckout: (note?: string) => Promise<any>;
  refreshOrdersAndBill: () => Promise<void>;
}

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

  const pendingOrder = useRef<{ payload: string; key: string } | null>(null);
  const submittingOrder = useRef<Promise<any> | null>(null);

  // Load menu by QR id
  const loadTableMenu = useCallback(async (qrId: string) => {
    setIsLoading(true);
    setPublicQrId(qrId);
    setOrders([]);
    setBillSummary(null);
    setCart([]);
    setActiveServiceRequests([]);
    pendingOrder.current = null;
    sessionStorage.removeItem('guest_token');
    try {
      const data = await request<any>(`/public/tables/${qrId}/menu`);
      setTenant(data.tenant);
      setTable(data.table);
      setSession(data.session);
      setCategories(data.categories || []);
      setMenuItems(data.menuItems || []);
      setBanners(data.banners || []);
      setPromotions(data.promotions || []);

      if (data.session) {
        setIsSessionClosed(false);
      } else {
        setIsSessionClosed(true);
        setActiveServiceRequests([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Join table session
  const joinSession = useCallback(async (qrId: string) => {
    setIsLoading(true);
    try {
      const res = await request<any>(`/public/tables/${qrId}/join`, {
        method: 'POST',
        body: JSON.stringify({ deviceFingerprint: navigator.userAgent })
      });
      sessionStorage.setItem('guest_token', res.token);
      setSession({ id: res.sessionId, status: 'OPEN' });
      setIsSessionClosed(false);
      await refreshOrdersAndBill();
    } catch (err: any) {
      if (err.code === 'SESSION_NOT_OPEN') {
        setSession(null);
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh orders & bill
  const refreshOrdersAndBill = useCallback(async () => {
    const token = sessionStorage.getItem('guest_token');
    if (!token) return;

    try {
      const sessionData = await request<any>('/guest/session');
      setActiveServiceRequests(sessionData.openRequests || []);

      const ordersData = await request<{ orders: Order[] }>('/guest/orders');
      setOrders(ordersData.orders || []);

      const billData = await request<BillSummary>('/guest/bill-summary');
      setBillSummary(billData);
    } catch (err: any) {
      if (err.code === 'SESSION_CLOSED' || err.code === 'ACCESS_REVOKED') {
        setIsSessionClosed(true);
        setActiveServiceRequests([]);
        sessionStorage.removeItem('guest_token');
        setCart([]);
      }
    }
  }, []);

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
      setSession(null);
      setActiveServiceRequests([]);
      sessionStorage.removeItem('guest_token');
      setCart([]);
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
    variant?: { id: string; name: string; price_adjustment: number }
  ) => {
    setCart(prev => {
      const itemPrice = Math.max(0, Number(item.price) + (variant?.price_adjustment ? Number(variant.price_adjustment) : 0));
      const idx = prev.findIndex(c =>
        c.menuItemId === item.id &&
        (c.note || '') === (note || '') &&
        (c.variantId || '') === (variant?.id || '')
      );
      if (idx > -1) {
        return prev.map((entry, index) => index === idx ? { ...entry, quantity: entry.quantity + quantity } : entry);
      }
      return [...prev, {
        menuItemId: item.id,
        variantId: variant?.id,
        variantName: variant?.name,
        name: item.name,
        price: itemPrice,
        quantity,
        note
      }];
    });
  };

  const updateCartQuantity = (menuItemId: string, quantity: number, note?: string, variantId?: string) => {
    if (quantity <= 0) {
      removeFromCart(menuItemId, note, variantId);
      return;
    }
    setCart(prev => prev.map(c =>
      c.menuItemId === menuItemId &&
      (c.note || '') === (note || '') &&
      (c.variantId || '') === (variantId || '')
        ? { ...c, quantity }
        : c
    ));
  };

  const removeFromCart = (menuItemId: string, note?: string, variantId?: string) => {
    setCart(prev => prev.filter(c =>
      !(c.menuItemId === menuItemId &&
        (c.note || '') === (note || '') &&
        (c.variantId || '') === (variantId || ''))
    ));
  };

  const clearCart = () => setCart([]);

  // Submit order with stable idempotency key
  const submitOrder = async () => {
    if (cart.length === 0) return;
    if (submittingOrder.current) return submittingOrder.current;
    const payload = JSON.stringify(cart.map(c => ({
      menuItemId: c.menuItemId,
      quantity: c.quantity,
      note: c.note,
      variantId: c.variantId
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
            variantId: c.variantId
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
