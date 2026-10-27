import { describe, it, expect } from 'vitest';
import {
  filterAndSortStaffOrderItems,
  groupStaffOrderItemsByRound,
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

  it('orders items by round (orderNumber ASC) for table display, then actionable priority within round', () => {
    const multiRoundSample: TableActiveItem[] = [
      {
        orderItemId: 'r1-accepted',
        partId: 'p1',
        orderNumber: 1,
        name: 'Trà Sữa Oolong',
        status: 'ACCEPTED',
        quantity: 1,
        createdAt: '2026-10-27T10:00:00.000Z'
      },
      {
        orderItemId: 'r1-pending',
        partId: 'p2',
        orderNumber: 1,
        name: 'Trà Đào',
        status: 'PENDING',
        quantity: 1,
        createdAt: '2026-10-27T10:01:00.000Z'
      },
      {
        orderItemId: 'r2-pending',
        partId: 'p3',
        orderNumber: 2,
        name: 'Cà phê muối',
        status: 'PENDING',
        quantity: 1,
        createdAt: '2026-10-27T10:15:00.000Z'
      }
    ];

    const actionable = filterAndSortStaffOrderItems(multiRoundSample, 'actionable');
    // Round 1 items come before Round 2 items
    expect(actionable[0].orderNumber).toBe(1);
    expect(actionable[1].orderNumber).toBe(1);
    expect(actionable[2].orderNumber).toBe(2);

    // Within Round 1, PENDING is prioritized before ACCEPTED
    expect(actionable[0].orderItemId).toBe('r1-pending');
    expect(actionable[1].orderItemId).toBe('r1-accepted');
    expect(actionable[2].orderItemId).toBe('r2-pending');
  });

  it('groups items by round to suppress duplicate round metadata within the same round', () => {
    const itemsInSameRound: TableActiveItem[] = [
      {
        orderItemId: 'item-a',
        partId: 'pa',
        orderNumber: 2,
        name: 'Trà Sữa Trân Châu',
        status: 'PENDING',
        quantity: 1,
        source: 'GUEST_WEB',
        createdAt: '2026-10-27T20:09:00.000Z'
      },
      {
        orderItemId: 'item-b',
        partId: 'pb',
        orderNumber: 2,
        name: 'Matcha Latte Dâu',
        status: 'ACCEPTED',
        quantity: 2,
        source: 'GUEST_WEB',
        createdAt: '2026-10-27T20:09:00.000Z'
      },
      {
        orderItemId: 'item-c',
        partId: 'pc',
        orderNumber: 3,
        name: 'Khoai Tây Chiên',
        status: 'PENDING',
        quantity: 1,
        source: 'STAFF_POS',
        orderedByName: 'Nguyễn Quản Lý',
        createdAt: '2026-10-27T20:25:00.000Z'
      }
    ];

    const roundGroups = groupStaffOrderItemsByRound(itemsInSameRound);
    expect(roundGroups.length).toBe(2);

    // Group 1 represents Round 2, containing both item-a and item-b
    expect(roundGroups[0].orderNumber).toBe(2);
    expect(roundGroups[0].roundItems.length).toBe(2);
    expect(roundGroups[0].roundItems.map(i => i.orderItemId)).toEqual(['item-a', 'item-b']);
    expect(roundGroups[0].source).toBe('GUEST_WEB');

    // Group 2 represents Round 3, containing item-c
    expect(roundGroups[1].orderNumber).toBe(3);
    expect(roundGroups[1].roundItems.length).toBe(1);
    expect(roundGroups[1].roundItems[0].orderItemId).toBe('item-c');
    expect(roundGroups[1].orderedByName).toBe('Nguyễn Quản Lý');
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
