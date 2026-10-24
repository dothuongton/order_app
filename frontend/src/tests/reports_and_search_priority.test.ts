import { describe, it, expect } from 'vitest';
import { isSessionCancelled, formatCancelReason, getSessionReportStatus } from '../pages/staff/StaffReports.js';
import { getReceiptItemsForDisplay } from '../pages/staff/ReceiptDetailModal.js';

describe('Reports Status Badge Logic (Issue #140 Follow-up)', () => {
  it('correctly marks confirmed/paid sessions as NOT cancelled and formats them cleanly', () => {
    // Normal paid bill with amount and close_reason = CONFIRMED_SETTLED
    const paidSession = {
      session_id: 'b38c8a64',
      table_number: 'A01',
      confirmed_amount: 37000,
      confirmed_at: new Date().toISOString(),
      confirmed_by_name: 'Bùi Huyền',
      close_reason: 'CONFIRMED_SETTLED',
      bill_status: 'CONFIRMED'
    };

    expect(isSessionCancelled(paidSession)).toBe(false);
    expect(formatCancelReason(paidSession.close_reason)).toBe('');
    expect(getSessionReportStatus(paidSession)).toBeNull();
  });

  it('correctly identifies cancelled 0đ sessions and formats friendly reason without raw technical codes', () => {
    const fakeOrderSession = {
      session_id: '18105d12',
      table_number: 'Test 1',
      confirmed_amount: 0,
      confirmed_at: new Date().toISOString(),
      confirmed_by_name: 'Bùi Huyền',
      close_reason: 'Khách rời bàn / gọi nhầm',
      bill_status: 'CANCELLED'
    };
    expect(isSessionCancelled(fakeOrderSession)).toBe(true);
    expect(formatCancelReason(fakeOrderSession.close_reason)).toBe('Đã hủy: Rời bàn / Gọi nhầm');

    const customerChangedMindSession = {
      session_id: 'c999',
      table_number: 'A02',
      confirmed_amount: 0,
      close_reason: 'Khách đổi ý',
      bill_status: 'CANCELLED'
    };
    expect(isSessionCancelled(customerChangedMindSession)).toBe(true);
    expect(formatCancelReason(customerChangedMindSession.close_reason)).toBe('Đã hủy: Khách đổi ý');

    const virtualOrderSession = {
      session_id: 'v111',
      table_number: 'A03',
      confirmed_amount: 0,
      close_reason: 'Khách đặt ảo',
      bill_status: 'CANCELLED'
    };
    expect(isSessionCancelled(virtualOrderSession)).toBe(true);
    expect(formatCancelReason(virtualOrderSession.close_reason)).toBe('Đã hủy: Khách đặt ảo');

    const rawTechnicalSession = {
      session_id: 't222',
      table_number: 'A04',
      confirmed_amount: 0,
      close_reason: 'SESSION_CLOSED_WITHOUT_CHARGE',
      bill_status: 'CANCELLED'
    };
    expect(isSessionCancelled(rawTechnicalSession)).toBe(true);
    expect(formatCancelReason(rawTechnicalSession.close_reason)).toBe('Đã hủy: Không dùng món');

    const smokeTestSession = {
      session_id: 'c03a9c',
      table_number: 'AKA Vip',
      confirmed_amount: 0,
      close_reason: 'Test smoke flow completed',
      bill_status: 'CANCELLED'
    };
    expect(isSessionCancelled(smokeTestSession)).toBe(true);
    expect(formatCancelReason(smokeTestSession.close_reason)).toBe('Đã hủy: Thử nghiệm');
    expect(getSessionReportStatus(smokeTestSession)).toEqual({
      kind: 'cancelled',
      label: 'Đã hủy: Thử nghiệm'
    });
  });

  it('gives confirmed zero-value receipts a clear completed status instead of a blank cancellation reason', () => {
    const zeroReceipt = {
      confirmed_amount: 0,
      close_reason: 'CONFIRMED_SETTLED',
      bill_status: 'CONFIRMED'
    };

    expect(isSessionCancelled(zeroReceipt)).toBe(false);
    expect(getSessionReportStatus(zeroReceipt)).toEqual({
      kind: 'zero',
      label: 'Đã chốt 0đ · Không có món phục vụ'
    });
  });

  it('labels a zero-value cancelled receipt even if no reason was saved', () => {
    expect(getSessionReportStatus({ confirmed_amount: 0, bill_status: 'CANCELLED', close_reason: null })).toEqual({
      kind: 'cancelled',
      label: 'Đã hủy (0đ)'
    });
  });

  it('keeps customer-ordered cancelled items visible on a zero-value receipt', () => {
    const items = [
      { itemId: '1', name: 'Phở bò', price: 50000, quantity: 1, status: 'CANCELLED', subtotal: 0 },
      { itemId: '2', name: 'Trà đá', price: 5000, quantity: 1, status: 'SERVED', subtotal: 5000 }
    ];

    expect(getReceiptItemsForDisplay(items, 0)).toEqual(items);
    expect(getReceiptItemsForDisplay(items, 5000)).toEqual([items[1]]);
  });
});

describe('Guest Search Priority (Name matches before Description matches)', () => {
  // Test sorting logic
  const normalize = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const mockItems = [
    {
      id: 'item-1',
      name: 'Bánh Tiramisu Ý',
      description: 'Dùng kèm các loại trà thơm ngon hảo hạng',
      is_available: true
    },
    {
      id: 'item-2',
      name: 'Hồng Trà Sữa Macchiato',
      description: 'Vị trà đậm đà béo ngậy',
      is_available: true
    },
    {
      id: 'item-3',
      name: 'Trà Đào Cam Sả',
      description: 'Món giải khát thanh mát',
      is_available: true
    },
    {
      id: 'item-4',
      name: 'Trà Oolong Đặc Biệt',
      description: 'Hương thơm tự nhiên',
      is_available: false // Out of stock
    }
  ];

  function filterAndSort(items: typeof mockItems, queryStr: string) {
    const q = normalize(queryStr);
    const indexed = items.map(item => ({
      item,
      normName: normalize(item.name),
      normDesc: item.description ? normalize(item.description) : ''
    }));

    const matched = indexed.filter(e => e.normName.includes(q) || e.normDesc.includes(q));

    return matched
      .sort((a, b) => {
        if (a.item.is_available !== b.item.is_available) {
          return a.item.is_available ? -1 : 1;
        }

        if (q) {
          const aName = a.normName.includes(q);
          const bName = b.normName.includes(q);
          if (aName && !bName) return -1;
          if (!aName && bName) return 1;

          if (aName && bName) {
            const aScore = a.normName === q ? 1 : a.normName.startsWith(q) ? 2 : 3;
            const bScore = b.normName === q ? 1 : b.normName.startsWith(q) ? 2 : 3;
            if (aScore !== bScore) return aScore - bScore;
          }
        }

        return 0;
      })
      .map(e => e.item);
  }

  it('ranks items matching by name BEFORE items matching only by description', () => {
    const results = filterAndSort(mockItems, 'trà');

    // Expected order:
    // 1. "Trà Đào Cam Sả" (available, name startsWith "tra")
    // 2. "Hồng Trà Sữa Macchiato" (available, name includes "tra")
    // 3. "Bánh Tiramisu Ý" (available, name does NOT match, only description has "tra")
    // 4. "Trà Oolong Đặc Biệt" (unavailable / hết món, pushed to the bottom)
    expect(results[0].name).toBe('Trà Đào Cam Sả');
    expect(results[1].name).toBe('Hồng Trà Sữa Macchiato');
    expect(results[2].name).toBe('Bánh Tiramisu Ý');
    expect(results[3].name).toBe('Trà Oolong Đặc Biệt');
  });

  it('places exact name match first', () => {
    const items = [
      { id: '1', name: 'Cà phê sữa đá', description: '', is_available: true },
      { id: '2', name: 'Cà phê', description: '', is_available: true },
      { id: '3', name: 'Bạc xỉu có cà phê', description: '', is_available: true }
    ];
    const results = filterAndSort(items, 'cà phê');
    expect(results[0].name).toBe('Cà phê');
  });
});
