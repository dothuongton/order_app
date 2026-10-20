import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { request, ApiError } from '../api/client.js';
import { Tenant, MenuItem, MenuCategory, CartItem, Order, BillSummary } from '../types/index.js';
import { useNotification } from './NotificationContext.js';

export interface GuestReceipt {
  qrId: string;
  sessionId: string;
  tableNumber: string;
  tableName?: string;
  settled: boolean;
  isClosed?: boolean;
  sessionStatus?: string;
  closeReason: string;
  totalAmount: number;
  confirmedAt?: string;
  billLines?: Array<{
    itemName: string;
    variantName?: string;
    quantityServed: number;
    unitPrice: number;
    subtotal: number;
  }>;
  appliedPromotions?: Array<{
    id: string;
    title: string;
    code?: string;
    discountAmount?: number;
  }>;
  message?: string;
}

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
  receipt: GuestReceipt | null;
  isLoading: boolean;
  isSessionClosed: boolean;
  isOnline: boolean;
  activeServiceRequests: any[];
  banners: any[];
  promotions: any[];
  loadTableMenu: (qrId: string) => Promise<any>;
  joinSession: (qrId: string) => Promise<any>;
  fetchReceipt: (token?: string) => Promise<GuestReceipt | null>;
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
  const [receipt, setReceipt] = useState<GuestReceipt | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSessionClosed, setIsSessionClosed] = useState<boolean>(false);
  const [activeServiceRequests, setActiveServiceRequests] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [guestToken, setGuestToken] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? sessionStorage.getItem('guest_token') : null;
  });

  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const pendingOrder = useRef<{ payload: string; key: string } | null>(null);
  const submittingOrder = useRef<Promise<any> | null>(null);

  const tableRef = useRef<any>(null);
  const publicQrIdRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const isSessionClosedRef = useRef<boolean>(false);
  const fetchSeqRef = useRef<number>(0);
  const inFlightRefreshRef = useRef<Promise<void> | null>(null);
  const inFlightMenuRef = useRef<{ qrId: string; promise: Promise<any> } | null>(null);
  const inFlightJoinRef = useRef<{ qrId: string; promise: Promise<any> } | null>(null);

  useEffect(() => { tableRef.current = table; }, [table]);
  useEffect(() => { publicQrIdRef.current = publicQrId; }, [publicQrId]);
  useEffect(() => { activeSessionIdRef.current = session?.id || null; }, [session?.id]);
  useEffect(() => { isSessionClosedRef.current = isSessionClosed; }, [isSessionClosed]);

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

  // Fetch verified receipt directly from backend
  const fetchReceipt = useCallback(async (token?: string): Promise<GuestReceipt | null> => {
    const t = token || sessionStorage.getItem('guest_token');
    if (!t) return null;
    try {
      const res = await request<GuestReceipt>('/guest/receipt', {
        headers: { 'x-guest-token': t }
      });
      return res;
    } catch {
      return null;
    }
  }, []);

  // Refresh orders & bill with single-flight and stale response protection
  const refreshOrdersAndBill = useCallback(async (): Promise<void> => {
    const token = sessionStorage.getItem('guest_token');
    if (!token) return;

    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }

    const promise = (async () => {
      const seq = ++fetchSeqRef.current;
      const currentQr = publicQrIdRef.current;

      try {
        if (!isSessionClosedRef.current) {
          try {
            const sessionData = await request<any>('/guest/session');
            if (fetchSeqRef.current === seq) {
              setActiveServiceRequests(sessionData.openRequests || []);
            }
          } catch {}
        } else {
          setActiveServiceRequests([]);
        }

        const [ordersData, billData] = await Promise.all([
          request<{ orders: Order[] }>('/guest/orders'),
          request<BillSummary>('/guest/bill-summary')
        ]);

        if (fetchSeqRef.current === seq && publicQrIdRef.current === currentQr) {
          setOrders(ordersData.orders || []);
          setBillSummary(billData);
        }
      } catch (err: any) {
        if (fetchSeqRef.current !== seq) return;

        if (err.code === 'SESSION_CLOSED' || err.code === 'ACCESS_REVOKED') {
          setIsSessionClosed(true);
          isSessionClosedRef.current = true;
          setActiveServiceRequests([]);
          setCart([]);

          if (currentQr) {
            try {
              const verified = await request<GuestReceipt>('/guest/receipt');
              if (verified && verified.isClosed && fetchSeqRef.current === seq) {
                setReceipt(verified);
                sessionStorage.setItem(getReceiptStorageKey(currentQr), JSON.stringify(verified));
              }
            } catch {}
            sessionStorage.removeItem(getAuthStorageKey(currentQr));
          }
          sessionStorage.removeItem('guest_token');
          setGuestToken(null);
        }
      } finally {
        inFlightRefreshRef.current = null;
      }
    })();

    inFlightRefreshRef.current = promise;
    return promise;
  }, []);

  // Load menu by QR id with session scoping and isolation
  const loadTableMenu = useCallback(async (qrId: string): Promise<any> => {
    publicQrIdRef.current = qrId;
    setPublicQrId(qrId);
    pendingOrder.current = null;

    if (inFlightMenuRef.current && inFlightMenuRef.current.qrId === qrId) {
      return inFlightMenuRef.current.promise;
    }

    const promise = (async () => {
      setIsLoading(true);
      const seq = ++fetchSeqRef.current;
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
        if (fetchSeqRef.current !== seq) return data;

        setTenant(data.tenant);
        setTable(data.table);
        setCategories(data.categories || []);
        setMenuItems(data.menuItems || []);
        setBanners(data.banners || []);
        setPromotions(data.promotions || []);

        if (data.session) {
          // Table has an active OPEN session
          if (fetchSeqRef.current === seq && publicQrIdRef.current === qrId) {
            setSession(data.session);
            activeSessionIdRef.current = data.session.id;
            setIsSessionClosed(false);
            isSessionClosedRef.current = false;
            setReceipt(null);
            sessionStorage.removeItem(getReceiptStorageKey(qrId));

            if (storedSession && storedSession.sessionId === data.session.id) {
              sessionStorage.setItem('guest_token', storedSession.token);
              setGuestToken(storedSession.token);
              try {
                const savedCart = sessionStorage.getItem(getCartStorageKey(qrId, data.session.id));
                if (savedCart) setCart(JSON.parse(savedCart));
              } catch {}
              if (socket) {
                socket.emit('join_session_room', { sessionId: data.session.id, token: storedSession.token });
              }
              await refreshOrdersAndBill();
            } else {
              // New guest or previous session from this device is outdated: clear old data
              sessionStorage.removeItem('guest_token');
              setGuestToken(null);
              sessionStorage.removeItem(scopedKey);
              setOrders([]);
              setBillSummary(null);
              setCart([]);
              setActiveServiceRequests([]);
            }
          }
        } else {
          // Table has NO active session (UNOPENED or CLOSED)
          let storedReceipt: GuestReceipt | null = null;
          try {
            const rawReceipt = sessionStorage.getItem(getReceiptStorageKey(qrId));
            if (rawReceipt) storedReceipt = JSON.parse(rawReceipt);
          } catch {}

          // R3: Missed socket/closed while offline or closed tab.
          // Before wiping auth, check if the server has a verified closed receipt for the old token!
          if (!storedReceipt && storedSession?.token) {
            try {
              const verified = await fetchReceipt(storedSession.token);
              if (verified && verified.isClosed && (verified.settled || verified.closeReason)) {
                storedReceipt = verified;
                sessionStorage.setItem(getReceiptStorageKey(qrId), JSON.stringify(verified));
              }
            } catch {}
          }

          if (fetchSeqRef.current === seq && publicQrIdRef.current === qrId) {
            if (storedReceipt && (storedReceipt.settled || storedReceipt.closeReason)) {
              setSession({ id: storedReceipt.sessionId, status: 'CLOSED' });
              activeSessionIdRef.current = storedReceipt.sessionId;
              setIsSessionClosed(true);
              isSessionClosedRef.current = true;
              setReceipt(storedReceipt);
              setOrders([]);
              setCart([]);
              setActiveServiceRequests([]);
              sessionStorage.removeItem('guest_token');
              setGuestToken(null);
              return data;
            }

            // Clean UNOPENED state for fresh scan without prior receipt
            setSession(null);
            activeSessionIdRef.current = null;
            setIsSessionClosed(false);
            isSessionClosedRef.current = false;
            setReceipt(null);
            setOrders([]);
            setBillSummary(null);
            setCart([]);
            setActiveServiceRequests([]);
            sessionStorage.removeItem('guest_token');
            setGuestToken(null);
            sessionStorage.removeItem(scopedKey);
            sessionStorage.removeItem(getReceiptStorageKey(qrId));
          }
        }

        return data;
      } finally {
        if (fetchSeqRef.current === seq) {
          setIsLoading(false);
        }
        inFlightMenuRef.current = null;
      }
    })();

    inFlightMenuRef.current = { qrId, promise };
    return promise;
  }, [refreshOrdersAndBill, fetchReceipt]);

  // Join table session with generation and QR scope protection (R2)
  const joinSession = useCallback(async (qrId: string): Promise<any> => {
    if (inFlightJoinRef.current && inFlightJoinRef.current.qrId === qrId) {
      return inFlightJoinRef.current.promise;
    }

    const promise = (async () => {
      setIsLoading(true);
      const seq = ++fetchSeqRef.current;
      try {
        const res = await request<any>(`/public/tables/${qrId}/join`, {
          method: 'POST',
          body: JSON.stringify({ deviceFingerprint: navigator.userAgent })
        });

        // R2 Guard: if QR changed or another request was initiated while waiting, discard!
        if (fetchSeqRef.current !== seq || publicQrIdRef.current !== qrId) {
          return res;
        }

        sessionStorage.setItem('guest_token', res.token);
        setGuestToken(res.token);
        const scopedKey = getAuthStorageKey(qrId);
        sessionStorage.setItem(scopedKey, JSON.stringify({
          qrId,
          sessionId: res.sessionId,
          token: res.token,
          isClosed: false
        }));
        setSession({ id: res.sessionId, status: 'OPEN' });
        activeSessionIdRef.current = res.sessionId;
        setIsSessionClosed(false);
        isSessionClosedRef.current = false;
        setReceipt(null);
        sessionStorage.removeItem(getReceiptStorageKey(qrId));

        try {
          const savedCart = sessionStorage.getItem(getCartStorageKey(qrId, res.sessionId));
          if (savedCart) setCart(JSON.parse(savedCart));
        } catch {}

        if (socket) {
          socket.emit('join_session_room', { sessionId: res.sessionId, token: res.token });
        }

        await refreshOrdersAndBill();
        return res;
      } catch (err: any) {
        if (fetchSeqRef.current === seq && publicQrIdRef.current === qrId) {
          if (err.code === 'SESSION_NOT_OPEN') {
            setSession(null);
            activeSessionIdRef.current = null;
            setIsSessionClosed(false);
            isSessionClosedRef.current = false;
          }
        }
        throw err;
      } finally {
        if (fetchSeqRef.current === seq && publicQrIdRef.current === qrId) {
          setIsLoading(false);
        }
        inFlightJoinRef.current = null;
      }
    })();

    inFlightJoinRef.current = { qrId, promise };
    return promise;
  }, [refreshOrdersAndBill, socket]);

  // Listen to socket session room events
  useEffect(() => {
    if (!socket || !session?.id || !guestToken) return;

    const currentSessionId = session.id;
    const currentToken = guestToken;

    const joinRoom = () => {
      socket.emit('join_session_room', { sessionId: currentSessionId, token: currentToken });
    };

    joinRoom();
    socket.on('connect', joinRoom);
    socket.on('reconnect', joinRoom);

    const handleSessionClosed = (payload?: any) => {
      setIsSessionClosed(true);
      isSessionClosedRef.current = true;
      setSession((prev: any) => prev ? { ...prev, status: 'CLOSED' } : { id: 'closed', status: 'CLOSED' });
      setActiveServiceRequests([]);
      setCart([]);

      const qrId = publicQrIdRef.current;
      const currentTable = tableRef.current;

      if (qrId) {
        try {
          sessionStorage.removeItem(getCartStorageKey(qrId, currentSessionId));
          sessionStorage.removeItem(getAuthStorageKey(qrId));

          const isSettled = payload?.reason === 'CONFIRMED_SETTLED';
          const verifiedReceipt: GuestReceipt = {
            qrId,
            sessionId: payload?.sessionId || currentSessionId || '',
            tableNumber: currentTable?.tableNumber || '',
            tableName: currentTable?.name,
            settled: isSettled,
            closeReason: payload?.reason || (isSettled ? 'CONFIRMED_SETTLED' : 'CLOSED_WITHOUT_CHARGE'),
            totalAmount: typeof payload?.settledAmount === 'number' ? payload.settledAmount : 0,
            confirmedAt: payload?.confirmedAt || new Date().toISOString(),
            billLines: Array.isArray(payload?.lines) ? payload.lines.map((l: any) => ({
              itemName: l.itemName || l.item_name,
              variantName: l.variantName || l.variant_name,
              quantityServed: l.quantityServed || l.quantity_served,
              unitPrice: Number(l.unitPrice || l.unit_price || 0),
              subtotal: Number(l.subtotal || 0)
            })) : [],
            message: payload?.message || (isSettled ? 'Hóa đơn đã được thanh toán. Cảm ơn quý khách!' : 'Phiên bàn đã kết thúc')
          };
          setReceipt(verifiedReceipt);
          sessionStorage.setItem(getReceiptStorageKey(qrId), JSON.stringify(verifiedReceipt));
        } catch {}
        sessionStorage.removeItem('guest_token');
        setGuestToken(null);
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

    return () => {
      socket.emit('leave_session_room');
      socket.off('connect', joinRoom);
      socket.off('reconnect', joinRoom);
      socket.off('session.closed', handleSessionClosed);
      socket.off('order.created', handleOrderUpdated);
      socket.off('order.updated', handleOrderUpdated);
      socket.off('service_request.created', handleServiceRequestUpdated);
      socket.off('service_request.updated', handleServiceRequestUpdated);
    };
  }, [socket, session?.id, guestToken, refreshOrdersAndBill, showToast]);

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
      receipt,
      isLoading,
      isSessionClosed,
      isOnline,
      activeServiceRequests,
      banners,
      promotions,
      loadTableMenu,
      joinSession,
      fetchReceipt,
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
