import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  loadTableMenu: (qrId: string) => Promise<void>;
  joinSession: (qrId: string) => Promise<void>;
  addToCart: (item: MenuItem, quantity?: number, note?: string) => void;
  updateCartQuantity: (menuItemId: string, quantity: number) => void;
  removeFromCart: (menuItemId: string) => void;
  clearCart: () => void;
  submitOrder: () => Promise<any>;
  requestAssistance: (note?: string) => Promise<any>;
  requestCheckout: (note?: string) => Promise<any>;
  refreshOrdersAndBill: () => Promise<void>;
}

const GuestContext = createContext<GuestContextType | null>(null);

export const GuestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket, playOrderSound } = useNotification();
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

  // Load menu by QR id
  const loadTableMenu = useCallback(async (qrId: string) => {
    setIsLoading(true);
    setPublicQrId(qrId);
    try {
      const data = await request<any>(`/public/tables/${qrId}/menu`);
      setTenant(data.tenant);
      setTable(data.table);
      setSession(data.session);
      setCategories(data.categories || []);
      setMenuItems(data.menuItems || []);

      if (data.session) {
        setIsSessionClosed(false);
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
      localStorage.setItem('guest_token', res.token);
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
    const token = localStorage.getItem('guest_token');
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
        localStorage.removeItem('guest_token');
        setCart([]);
      }
    }
  }, []);

  // Listen to socket session room events
  useEffect(() => {
    if (!socket || !session?.id) return;

    socket.emit('join_session_room', session.id);

    const handleSessionClosed = () => {
      setIsSessionClosed(true);
      localStorage.removeItem('guest_token');
      setCart([]);
    };

    const handleOrderUpdated = () => {
      refreshOrdersAndBill();
    };

    const handleServiceRequestUpdated = () => {
      refreshOrdersAndBill();
    };

    socket.on('session.closed', handleSessionClosed);
    socket.on('order.created', handleOrderUpdated);
    socket.on('order.updated', handleOrderUpdated);
    socket.on('service_request.created', handleServiceRequestUpdated);
    socket.on('service_request.updated', handleServiceRequestUpdated);

    // Polling backup every 8s as recommended in spec section 12.1
    const interval = setInterval(() => {
      if (!isSessionClosed) {
        refreshOrdersAndBill();
      }
    }, 8000);

    return () => {
      socket.off('session.closed', handleSessionClosed);
      socket.off('order.created', handleOrderUpdated);
      socket.off('order.updated', handleOrderUpdated);
      socket.off('service_request.created', handleServiceRequestUpdated);
      socket.off('service_request.updated', handleServiceRequestUpdated);
      clearInterval(interval);
    };
  }, [socket, session?.id, isSessionClosed, refreshOrdersAndBill]);

  // Cart operations
  const addToCart = (item: MenuItem, quantity: number = 1, note?: string) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.menuItemId === item.id && (c.note || '') === (note || ''));
      if (idx > -1) {
        const next = [...prev];
        next[idx].quantity += quantity;
        return next;
      }
      return [...prev, {
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        quantity,
        note
      }];
    });
  };

  const updateCartQuantity = (menuItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(menuItemId);
      return;
    }
    setCart(prev => prev.map(c => c.menuItemId === menuItemId ? { ...c, quantity } : c));
  };

  const removeFromCart = (menuItemId: string) => {
    setCart(prev => prev.filter(c => c.menuItemId !== menuItemId));
  };

  const clearCart = () => setCart([]);

  // Submit order with stable idempotency key
  const submitOrder = async () => {
    if (cart.length === 0) return;
    const idempotencyKey = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await request<any>('/guest/orders', {
        method: 'POST',
        headers: { 'x-idempotency-key': idempotencyKey },
        body: JSON.stringify({
          idempotencyKey,
          items: cart.map(c => ({
            menuItemId: c.menuItemId,
            quantity: c.quantity,
            note: c.note
          }))
        })
      });

      playOrderSound();
      clearCart();
      await refreshOrdersAndBill();
      return res;
    } catch (err: any) {
      throw err;
    }
  };

  const requestAssistance = async (note?: string) => {
    const res = await request<any>('/guest/service-requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'ASSISTANCE', note })
    });
    await refreshOrdersAndBill();
    return res;
  };

  const requestCheckout = async (note?: string) => {
    const res = await request<any>('/guest/service-requests', {
      method: 'POST',
      body: JSON.stringify({ type: 'CHECKOUT', note })
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
