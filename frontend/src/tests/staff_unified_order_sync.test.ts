import { describe, it, expect, beforeEach } from 'vitest';
import { StaffTable } from '../types/index.js';
import {
  buildOptimisticBillSummary,
  optimisticallyUpdateTableOrder,
  sessionBillCache,
  getCachedBillSummary,
  setCachedBillSummary,
  invalidateSessionBill,
  clearSessionBillCache
} from '../utils/staff-bill-cache.js';

describe('Staff Unified Order Sync & Optimistic UI Logic', () => {
  beforeEach(() => {
    clearSessionBillCache();
  });

  const mockTable: StaffTable = {
    table_id: 'tbl-1',
    table_number: '10',
    public_qr_id: 'qr-10',
    capacity: 4,
    readiness: 'READY',
    is_enabled: true,
    active_session_id: 'session-101',
    opened_at: '2026-10-28T10:00:00Z',
    opened_by_name: 'Nhân viên A',
    displayStatus: 'Đang phục vụ',
    hasCheckout: false,
    hasAssistance: false,
    counts: {
      pending: 2,
      accepted: 1,
      served: 1
    },
    activeItems: [
      {
        orderItemId: 'item-1',
        partId: 'part-1',
        orderNumber: 1,
        name: 'Phở bò tái',
        price: 55000,
        quantity: 2,
        status: 'PENDING',
        note: 'Không hành'
      },
      {
        orderItemId: 'item-2',
        partId: 'part-2',
        orderNumber: 1,
        name: 'Trà đá',
        price: 5000,
        quantity: 1,
        status: 'ACCEPTED'
      },
      {
        orderItemId: 'item-3',
        partId: 'part-3',
        orderNumber: 1,
        name: 'Bánh quẩy',
        price: 10000,
        quantity: 1,
        status: 'SERVED'
      }
    ]
  };

  describe('buildOptimisticBillSummary', () => {
    it('constructs instant 0ms BillSummary from table active items', () => {
      const summary = buildOptimisticBillSummary(mockTable);
      expect(summary).not.toBeNull();
      if (!summary) return;

      expect(summary.sessionId).toBe('session-101');
      expect(summary.servedTotal).toBe(10000); // 1x quẩy served = 10k
      expect(summary.unresolvedCount).toBe(3); // 2 pending + 1 accepted = 3
      expect(summary.canConfirmPayment).toBe(false);
      expect(summary.rounds.length).toBe(1);
      expect(summary.rounds[0].items.length).toBe(3);
    });

    it('returns null if table has no active session or no items', () => {
      expect(buildOptimisticBillSummary({ ...mockTable, active_session_id: null })).toBeNull();
      expect(buildOptimisticBillSummary({ ...mockTable, activeItems: [] })).toBeNull();
    });
  });

  describe('optimisticallyUpdateTableOrder', () => {
    it('transitions PENDING to ACCEPTED and updates counts immediately', () => {
      const tables = [mockTable];
      const { updatedTables, targetTable } = optimisticallyUpdateTableOrder(tables, 'item-1', 'ACCEPTED', { quantity: 2 });

      expect(targetTable).toBeDefined();
      expect(targetTable?.counts.pending).toBe(0);
      expect(targetTable?.counts.accepted).toBe(3); // previous 1 + 2 = 3

      const updatedItem = targetTable?.activeItems?.find(i => i.orderItemId === 'item-1');
      expect(updatedItem?.status).toBe('ACCEPTED');

      // Also updates sessionBillCache automatically
      const cached = getCachedBillSummary('session-101');
      expect(cached).toBeDefined();
      expect(cached?.rounds[0].items.find(i => i.itemId === 'item-1')?.status).toBe('ACCEPTED');
    });

    it('transitions ACCEPTED to SERVED and recalculates totals and canConfirmPayment', () => {
      const tables = [
        {
          ...mockTable,
          counts: { pending: 0, accepted: 1, served: 0 },
          activeItems: [
            {
              orderItemId: 'item-2',
              partId: 'part-2',
              orderNumber: 1,
              name: 'Trà đá',
              price: 5000,
              quantity: 1,
              status: 'ACCEPTED'
            }
          ]
        }
      ];

      const { targetTable } = optimisticallyUpdateTableOrder(tables, 'item-2', 'SERVED', { quantity: 1 });
      expect(targetTable?.counts.accepted).toBe(0);
      expect(targetTable?.counts.served).toBe(1);

      const cached = getCachedBillSummary('session-101');
      expect(cached?.unresolvedCount).toBe(0);
      expect(cached?.servedTotal).toBe(5000);
      expect(cached?.canConfirmPayment).toBe(true);
    });

    it('transitions item to CANCELLED with cancelReason and adjusts unresolvedCount', () => {
      const tables = [mockTable];
      const { targetTable } = optimisticallyUpdateTableOrder(tables, 'item-1', 'CANCELLED', {
        quantity: 2,
        cancelReason: 'Hết bánh phở'
      });

      expect(targetTable?.counts.pending).toBe(0);
      const cancelledItem = targetTable?.activeItems?.find(i => i.orderItemId === 'item-1');
      expect(cancelledItem?.status).toBe('CANCELLED');
      expect(cancelledItem?.cancelReason).toBe('Hết bánh phở');
    });
  });

  describe('sessionBillCache operations', () => {
    it('manages cache correctly', () => {
      const summary = buildOptimisticBillSummary(mockTable)!;
      setCachedBillSummary('session-101', summary);
      expect(getCachedBillSummary('session-101')).toBe(summary);

      invalidateSessionBill('session-101');
      expect(getCachedBillSummary('session-101')).toBeUndefined();
    });
  });
});
