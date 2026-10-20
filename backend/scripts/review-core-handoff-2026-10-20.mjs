import {randomUUID,randomBytes} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import http from 'node:http';
process.env.NODE_ENV='test';
const {default:setup}=await import('../src/tests/setup-database.ts');
const source=new URL(process.env.TEST_DATABASE_ADMIN_URL||process.env.DATABASE_URL||'postgres://admin:@localhost:5432/qr_order_db');
if(!['localhost','127.0.0.1','::1','[::1]'].includes(source.hostname))throw Error('Only isolated local DB permitted');
const cleanup=await setup();let pool,server;
const evidence={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),cases:[]};
const record=(id,result)=>{evidence.cases.push({id,...result});process.stdout.write(JSON.stringify({id,...result})+'\n');};
try{
 const db=await import('../src/db/pool.ts');pool=db.pool;const {query}=db;
 const {GuestService:G}=await import('../src/modules/guest/guest.service.ts');
 const {StaffService:S}=await import('../src/modules/staff/staff.service.ts');
 const {CmsService:C}=await import('../src/modules/cms/cms.service.ts');
 const {app}=await import('../src/app.ts');
 const tenant='11111111-1111-1111-1111-111111111111',manager='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const category=(await query('SELECT id FROM menu_categories WHERE tenant_id=$1 LIMIT 1',[tenant])).rows[0].id;
 server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const api=async(path,token,body,method='POST')=>{const r=await fetch(base+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,body:await r.json()};};
 const login=await api('/auth/login',null,{email:'admin@phoco.vn',password:'123456'});if(login.status!==200)throw Error('Test login failed');const token=login.body.token;
 const item=async(name,price)=>(await query('INSERT INTO menu_items (tenant_id,category_id,name,price) VALUES ($1,$2,$3,$4) RETURNING id',[tenant,category,name,price])).rows[0].id;
 const session=async()=>{const qr='review-'+randomUUID();const table=(await query('INSERT INTO tables (tenant_id,table_number,public_qr_id) VALUES ($1,$2,$3) RETURNING id',[tenant,qr,qr])).rows[0].id;return{table,sessionId:(await S.openSession(tenant,table,manager)).sessionId};};
 const order=(s,id,q)=>G.createOrder(tenant,s.sessionId,s.table,{idempotencyKey:randomUUID(),items:[{menuItemId:id,quantity:q}]});
 const serve=async s=>{await S.acceptAllPending(tenant,s.sessionId,manager);await S.serveAllAccepted(tenant,s.sessionId,manager);};
 const clear=()=>query('UPDATE promotions SET is_active=false');
 // Reproduce absent-admin production migration without printing credential/hash.
 await query('DELETE FROM users WHERE is_platform_admin=true');
 await query("DELETE FROM schema_migrations WHERE filename='004_superadmin_user.sql'");
 execFileSync(process.execPath,['--import','tsx','src/db/migrate.ts'],{env:{...process.env,NODE_ENV:'production',JWT_SECRET:randomBytes(48).toString('hex'),GUEST_COOKIE_SECRET:randomBytes(48).toString('hex'),VAPID_PUBLIC_KEY:'',VAPID_PRIVATE_KEY:''},stdio:'pipe'});
 const admin=(await query('SELECT password_hash FROM users WHERE is_platform_admin=true')).rows;
 const {default:bcrypt}=await import('bcryptjs');
 record('R1-default-admin',{productionMigrationCreatesAdmin:admin.length>0,acceptsPublishedDefault:admin.length>0&&await bcrypt.compare('admin123',admin[0].password_hash)});
 // Percent discount must cover full session, not just first round.
 await clear();const percent=await C.createPromotion(tenant,{title:'Review 10 percent',discountType:'PERCENT',discountValue:10,minOrderAmount:0});
 const pctItem=await item('Review percent',60000),pct=await session();await order(pct,pctItem,2);await order(pct,pctItem,2);await serve(pct);
 const pctSummary=await G.getBillSummary(tenant,pct.sessionId);
 record('R2-session-percent',{raw:pctSummary.rawBillTotal,actual:pctSummary.validBillTotal,expected:216000});
 // Cap consumed at order placement locks a small session discount instead of final bill.
 await clear();await C.createPromotion(tenant,{title:'Review capped percent',discountType:'PERCENT',discountValue:10,minOrderAmount:0,maxRedemptions:1});
 const capped=await session();await order(capped,pctItem,1);await order(capped,pctItem,1);await serve(capped);
 const cappedSummary=await G.getBillSummary(tenant,capped.sessionId);
 record('R2b-session-cap',{raw:cappedSummary.rawBillTotal,actual:cappedSummary.validBillTotal,expected:108000});
 // Real HTTP payload sent by existing frontend omits optional expectedAmount.
 await clear();await C.createPromotion(tenant,{title:'Review changed promotion',discountType:'FIXED_AMOUNT',discountValue:20000,minOrderAmount:100000});
 const changed=await session();await order(changed,pctItem,1);await order(changed,pctItem,1);await serve(changed);
 const displayed=await G.getBillSummary(tenant,changed.sessionId);await clear();
 const missingQuote=await api(`/staff/sessions/${changed.sessionId}/confirm-payment-and-close`,token,{settlementVersion:displayed.settlementVersion,requestId:randomUUID()});
 const paid=await api(`/staff/sessions/${changed.sessionId}/confirm-payment-and-close`,token,{settlementVersion:displayed.settlementVersion,expectedAmount:displayed.validBillTotal,requestId:randomUUID()});
 record('R3-price-change',{displayed:displayed.validBillTotal,missingQuoteStatus:missingQuote.status,httpStatus:paid.status,paid:paid.body.totalAmount,expectedConflict:409});
 // Suspended existing session cannot use actual settlement route.
 const suspended=await session();await order(suspended,pctItem,1);await serve(suspended);const suspendSummary=await G.getBillSummary(tenant,suspended.sessionId);
 await query("UPDATE tenants SET status='suspended' WHERE id=$1",[tenant]);
 const suspendedPay=await api(`/staff/sessions/${suspended.sessionId}/confirm-payment-and-close`,token,{settlementVersion:suspendSummary.settlementVersion,expectedAmount:suspendSummary.validBillTotal});
 const suspendedServe=await api(`/staff/sessions/${suspended.sessionId}/serve-all`,token,{});
 record('R4-suspended',{payStatus:suspendedPay.status,payError:suspendedPay.body.error,serveStatus:suspendedServe.status});
 await query("UPDATE tenants SET status='active' WHERE id=$1",[tenant]);
 // Session discount applied only at checkout is absent from item net report.
 await clear();const promo=await C.createPromotion(tenant,{title:'Review snapshot original',discountType:'FIXED_AMOUNT',discountValue:20000,minOrderAmount:100000});
 const netItem=await item('Review net-only '+randomUUID(),60000),net=await session();await order(net,netItem,1);await order(net,netItem,1);await serve(net);const netSummary=await G.getBillSummary(tenant,net.sessionId);
 const netPaid=await S.confirmPaymentAndCloseSession(tenant,net.sessionId,netSummary.settlementVersion,manager,undefined,randomUUID(),netSummary.validBillTotal);
 const report=await api('/staff/reports/summary',token,undefined,'GET');const name=(await query('SELECT name FROM menu_items WHERE id=$1',[netItem])).rows[0].name;const row=report.body.topServedItems.find(r=>r.item_name===name);
 record('R5-net-report',{settled:netPaid.totalAmount,reportedGross:Number(row.gross_amount),reportedNet:Number(row.total_amount)});
 // Historical promotion details are still live; deleting promotion cascades redemption.
 const old=await G.getBillSummary(tenant,net.sessionId);await query("UPDATE promotions SET title='Changed after settlement', discount_value=99999 WHERE id=$1",[promo.id]);
 const edited=await G.getBillSummary(tenant,net.sessionId);await query('DELETE FROM promotions WHERE id=$1',[promo.id]);const deleted=await G.getBillSummary(tenant,net.sessionId);
 record('R6-mutable-promo-snapshot',{before:old.appliedPromotions[0]?.title,after:edited.appliedPromotions[0]?.title,redemptionsAfterDeletion:Number((await query('SELECT count(*) AS n FROM promotion_redemptions WHERE session_id=$1',[net.sessionId])).rows[0].n),promotionsAfterDeletion:deleted.appliedPromotions.length,totalAfterDeletion:deleted.validBillTotal});
 // Readiness accepts an empty migration table as schema-ready.
 await query('ALTER TABLE schema_migrations RENAME TO review_schema_migrations');
 const readiness=await fetch(base+'/health/readiness');record('R7-readiness',{migrationTableMissing:true,status:readiness.status});
 await query('ALTER TABLE review_schema_migrations RENAME TO schema_migrations');
}catch(e){evidence.error={message:e.message,code:e.code};process.stdout.write(JSON.stringify(evidence.error)+'\n');process.exitCode=1;}
finally{if(server)await new Promise(r=>server.close(r));if(pool)await pool.end();await cleanup();writeFileSync('../docs/audits/CORE_HANDOFF_REVIEW_EVIDENCE.json',JSON.stringify(evidence,null,2));}
