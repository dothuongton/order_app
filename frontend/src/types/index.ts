export interface Tenant {
  id: string;
  name: string;
  slug: string;
  currency: string;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  sort_order: number;
}

export interface OrderItemPart {
  status: 'PENDING' | 'ACCEPTED' | 'SERVED' | 'CANCELLED';
  quantity: number;
  cancel_reason?: string;
}

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
  status: 'PENDING' | 'ACCEPTED' | 'SERVED' | 'CANCELLED';
  pendingQty: number;
  acceptedQty: number;
  servedQty: number;
  cancelledQty: number;
  parts: OrderItemPart[];
}

export interface Order {
  id: string;
  orderNumber: number;
  source: string;
  createdAt: string;
  items: OrderItem[];
}

export interface BillRound {
  orderNumber: number;
  acceptedOrServedSubtotal: number;
  pendingSubtotal: number;
  items: {
    itemId: string;
    name: string;
    price: number;
    quantity: number;
    status: string;
    cancelReason?: string;
    subtotal: number;
  }[];
}

export interface BillSummary {
  sessionId: string;
  sessionStatus: 'OPEN' | 'CLOSED';
  settlementVersion: number;
  validBillTotal: number;
  servedTotal: number;
  pendingTotal: number;
  unresolvedCount: number;
  rounds: BillRound[];
  canConfirmPayment: boolean;
}

export interface ServiceRequest {
  id: string;
  table_id: string;
  session_id: string;
  type: 'ASSISTANCE' | 'CHECKOUT';
  status: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED';
  note: string | null;
  table_number: string;
  created_at: string;
  accepted_by_name?: string;
}

export interface StaffTable {
  table_id: string;
  table_number: string;
  public_qr_id: string;
  capacity: number;
  readiness: 'READY' | 'NEEDS_CLEANING' | 'DISABLED';
  is_enabled: boolean;
  active_session_id: string | null;
  opened_at: string | null;
  opened_by_name: string | null;
  settlement_version?: number;
  displayStatus: 'Sẵn sàng' | 'Đang phục vụ' | 'Yêu cầu thanh toán' | 'Chờ dọn' | 'Ngừng sử dụng';
  hasCheckout: boolean;
  hasAssistance: boolean;
  counts: {
    pending: number;
    accepted: number;
    served: number;
  };
}

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
}
