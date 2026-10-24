export interface Tenant {
  id: string;
  name: string;
  slug: string;
  currency: string;
  status?: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  phone?: string;
  address?: string;
  openingHours?: string;
  activeTemplateId?: string;
  activeThemeConfig?: any;
  activePublishedVersion?: number;
}

export interface VariantOption {
  id?: string;
  name: string;
  price_adjustment: number;
  is_available?: boolean;
}

export interface VariantGroup {
  name: string;
  options: VariantOption[];
}

export interface MenuItemVariant extends VariantOption {
  group_name?: string;
}

export interface ItemOption {
  id?: string;
  name: string;
  price_delta?: number;
  priceDelta?: number;
  is_default?: boolean;
  isDefault?: boolean;
  is_available?: boolean;
  isAvailable?: boolean;
  sort_order?: number;
  sortOrder?: number;
}

export interface ItemOptionGroup {
  id?: string;
  name: string;
  selection_mode?: 'SINGLE' | 'MULTIPLE';
  selectionMode?: 'SINGLE' | 'MULTIPLE';
  min_selections?: number;
  minSelections?: number;
  max_selections?: number;
  maxSelections?: number;
  pricing_mode?: 'FREE' | 'ADDITIVE';
  pricingMode?: 'FREE' | 'ADDITIVE';
  sort_order?: number;
  sortOrder?: number;
  options: ItemOption[];
}

export interface MenuItem {
  id: string;
  category_id: string;
  category_name?: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order?: number;
  variants?: MenuItemVariant[];
  variant_groups?: VariantGroup[];
  option_groups?: ItemOptionGroup[];
  optionGroups?: ItemOptionGroup[];
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
  variantName?: string;
  price: number;
  quantity: number;
  discountAmount?: number;
  finalPrice?: number;
  note?: string;
  status: 'PENDING' | 'ACCEPTED' | 'SERVED' | 'CANCELLED';
  pendingQty: number;
  acceptedQty: number;
  servedQty: number;
  cancelledQty: number;
  parts: OrderItemPart[];
}

export interface AppliedPromotion {
  id: string;
  title: string;
  code?: string | null;
  discountType: string;
  discountValue: number;
  discountTotal?: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  source: string;
  createdAt: string;
  discountTotal?: number;
  appliedPromotion?: AppliedPromotion | null;
  items: OrderItem[];
}

export interface BillRound {
  orderNumber: number;
  createdAt?: string;
  rawSubtotal?: number;
  discountTotal?: number;
  acceptedOrServedSubtotal: number;
  pendingSubtotal: number;
  appliedPromotion?: AppliedPromotion | null;
  items: {
    itemId: string;
    name: string;
    variantName?: string;
    price: number;
    rawPrice?: number;
    discountAmount?: number;
    quantity: number;
    note?: string;
    status: string;
    cancelReason?: string;
    subtotal: number;
    createdAt?: string;
  }[];
}

export interface BillSummary {
  sessionId: string;
  sessionStatus: 'OPEN' | 'CLOSED';
  settlementVersion: number;
  rawBillTotal?: number;
  totalDiscount?: number;
  validBillTotal: number;
  servedTotal: number;
  pendingTotal: number;
  unresolvedCount: number;
  rounds: BillRound[];
  appliedPromotions?: AppliedPromotion[];
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
  call_count?: number;
  created_at: string;
  updated_at?: string;
  accepted_by_name?: string;
}

export interface TableActiveItem {
  orderItemId: string;
  partId: string;
  orderNumber: number;
  name: string;
  variantName?: string;
  price: number;
  note?: string;
  status: string;
  quantity: number;
  cancelReason?: string;
  createdAt?: string;
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
  activeItems?: TableActiveItem[];
}

export interface PendingTableRequest {
  session_id: string;
  table_id: string;
  table_number: string;
  guest_name: string;
  request_id: string;
  requested_at: string;
  expires_at: string;
  remaining_seconds: number;
}

export interface CartItem {
  menuItemId: string;
  variantId?: string;
  variantIds?: string[];
  optionIds?: string[];
  variantName?: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
}
