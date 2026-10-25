import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { app } from '../app.js';
import { query } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { config } from '../config/index.js';
import { GuestService } from '../modules/guest/guest.service.js';

describe('Staff orders on behalf of guests',()=>{
  const server=http.createServer(app);
  const originalMode=config.orderingMode;
  let base:string,manager:string,waiter:string,cashier:string,tenantId:string,tableId:string,qrId:string,menuId:string,sessionId:string,price:number;
  const actorId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  async function login(email:string) {
    const r=await fetch(`${base}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'123456'})});
    expect(r.status).toBe(200);return (await r.json()).token as string;
  }
  function submit(token:string,key=randomUUID(),extra:Record<string,unknown>={}) {
    return fetch(`${base}/api/v1/staff/sessions/${sessionId}/orders`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({idempotencyKey:key,items:[{menuItemId:menuId,quantity:2,note:'Ít đá'}],...extra})});
  }
  beforeAll(async()=>{
    await seed(true);
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    manager=await login('admin@phoco.vn');waiter=await login('phucvu@phoco.vn');cashier=await login('thungan@phoco.vn');
    const table=(await query('SELECT id,tenant_id,public_qr_id FROM tables ORDER BY table_number LIMIT 1')).rows[0];
    tenantId=table.tenant_id;tableId=table.id;qrId=table.public_qr_id;
    const menu=(await query('SELECT id,price FROM menu_items WHERE tenant_id=$1 AND is_available=true ORDER BY id LIMIT 1',[tenantId])).rows[0];menuId=menu.id;price=Number(menu.price);
  });
  beforeEach(async()=>{
    config.orderingMode='approved_single_device';
    await query("UPDATE table_sessions SET status='CLOSED' WHERE table_id=$1",[tableId]);
    sessionId=(await query("INSERT INTO table_sessions(tenant_id,table_id,status) VALUES ($1,$2,'OPEN') RETURNING id",[tenantId,tableId])).rows[0].id;
  });
  afterAll(async()=>{config.orderingMode=originalMode;await new Promise<void>(resolve=>server.close(()=>resolve()));});

  it.each(['approved_single_device','multi_device'] as const)('records server actor, price, pending parts and visible attribution in %s',async mode=>{
    config.orderingMode=mode;
    const r=await submit(manager,randomUUID(),{staffActor:{id:randomUUID(),fullName:'Forged'},source:'GUEST_WEB',price:1});
    expect(r.status).toBe(201);const order=await r.json();expect(order.subtotal).toBe(price*2);expect(order.finalTotal).toBe(order.subtotal-order.discountTotal);
    const audit=(await query("SELECT user_id,details,created_at FROM audit_logs WHERE resource_id=$1 AND action='STAFF_CREATE_ORDER'",[order.orderId])).rows;
    expect(audit).toHaveLength(1);expect(audit[0].user_id).toBe(actorId);expect(audit[0].details.staffName).not.toBe('Forged');expect(audit[0].details.requestedItems[0].note).toBe('Ít đá');expect(audit[0].details.sessionId).toBe(sessionId);
    const stored=(await query('SELECT source FROM orders WHERE id=$1',[order.orderId])).rows[0];expect(stored.source).toBe('STAFF_POS');
    const parts=(await query('SELECT p.status,p.quantity FROM order_item_parts p JOIN order_items i ON i.id=p.order_item_id WHERE i.order_id=$1',[order.orderId])).rows;expect(parts).toEqual([{status:'PENDING',quantity:2}]);
    const attribution=await fetch(`${base}/api/v1/staff/sessions/${sessionId}/order-attributions`,{headers:{Authorization:`Bearer ${manager}`}});
    expect((await attribution.json()).attributions[0]).toMatchObject({staffId:actorId,staffName:audit[0].details.staffName,orderNumber:order.orderNumber});
    const publicMenu=await GuestService.getPublicTableMenu(qrId);expect(JSON.stringify(publicMenu)).not.toContain(audit[0].details.staffName);
  });
  it('serializes duplicate submits and isolates staff actors using the same key',async()=>{
    const key=randomUUID();const responses=await Promise.all([submit(manager,key),submit(manager,key)]);
    expect(responses.map(r=>r.status)).toEqual([201,201]);const [a,b]=await Promise.all(responses.map(r=>r.json()));expect(a.orderId).toBe(b.orderId);
    expect((await query("SELECT count(*)::int n FROM audit_logs WHERE resource_id=$1 AND action='STAFF_CREATE_ORDER'",[a.orderId])).rows[0].n).toBe(1);
    expect((await query('SELECT settlement_version FROM table_sessions WHERE id=$1',[sessionId])).rows[0].settlement_version).toBe(2);
    const other=await submit(waiter,key);expect(other.status).toBe(201);expect((await other.json()).orderId).not.toBe(a.orderId);
    const changed=await submit(manager,key,{items:[{menuItemId:menuId,quantity:3}]});expect(changed.status).toBe(409);
  });
  it('rejects no auth, missing permission, other tenant and closed sessions',async()=>{
    expect((await submit('')).status).toBe(401);expect((await submit(cashier)).status).toBe(403);
    const otherTenant=(await query("INSERT INTO tenants(slug,name) VALUES ($1,'Other tenant') RETURNING id",[`test-${randomUUID()}`])).rows[0].id;
    const otherTable=(await query("INSERT INTO tables(tenant_id,table_number,public_qr_id) VALUES ($1,'TEST',$2) RETURNING id",[otherTenant,randomUUID()])).rows[0].id;
    const ownSession=sessionId;
    sessionId=(await query("INSERT INTO table_sessions(tenant_id,table_id,status) VALUES ($1,$2,'OPEN') RETURNING id",[otherTenant,otherTable])).rows[0].id;
    expect((await submit(manager)).status).toBe(404);sessionId=ownSession;
    await query("UPDATE table_sessions SET status='CLOSED' WHERE id=$1",[sessionId]);expect((await submit(manager)).status).toBe(400);
  });
  it('does not let public guest requests spoof staff authority',async()=>{
    config.orderingMode='multi_device';const guest=await GuestService.joinSession(qrId);
    config.orderingMode='approved_single_device';
    const r=await fetch(`${base}/api/v1/guest/orders`,{method:'POST',headers:{'Content-Type':'application/json','x-guest-token':guest.token},body:JSON.stringify({idempotencyKey:randomUUID(),items:[{menuItemId:menuId,quantity:1}],staffActor:{id:actorId},source:'STAFF_POS'})});
    expect([401,403]).toContain(r.status);expect((await query('SELECT id FROM orders WHERE session_id=$1',[sessionId])).rows).toHaveLength(0);
  });
  it('rolls order and version back if its audit cannot be saved',async()=>{
    await query(`CREATE FUNCTION reject_staff_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='STAFF_CREATE_ORDER' THEN RAISE EXCEPTION 'Test audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_staff_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_staff_audit()`);
    try {expect((await submit(manager)).status).toBe(500);}
    finally {await query('DROP TRIGGER reject_staff_audit ON audit_logs; DROP FUNCTION reject_staff_audit()');}
    expect((await query('SELECT id FROM orders WHERE session_id=$1',[sessionId])).rows).toHaveLength(0);
    expect((await query('SELECT settlement_version FROM table_sessions WHERE id=$1',[sessionId])).rows[0].settlement_version).toBe(1);
  });
  it('blocks new public requests after served dishes even on a released-version session',async()=>{
    const created=await submit(manager);expect(created.status).toBe(201);
    for (const action of ['accept-all','serve-all']) {
      const r=await fetch(`${base}/api/v1/staff/sessions/${sessionId}/${action}`,{method:'POST',headers:{Authorization:`Bearer ${manager}`}});expect(r.status).toBe(200);
    }
    await query('UPDATE table_sessions SET claim_version=2 WHERE id=$1',[sessionId]);
    const menu=await GuestService.getPublicTableMenu(qrId);expect(menu.table.canRequest).toBe(false);
    await expect(GuestService.requestTableOpen(qrId,{requestId:randomUUID(),guestName:'Other guest'},'different-device')).rejects.toMatchObject({status:409,code:'TABLE_ALREADY_OCCUPIED'});
  });
  it('validates required options and records their server prices',async()=>{
    const menu=(await query("INSERT INTO menu_items(tenant_id,category_id,name,price,is_available) SELECT $1,category_id,'Option test',20000,true FROM menu_items WHERE id=$2 RETURNING id",[tenantId,menuId])).rows[0].id;
    const group=(await query("INSERT INTO item_option_groups(tenant_id,menu_item_id,name,selection_mode,min_selections,max_selections,pricing_mode,is_active) VALUES ($1,$2,'Required','SINGLE',1,1,'ADDITIVE',true) RETURNING id",[tenantId,menu])).rows[0].id;
    const option=(await query("INSERT INTO item_options(tenant_id,menu_item_id,group_id,name,price_delta,is_available) VALUES ($1,$2,$3,'Extra',5000,true) RETURNING id",[tenantId,menu,group])).rows[0].id;
    const invalid=await submit(manager,randomUUID(),{items:[{menuItemId:menu,quantity:1}]});expect(invalid.status).toBe(400);
    expect((await query('SELECT id FROM orders WHERE session_id=$1',[sessionId])).rows).toHaveLength(0);
    const valid=await submit(manager,randomUUID(),{items:[{menuItemId:menu,quantity:2,optionIds:[option],price:1}]});expect(valid.status).toBe(201);
    const order=await valid.json();expect(order.subtotal).toBe(50000);
    expect((await query('SELECT snapshot_price::int AS snapshot_price FROM order_items WHERE order_id=$1',[order.orderId])).rows[0].snapshot_price).toBe(25000);
  });
  it('cannot approve a stale opening request on an occupied legacy session',async()=>{
    await query(`UPDATE table_sessions SET requester_device_hash='stale-device',request_id=$1,
      requester_guest_name='Stale requester',requested_at=NOW(),expires_at=NOW()+INTERVAL '15 minutes'
      WHERE id=$2`,[randomUUID(),sessionId]);
    const r=await fetch(`${base}/api/v1/staff/tables/${tableId}/approve-request`,{method:'POST',headers:{Authorization:`Bearer ${manager}`}});
    expect(r.status).toBe(409);expect((await r.json()).error).toBe('TABLE_ALREADY_OCCUPIED');
    const row=(await query('SELECT status,claimed_device_hash FROM table_sessions WHERE id=$1',[sessionId])).rows[0];
    expect(row).toEqual({status:'OPEN',claimed_device_hash:null});
    const rejected=await fetch(`${base}/api/v1/staff/tables/${tableId}/reject-request`,{method:'POST',headers:{Authorization:`Bearer ${manager}`}});
    expect(rejected.status).toBe(200);
    const kept=(await query('SELECT status,requester_device_hash FROM table_sessions WHERE id=$1',[sessionId])).rows[0];
    expect(kept).toEqual({status:'OPEN',requester_device_hash:null});
  });
  it.each(['approved_single_device','multi_device'] as const)('authorizes the existing guest storefront without granting guest claims in %s',async mode=>{
    config.orderingMode=mode;
    await query("UPDATE table_sessions SET claimed_device_hash='existing-guest-device' WHERE id=$1",[sessionId]);
    const before=(await query('SELECT count(*)::int n FROM guest_sessions WHERE session_id=$1',[sessionId])).rows[0].n;
    const getContext=(token:string,qr=qrId)=>fetch(`${base}/api/v1/staff/sessions/${sessionId}/ordering-context?qrId=${encodeURIComponent(qr)}`,{headers:{Authorization:`Bearer ${token}`}});
    expect((await getContext('')).status).toBe(401);
    expect((await getContext(cashier)).status).toBe(403);
    expect((await getContext(manager,'wrong-table-qr')).status).toBe(409);
    const r=await getContext(waiter);expect(r.status).toBe(200);
    const context=await r.json();expect(context.session.id).toBe(sessionId);expect(context.table.id).toBe(tableId);expect(context.staff.fullName).toBeTruthy();
    const after=(await query('SELECT count(*)::int n FROM guest_sessions WHERE session_id=$1',[sessionId])).rows[0].n;expect(after).toBe(before);
    expect((await query('SELECT claimed_device_hash FROM table_sessions WHERE id=$1',[sessionId])).rows[0].claimed_device_hash).toBe('existing-guest-device');
    const denied=await fetch(`${base}/api/v1/staff/sessions/${sessionId}/orders`,{headers:{Authorization:`Bearer ${cashier}`}});expect(denied.status).toBe(403);
    const created=await submit(waiter);expect(created.status).toBe(201);
    const ownOrders=await fetch(`${base}/api/v1/staff/sessions/${sessionId}/orders`,{headers:{Authorization:`Bearer ${waiter}`}});
    expect(ownOrders.status).toBe(200);expect((await ownOrders.json()).orders).toHaveLength(1);
    await query("UPDATE table_sessions SET status='CLOSED' WHERE id=$1",[sessionId]);expect((await getContext(waiter)).status).toBe(409);
  });
  it('denies a storefront context for another tenant',async()=>{
    const other=(await query("INSERT INTO tenants(slug,name) VALUES ($1,'Another test tenant') RETURNING id",[`ctx-${randomUUID()}`])).rows[0].id;
    const table=(await query("INSERT INTO tables(tenant_id,table_number,public_qr_id) VALUES ($1,'CTX',$2) RETURNING id,public_qr_id",[other,randomUUID()])).rows[0];
    const session=(await query("INSERT INTO table_sessions(tenant_id,table_id,status) VALUES ($1,$2,'OPEN') RETURNING id",[other,table.id])).rows[0];
    const r=await fetch(`${base}/api/v1/staff/sessions/${session.id}/ordering-context?qrId=${table.public_qr_id}`,{headers:{Authorization:`Bearer ${manager}`}});expect(r.status).toBe(404);
  });
  it('rejects revoked staff tokens',async()=>{
    const token=await login('phucvu@phoco.vn');
    await fetch(`${base}/api/v1/auth/logout`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});
    expect((await submit(token)).status).toBe(401);
    const r=await fetch(`${base}/api/v1/staff/sessions/${sessionId}/ordering-context?qrId=${qrId}`,{headers:{Authorization:`Bearer ${token}`}});expect(r.status).toBe(401);
  });
});
