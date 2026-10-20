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
  orderingMode: 'multi_device' | 'approved_single_device';
  tableStatus: 'VACANT' | 'PENDING' | 'OCCUPIED';
  deviceState: 'IDLE' | 'REQUESTER' | 'CLAIMED' | 'VIEWER';
  pendingRequest: {
    requestId: string;
    guestName: string;
    requestedAt?: string;
    expiresAt?: string;
    remainingSeconds?: number;
    canWithdraw?: boolean;
  } | null;
  canOrder: boolean;
  canRequest: boolean;
  requestOpenTable: (guestName: string) => Promise<any>;
  withdrawOpenRequest: () => Promise<any>;
  loadTableMenu: (qrId: string) => Promise<any>;
  joinSession: (qrId: string) => Promise<any>;
  fetchReceipt: (token?: string) => Promise<GuestReceipt | null>;
  addToCart: (item: MenuItem, quantity?: number, note?: string, variant?: { id?: string; variantIds?: string[]; optionIds?: string[]; name?: string; price_adjustment?: number }) => void;
  updateCartQuantity: (menuItemId: string, quantity: number, note?: string, variantId?: string, variantName?: string, optionIds?: string[], variantIds?: string[]) => void;
  removeFromCart: (menuItemId: string, note?: string, variantId?: string, variantName?: string, optionIds?: string[], variantIds?: string[]) => void;
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

export const getCartItemKey = (item: {
  menuItemId: string;
  note?: string;
  variantName?: string;
  variantId?: string;
  variantIds?: string[];
  optionIds?: string[];
}) => {
  const optPart = (item.optionIds || item.variantIds || (item.variantId ? [item.variantId] : [])).slice().sort().join(',');
  return `${item.menuItemId}::${optPart}::${item.variantName || ''}::${item.note || ''}`;
};

export const canonicalizeCartItem = (raw: any): CartItem => {
  const quantity = Math.max(1, Number(raw.quantity) || 1);
  const price = Math.max(0, Number(raw.price) || 0);
  const note = typeof raw.note === 'string' && raw.note.trim().length > 0 ? raw.note.trim() : undefined;
  const name = raw.name || '';
  const variantName = raw.variantName || undefined;

  // Modern options take precedence -> optionIds only
  if (Array.isArray(raw.optionIds) && raw.optionIds.length > 0) {
    const uniqueOptions = Array.from(new Set(raw.optionIds.filter(Boolean) as string[]));
    return {
      menuItemId: raw.menuItemId,
      optionIds: uniqueOptions,
      variantName,
      name,
      price,
      quantity,
      note
    };
  }

  // Legacy multi-variants -> variantIds only
  if (Array.isArray(raw.variantIds) && raw.variantIds.length > 0) {
    const uniqueVariants = Array.from(new Set(raw.variantIds.filter(Boolean) as string[]));
    return {
      menuItemId: raw.menuItemId,
      variantIds: uniqueVariants,
      variantName,
      name,
      price,
      quantity,
      note
    };
  }

  // Legacy single variant -> variantId only
  if (raw.variantId) {
    return {
      menuItemId: raw.menuItemId,
      variantId: raw.variantId,
      variantName,
      name,
      price,
      quantity,
      note
    };
  }

  return {
    menuItemId: raw.menuItemId,
    variantName,
    name,
    price,
    quantity,
    note
  };
};

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
  const [orderingMode, setOrderingMode] = useState<'multi_device' | 'approved_single_device'>('multi_device');
  const [tableStatus, setTableStatus] = useState<'VACANT' | 'PENDING' | 'OCCUPIED'>('VACANT');
  const [deviceState, setDeviceState] = useState<'IDLE' | 'REQUESTER' | 'CLAIMED' | 'VIEWER'>('IDLE');
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  const [canOrder, setCanOrder] = useState<boolean>(true);
  const [canRequest, setCanRequest] = useState<boolean>(false);
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

  // Fetch verified receipt directly from backend with detailed status
  const fetchReceiptInternal = useCallback(async (token?: string, scopedQr?: string): Promise<{ receipt?: GuestReceipt; error?: string; status?: number; isRetryable?: boolean } | null> => {
    const t = token || sessionStorage.getItem('guest_token');
    if (!t) return null;
    const qrParam = scopedQr ? `?qrId=${scopedQr}` : '';
    try {
      const res = await request<GuestReceipt>(`/guest/receipt${qrParam}`, {
        headers: { 'x-guest-token': t }
      });
      return { receipt: res };
    } catch (err: any) {
      const status = typeof err.status === 'number' ? err.status : 0;
      const isRetryable = status === 0 || status >= 500;
      return { error: err.code || 'API_ERROR', status, isRetryable };
    }
  }, []);

  const fetchReceipt = useCallback(async (token?: string): Promise<GuestReceipt | null> => {
    const res = await fetchReceiptInternal(token);
    return res?.receipt || null;
  }, [fetchReceiptInternal]);

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
              const res = await fetchReceiptInternal(token, currentQr);
              if (res?.receipt && res.receipt.isClosed && fetchSeqRef.current === seq) {
                setReceipt(res.receipt);
                sessionStorage.setItem(getReceiptStorageKey(currentQr), JSON.stringify(res.receipt));
                sessionStorage.removeItem(getAuthStorageKey(currentQr));
              } else if (res && !res.isRetryable) {
                sessionStorage.removeItem(getAuthStorageKey(currentQr));
              }
            } catch {}
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
        if (data.table) {
          if (data.table.ordering_mode || data.table.orderingMode) {
            setOrderingMode(data.table.ordering_mode || data.table.orderingMode);
          }
          if (data.table.table_status || data.table.tableStatus) {
            setTableStatus(data.table.table_status || data.table.tableStatus);
          }
          if (data.table.device_state || data.table.deviceState) {
            setDeviceState(data.table.device_state || data.table.deviceState);
          }
          setPendingRequest(data.table.request || null);
          setCanOrder(Boolean(data.table.can_order ?? data.table.canOrder ?? true));
          setCanRequest(Boolean(data.table.can_request ?? data.table.canRequest ?? false));
        }
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
                if (savedCart) {
                  const parsed = JSON.parse(savedCart);
                  if (Array.isArray(parsed)) setCart(parsed.map(canonicalizeCartItem));
                }
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
          let recoveryRetryable = false;
          if (!storedReceipt && storedSession?.token) {
            try {
              const recovery = await fetchReceiptInternal(storedSession.token, qrId);
              if (recovery?.receipt && recovery.receipt.isClosed && (recovery.receipt.settled || recovery.receipt.closeReason)) {
                storedReceipt = recovery.receipt;
                sessionStorage.setItem(getReceiptStorageKey(qrId), JSON.stringify(recovery.receipt));
                sessionStorage.removeItem(scopedKey);
              } else if (recovery?.isRetryable) {
                recoveryRetryable = true;
              }
            } catch {
              recoveryRetryable = true;
            }
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

            if (recoveryRetryable) {
              // Network error or 5xx while attempting recovery.
              // Preserve scoped auth so guest can retry/recover once connection is restored.
              setSession(storedSession ? { id: storedSession.sessionId, status: 'CLOSED' } : null);
              activeSessionIdRef.current = storedSession?.sessionId || null;
              setIsSessionClosed(true);
              isSessionClosedRef.current = true;
              setReceipt(null);
              setOrders([]);
              setCart([]);
              setActiveServiceRequests([]);
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
  }, [refreshOrdersAndBill, fetchReceiptInternal]);

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
          if (savedCart) {
            const parsed = JSON.parse(savedCart);
            if (Array.isArray(parsed)) setCart(parsed.map(canonicalizeCartItem));
          }
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

  // Request table open (Gaeru P1)
  const requestOpenTable = useCallback(async (guestName: string): Promise<any> => {
    if (!publicQrIdRef.current) throw new Error('Không có mã QR bàn');
    const requestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ('req-' + Math.random().toString(36).substring(2, 11));
    const res = await request<any>(`/public/tables/${publicQrIdRef.current}/request-open`, {
      method: 'POST',
      body: JSON.stringify({ requestId, guestName })
    });
    await loadTableMenu(publicQrIdRef.current);
    return res;
  }, [loadTableMenu]);

  // Withdraw pending table request (Gaeru P1)
  const withdrawOpenRequest = useCallback(async (): Promise<any> => {
    if (!publicQrIdRef.current || !pendingRequest?.requestId) throw new Error('Không có yêu cầu nào đang chờ');
    const res = await request<any>(`/public/tables/${publicQrIdRef.current}/withdraw-request`, {
      method: 'POST',
      body: JSON.stringify({ requestId: pendingRequest.requestId })
    });
    await loadTableMenu(publicQrIdRef.current);
    return res;
  }, [pendingRequest, loadTableMenu]);

  // Listen to table status events (for pending approval, claim release, approval)
  useEffect(() => {
    if (!socket || !table?.id) return;

    const currentTableId = table.id;
    socket.emit('join_table_room', { tableId: currentTableId });

    const handleTableUpdated = () => {
      if (publicQrIdRef.current) {
        loadTableMenu(publicQrIdRef.current);
      }
    };

    const handleTableRejected = (payload?: any) => {
      showToast({
        title: 'Yêu cầu mở bàn',
        message: payload?.reason ? `Yêu cầu bị từ chối: ${payload.reason}` : 'Yêu cầu mở bàn đã bị từ chối.',
        type: 'warning'
      });
      if (publicQrIdRef.current) {
        loadTableMenu(publicQrIdRef.current);
      }
    };

    socket.on('table_session:status_changed', handleTableUpdated);
    socket.on('table_session:approved', handleTableUpdated);
    socket.on('table_session:rejected', handleTableRejected);
    socket.on('table_session:claim_released', handleTableUpdated);

    return () => {
      socket.emit('leave_table_room', { tableId: currentTableId });
      socket.off('table_session:status_changed', handleTableUpdated);
      socket.off('table_session:approved', handleTableUpdated);
      socket.off('table_session:rejected', handleTableRejected);
      socket.off('table_session:claim_released', handleTableUpdated);
    };
  }, [socket, table?.id, loadTableMenu, showToast]);

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
    variant?: { id?: string; variantIds?: string[]; optionIds?: string[]; name?: string; price_adjustment?: number }
  ) => {
    setCart(prev => {
      const itemPrice = Math.max(0, Number(item.price) + (variant?.price_adjustment ? Number(variant.price_adjustment) : 0));
      const cleanNote = note?.trim() || undefined;

      const rawNewItem: any = {
        menuItemId: item.id,
        name: item.name,
        price: itemPrice,
        quantity: Math.max(1, quantity),
        variantName: variant?.name,
        note: cleanNote
      };

      if (variant?.optionIds && variant.optionIds.length > 0) {
        rawNewItem.optionIds = variant.optionIds;
      } else if (variant?.variantIds && variant.variantIds.length > 0) {
        rawNewItem.variantIds = variant.variantIds;
      } else if (variant?.id) {
        rawNewItem.variantId = variant.id;
      }

      const canonicalItem = canonicalizeCartItem(rawNewItem);
      const newKey = getCartItemKey(canonicalItem);

      const idx = prev.findIndex(c => getCartItemKey(c) === newKey);
      if (idx > -1) {
        return prev.map((entry, index) => index === idx ? { ...entry, quantity: entry.quantity + canonicalItem.quantity } : entry);
      }
      return [...prev, canonicalItem];
    });
  };

  const updateCartQuantity = (
    menuItemId: string,
    quantity: number,
    note?: string,
    variantId?: string,
    variantName?: string,
    optionIds?: string[],
    variantIds?: string[]
  ) => {
    if (quantity <= 0) {
      removeFromCart(menuItemId, note, variantId, variantName, optionIds, variantIds);
      return;
    }
    const targetKey = getCartItemKey({ menuItemId, note, variantName, variantId, optionIds, variantIds });
    setCart(prev => prev.map(c => getCartItemKey(c) === targetKey ? { ...c, quantity } : c));
  };

  const removeFromCart = (
    menuItemId: string,
    note?: string,
    variantId?: string,
    variantName?: string,
    optionIds?: string[],
    variantIds?: string[]
  ) => {
    const targetKey = getCartItemKey({ menuItemId, note, variantName, variantId, optionIds, variantIds });
    setCart(prev => prev.filter(c => getCartItemKey(c) !== targetKey));
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

  // Submit order with stable idempotency key and canonical payload projection
  const submitOrder = async () => {
    if (cart.length === 0) return;
    if (submittingOrder.current) return submittingOrder.current;

    const canonicalItems = cart.map(c => {
      const canonical = canonicalizeCartItem(c);
      const item: any = {
        menuItemId: canonical.menuItemId,
        quantity: canonical.quantity
      };
      if (canonical.note) item.note = canonical.note;
      if (canonical.optionIds && canonical.optionIds.length > 0) {
        item.optionIds = canonical.optionIds;
      } else if (canonical.variantIds && canonical.variantIds.length > 0) {
        item.variantIds = canonical.variantIds;
      } else if (canonical.variantId) {
        item.variantId = canonical.variantId;
      }
      return item;
    });

    const payload = JSON.stringify(canonicalItems);
    if (pendingOrder.current?.payload !== payload) {
      pendingOrder.current = { payload, key: crypto.randomUUID() };
    }
    const idempotencyKey = pendingOrder.current.key;

    const operation = (async () => {
      try {
        const res = await request<any>('/guest/orders', {
          method: 'POST',
          headers: { 'x-idempotency-key': idempotencyKey },
          body: JSON.stringify({
            idempotencyKey,
            items: canonicalItems
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
    try {
      return await operation;
    } finally {
      submittingOrder.current = null;
    }
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
      orderingMode,
      tableStatus,
      deviceState,
      pendingRequest,
      canOrder,
      canRequest,
      requestOpenTable,
      withdrawOpenRequest,
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
