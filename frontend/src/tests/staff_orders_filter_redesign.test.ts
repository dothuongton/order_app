import { describe, it, expect } from 'vitest';
import {
  filterAndSortStaffOrderItems,
  formatElapsedWaitingDisplay
} from '../pages/staff/StaffDashboard.js';
import { TableActiveItem } from '../types/index.js';

describe('Staff Order Management Filter & Layout Logic', () => {
  const sampleItems: TableActiveItem[] = [
    {
      orderItemId: 'item-1',
      partId: 'part-1',
      orderNumber: 1,
      name: 'Trà Sữa Trân Châu',
      variantName: 'Size M • Ít đường',
      price: 35000,
      status: 'ACCEPTED',
      quantity: 2,
      createdAt: '2026-10-27T10:00:00.000Z'
    },
    {
      orderItemId: 'item-2',
      partId: 'part-1',
      orderNumber: 2,
      name: 'Khoai Tây Chiên Giòn',
      variantName: 'Lắc phô mai',
      price: 25000,
      status: 'PENDING',
      quantity: 1,
      createdAt: '2026-10-27T10:05:00.000Z'
    },
    {
      orderItemId: 'item-3',
      partId: 'part-2',
      orderNumber: 3,
      name: 'Cà Phê Muối',
      price: 30000,
      status: 'PENDING',
      quantity: 1,
      createdAt: '2026-10-27T10:02:00.000Z'
    },
    {
      orderItemId: 'item-4',
      partId: 'part-2',
      orderNumber: 1,
      name: 'Trà Đào Cam Sả',
      price: 40000,
      status: 'SERVED',
      quantity: 1,
      createdAt: '2026-10-27T09:50:00.000Z'
    },
    {
      orderItemId: 'item-5',
      partId: 'part-3',
      orderNumber: 1,
      name: 'Nước Suối',
      price: 10000,
      status: 'CANCELLED',
      quantity: 1,
      createdAt: '2026-10-27T09:45:00.000Z'
    }
  ];

  it('combines PENDING and ACCEPTED items in "actionable" tab and excludes CANCELLED and SERVED', () => {
    const actionable = filterAndSortStaffOrderItems(sampleItems, 'actionable');
    expect(actionable.length).toBe(3);
    expect(actionable.some(i => i.status === 'SERVED')).toBe(false);
    expect(actionable.some(i => i.status === 'CANCELLED')).toBe(false);
  });

  it('prioritizes PENDING items first, then ACCEPTED, ordered chronologically (FIFO)', () => {
    const actionable = filterAndSortStaffOrderItems(sampleItems, 'actionable');
    
    // First two items must be PENDING
    expect(actionable[0].status).toBe('PENDING');
    expect(actionable[1].status).toBe('PENDING');
    // Earliest PENDING item (item-3 at 10:02) comes before item-2 at 10:05
    expect(actionable[0].orderItemId).toBe('item-3');
    expect(actionable[1].orderItemId).toBe('item-2');

    // Last item is ACCEPTED
    expect(actionable[2].status).toBe('ACCEPTED');
    expect(actionable[2].orderItemId).toBe('item-1');
  });

  it('filters only SERVED items in "served" tab', () => {
    const served = filterAndSortStaffOrderItems(sampleItems, 'served');
    expect(served.length).toBe(1);
    expect(served[0].orderItemId).toBe('item-4');
    expect(served[0].status).toBe('SERVED');
  });

  it('formats elapsed waiting minutes with clean display and boundaries', () => {
    expect(formatElapsedWaitingDisplay(null)).toBeNull();
    expect(formatElapsedWaitingDisplay(undefined)).toBeNull();
    expect(formatElapsedWaitingDisplay(0)).toBe("<1'");
    expect(formatElapsedWaitingDisplay(5)).toBe("5'");
    expect(formatElapsedWaitingDisplay(60)).toBe("60'");
    expect(formatElapsedWaitingDisplay(120)).toBe("120'");
    expect(formatElapsedWaitingDisplay(121)).toBe(">120'");
    expect(formatElapsedWaitingDisplay(9999)).toBe(">120'");
  });
});
