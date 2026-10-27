import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { app } from '../app.js';
import { query } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { StaffService } from '../modules/staff/staff.service.js';
import { GuestService } from '../modules/guest/guest.service.js';

describe('Cancel served orders & items', () => {
  const server = http.createServer(app);
  let base: string;
  let managerToken: string;
  let tenantId: string;
  let tableId: string;
  let menuId: string;
  let sessionId: string;
  const managerId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  async function login(email: string) {
    const r = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: '123456' })
    });
    expect(r.status).toBe(200);
    return (await r.json()).token as string;
  }

  beforeAll(async () => {
    await seed(true);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    managerToken = await login('admin@phoco.vn');

    const table = (await query('SELECT id, tenant_id FROM tables ORDER BY table_number LIMIT 1')).rows[0];
    tenantId = table.tenant_id;
    tableId = table.id;

    const menu = (await query('SELECT id, price FROM menu_items WHERE tenant_id=$1 AND is_available=true ORDER BY id LIMIT 1', [tenantId])).rows[0];
    menuId = menu.id;
  });

  beforeEach(async () => {
    await query("UPDATE table_sessions SET status='CLOSED' WHERE table_id=$1", [tableId]);
    sessionId = (await query("INSERT INTO table_sessions(tenant_id,table_id,status) VALUES ($1,$2,'OPEN') RETURNING id", [tenantId, tableId])).rows[0].id;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('allows staff to cancel an item that is already SERVED via StaffService', async () => {
    // 1. Create order with 2 items
    const orderRes = await fetch(`${base}/api/v1/staff/sessions/${sessionId}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        items: [{ menuItemId: menuId, quantity: 2, note: 'Khách yêu cầu' }]
      })
    });
    expect(orderRes.status).toBe(201);
    const orderData = await orderRes.json();
    const orderId = orderData.orderId;

    const itemRow = (await query('SELECT id FROM order_items WHERE order_id=$1', [orderId])).rows[0];
    const orderItemId = itemRow.id;

    // 2. Accept and Serve the item
    await StaffService.acceptOrderItem(tenantId, orderItemId, 2, managerId);
    await StaffService.serveOrderItem(tenantId, orderItemId, 2, managerId);

    // Verify item part is SERVED
    const partsBefore = (await query('SELECT status, quantity FROM order_item_parts WHERE order_item_id=$1', [orderItemId])).rows;
    expect(partsBefore).toEqual([{ status: 'SERVED', quantity: 2 }]);

    // Bill summary before cancel
    const billBefore = await GuestService.getBillSummary(tenantId, sessionId);
    expect(billBefore.validBillTotal).toBeGreaterThan(0);

    // 3. Cancel the SERVED item (1 out of 2)
    const cancelResult = await StaffService.cancelOrderItem(
      tenantId,
      orderItemId,
      1,
      'Khách trả món do đổi ý',
      managerId,
      false
    );
    expect(cancelResult.cancelledQuantity).toBe(1);

    // Verify parts: 1 SERVED, 1 CANCELLED
    const partsAfter = (await query('SELECT status, quantity, cancel_reason FROM order_item_parts WHERE order_item_id=$1 ORDER BY status', [orderItemId])).rows;
    expect(partsAfter).toHaveLength(2);
    expect(partsAfter[0]).toMatchObject({ status: 'CANCELLED', quantity: 1, cancel_reason: 'Khách trả món do đổi ý' });
    expect(partsAfter[1]).toMatchObject({ status: 'SERVED', quantity: 1 });

    // Verify audit event ledger
    const event = (await query("SELECT from_status, to_status, quantity, reason FROM order_item_events WHERE order_item_id=$1 AND to_status='CANCELLED'", [orderItemId])).rows[0];
    expect(event).toMatchObject({
      from_status: 'SERVED',
      to_status: 'CANCELLED',
      quantity: 1,
      reason: 'Khách trả món do đổi ý'
    });

    // 4. Cancel the remaining 1 SERVED item via HTTP endpoint
    const httpCancelRes = await fetch(`${base}/api/v1/staff/order-items/${orderItemId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        quantity: 1,
        reason: 'Khách trả nốt món còn lại',
        markItemOutOfStock: false
      })
    });
    expect(httpCancelRes.status).toBe(200);

    // Bill summary after canceling all served items should be 0đ
    const billAfter = await GuestService.getBillSummary(tenantId, sessionId);
    expect(billAfter.validBillTotal).toBe(0);
  });
});
