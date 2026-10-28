import { StaffTable, BillSummary, BillRound } from '../types/index.js';

// Shared In-memory SWR cache for instant modal opening and zero network delay
export const sessionBillCache = new Map<string, BillSummary>();

export function getCachedBillSummary(sessionId: string): BillSummary | undefined {
  return sessionBillCache.get(sessionId);
}

export function setCachedBillSummary(sessionId: string, summary: BillSummary): void {
  sessionBillCache.set(sessionId, summary);
}

export function invalidateSessionBill(sessionId: string): void {
  sessionBillCache.delete(sessionId);
}

export function clearSessionBillCache(): void {
  sessionBillCache.clear();
}

/**
 * Reconstructs a valid BillSummary from StaffTable activeItems in 0ms (optimistic Zero-Wait UI)
 */
export function buildOptimisticBillSummary(table: StaffTable): BillSummary | null {
  if (!table.active_session_id) return null;
  const items = table.activeItems || [];
  if (items.length === 0) return null;

  const roundsMap = new Map<number, BillRound>();
  let servedTotal = 0;
  let pendingTotal = 0;
  let rawBillTotal = 0;
  let unresolvedCount = 0;

  for (const item of items) {
    const roundNum = item.orderNumber || 1;
    if (!roundsMap.has(roundNum)) {
      roundsMap.set(roundNum, {
        orderNumber: roundNum,
        source: item.source || null,
        orderedByName: item.orderedByName || null,
        createdAt: item.createdAt,
        rawSubtotal: 0,
        discountTotal: 0,
        acceptedOrServedSubtotal: 0,
        pendingSubtotal: 0,
        appliedPromotion: null,
        items: []
      });
    }
    const round = roundsMap.get(roundNum)!;
    const qty = item.quantity || 1;
    const price = Number(item.price) || 0;
    const subtotal = item.status === 'CANCELLED' ? 0 : price * qty;
    rawBillTotal += subtotal;

    if (item.status === 'SERVED') {
      servedTotal += subtotal;
      round.acceptedOrServedSubtotal = (round.acceptedOrServedSubtotal || 0) + subtotal;
    } else if (item.status === 'ACCEPTED') {
      unresolvedCount += qty;
      round.acceptedOrServedSubtotal = (round.acceptedOrServedSubtotal || 0) + subtotal;
    } else if (item.status === 'PENDING') {
      pendingTotal += subtotal;
      unresolvedCount += qty;
      round.pendingSubtotal = (round.pendingSubtotal || 0) + subtotal;
    }

    round.items.push({
      itemId: item.orderItemId,
      name: item.name,
      variantName: item.variantName,
      price,
      quantity: qty,
      rawPrice: price * qty,
      discountAmount: 0,
      note: item.note,
      status: item.status,
      cancelReason: item.cancelReason,
      subtotal,
      createdAt: item.createdAt
    });
  }

  const rounds = Array.from(roundsMap.values()).sort((a, b) => a.orderNumber - b.orderNumber);
  return {
    sessionId: table.active_session_id,
    sessionStatus: 'OPEN',
    settlementVersion: table.settlement_version || 1,
    rawBillTotal,
    totalDiscount: 0,
    validBillTotal: servedTotal,
    servedTotal,
    pendingTotal,
    unresolvedCount,
    rounds,
    canConfirmPayment: unresolvedCount === 0 && servedTotal > 0
  };
}

/**
 * Optimistically mutates a table order item in memory and recalculates counts
 */
export function optimisticallyUpdateTableOrder(
  tables: StaffTable[],
  orderItemId: string,
  newStatus: string,
  options?: { quantity?: number; cancelReason?: string }
): { updatedTables: StaffTable[]; targetTable?: StaffTable } {
  let targetTable: StaffTable | undefined;

  const updatedTables = tables.map((t) => {
    if (!t.activeItems || t.activeItems.length === 0) return t;

    const itemIndex = t.activeItems.findIndex(
      (item) => item.orderItemId === orderItemId || item.partId === orderItemId
    );

    if (itemIndex === -1) return t;

    const existingItem = t.activeItems[itemIndex];
    const oldStatus = existingItem.status;
    const qty = options?.quantity || existingItem.quantity || 1;

    // Mutate item
    const updatedItem = {
      ...existingItem,
      status: newStatus,
      cancelReason: options?.cancelReason !== undefined ? options.cancelReason : existingItem.cancelReason
    };

    const newActiveItems = [...t.activeItems];
    newActiveItems[itemIndex] = updatedItem;

    // Update counts
    const newCounts = { ...t.counts };
    if (oldStatus === 'PENDING') newCounts.pending = Math.max(0, newCounts.pending - qty);
    else if (oldStatus === 'ACCEPTED') newCounts.accepted = Math.max(0, newCounts.accepted - qty);
    else if (oldStatus === 'SERVED') newCounts.served = Math.max(0, newCounts.served - qty);

    if (newStatus === 'PENDING') newCounts.pending += qty;
    else if (newStatus === 'ACCEPTED') newCounts.accepted += qty;
    else if (newStatus === 'SERVED') newCounts.served += qty;

    const newTable: StaffTable = {
      ...t,
      counts: newCounts,
      activeItems: newActiveItems
    };

    targetTable = newTable;
    return newTable;
  });

  // Keep sessionBillCache in sync
  if (targetTable && targetTable.active_session_id) {
    const updatedSummary = buildOptimisticBillSummary(targetTable);
    if (updatedSummary) {
      setCachedBillSummary(targetTable.active_session_id, updatedSummary);
    }
  }

  return { updatedTables, targetTable };
}
