// Local-only audit evidence. Run from backend with NODE_ENV=test node --import tsx scripts/audit-2026-10-20.mjs
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import http from 'node:http';
process.env.NODE_ENV = 'test';
const { default: setup } = await import('../src/tests/setup-database.ts');
const source = new URL(process.env.TEST_DATABASE_ADMIN_URL || process.env.DATABASE_URL || 'postgres://admin:@localhost:5432/qr_order_db');
if (!['localhost','127.0.0.1','::1','[::1]'].includes(source.hostname)) throw new Error('Local PostgreSQL required');
const cleanup = await setup();
let pool, server;
const evidence = { head: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), date:'2026-10-20', scope:'isolated local DB + HTTP', cases:[] };
const check = (id,data) => { evidence.cases.push({id,...data}); console.log(JSON.stringify({id,...data})); };
try {
 const db = await import('../src/db/pool.ts'); pool=db.pool; const { query }=db;
 const { GuestService:G }=await import('../src/modules/guest/guest.service.ts');
 const { StaffService:S }=await import('../src/modules/staff/staff.service.ts');
 const { CmsService:C }=await import('../src/modules/cms/cms.service.ts');
 const { ensureSchemaOnBoot }=await import('../src/db/auto-migrate.ts');
 const { migrate }=await import('../src/db/migrate.ts');
 const {default:bcrypt}=await import('bcryptjs');
 const {app}=await import('../src/app.ts');
 server=http.createServer(app); await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/api/v1`;
 const tenant='11111111-1111-1111-1111-111111111111', manager='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const category=(await query('SELECT id FROM menu_categories WHERE tenant_id=$1 LIMIT 1',[tenant])).rows[0].id;
 const api=async(path,token,body,method='POST')=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,body:await r.json()};};
 const hush=async fn=>{const log=console.log;console.log=()=>{};try{return await fn();}finally{console.log=log;}};
 const item=async(name,price)=>(await query('INSERT INTO menu_items (tenant_id,category_id,name,price) VALUES ($1,$2,$3,$4) RETURNING id',[tenant,category,name,price])).rows[0].id;
 const session=async()=>{const qr=`audit-${randomUUID()}`;const table=(await query('INSERT INTO tables (tenant_id,table_number,public_qr_id) VALUES ($1,$2,$3) RETURNING id',[tenant,qr,qr])).rows[0].id;return{table,sessionId:(await S.openSession(tenant,table,manager)).sessionId};};
 const order=(s,id,quantity,optionIds)=>G.createOrder(tenant,s.sessionId,s.table,{idempotencyKey:randomUUID(),items:[{menuItemId:id,quantity,...(optionIds?{optionIds}:{})}]});
 const served=async s=>{await S.acceptAllPending(tenant,s.sessionId,manager);await S.serveAllAccepted(tenant,s.sessionId,manager);};
 const clearPromos=()=>query('UPDATE promotions SET is_active=false');
 const secure=randomBytes(48).toString('hex');
 await query('UPDATE users SET password_hash=$1 WHERE is_platform_admin=true',[await bcrypt.hash(secure,10)]);
 await hush(ensureSchemaOnBoot);
 let hash=(await query('SELECT password_hash FROM users WHERE is_platform_admin=true LIMIT 1')).rows[0].password_hash;
 const afterBoot=await bcrypt.compare(secure,hash);
 await query('UPDATE users SET password_hash=$1 WHERE is_platform_admin=true',[await bcrypt.hash(secure,10)]);
 await hush(migrate);
 hash=(await query('SELECT password_hash FROM users WHERE is_platform_admin=true LIMIT 1')).rows[0].password_hash;
 check('SEC-01',{strongPasswordPreservedAfterBoot:afterBoot,strongPasswordPreservedAfterMigration:await bcrypt.compare(secure,hash)});
 await clearPromos();
 const a=await item('Audit A',60000),b=await item('Audit B',10000);
 const group=(await query("INSERT INTO item_option_groups (tenant_id,menu_item_id,name,selection_mode,min_selections,max_selections) VALUES ($1,$2,'Required single','SINGLE',1,1) RETURNING id",[tenant,b])).rows[0].id;
 const options=[];for(const delta of [1000,2000]) options.push((await query('INSERT INTO item_options (tenant_id,group_id,menu_item_id,name,price_delta) VALUES ($1,$2,$3,$4,$5) RETURNING id',[tenant,group,b,`Option ${delta}`,delta])).rows[0].id);
 const cross=await order(await session(),a,1,[options[0]]);
 const missing=await order(await session(),b,1,[]);
 const many=await order(await session(),b,1,options);
 const unknown=await order(await session(),b,1,[randomUUID()]);
 await query('UPDATE item_option_groups SET is_active=false WHERE id=$1',[group]);
 const inactive=await order(await session(),b,1,[options[0]]);
 check('BUS-01',{optionFromDifferentItemAccepted:cross.subtotal===61000,missingRequiredOptionAccepted:!!missing.orderId,twoChoicesForSingleGroupAccepted:many.subtotal===13000,unknownOptionIgnored:!!unknown.orderId,inactiveGroupAccepted:!!inactive.orderId});
 await clearPromos();
 await C.createPromotion(tenant,{title:'Session discount',discountType:'FIXED_AMOUNT',discountValue:20000,minOrderAmount:100000});
 const split=await session();const first=await order(split,a,2);await order(split,a,2);await served(split);
 const splitBill=await G.getBillSummary(tenant,split.sessionId);
 check('BUS-02',{orderStillReceivesDiscount:first.discountTotal,rawSessionAmount:240000,sessionBill:splitBill.validBillTotal,expectedSingleSessionDiscountBill:220000});
 await clearPromos();
 const limited=await C.createPromotion(tenant,{title:'One redemption',discountType:'FIXED_AMOUNT',discountValue:20000,minOrderAmount:100000,maxRedemptions:1});
 const historic=await session();await order(historic,a,1);await order(historic,a,1);await served(historic);
 const before=await G.getBillSummary(tenant,historic.sessionId);
 const paid=await S.confirmPaymentAndCloseSession(tenant,historic.sessionId,before.settlementVersion,manager);
 const after=await G.getBillSummary(tenant,historic.sessionId);
 const lines=await query('SELECT SUM(bl.subtotal) AS amount FROM bill_lines bl JOIN bills b ON b.id=bl.bill_id WHERE b.session_id=$1',[historic.sessionId]);
 const redemptions=await query('SELECT count(*) AS count FROM promotion_redemptions WHERE promotion_id=$1',[limited.id]);
 check('BUS-03',{summaryBeforePayment:before.validBillTotal,settledAmount:paid.totalAmount,immutableBillLinesAmount:Number(lines.rows[0].amount),summaryAfterPayment:after.validBillTotal,redemptionAuditRows:Number(redemptions.rows[0].count)});
 await clearPromos();
 await C.createPromotion(tenant,{title:'Changes after summary',discountType:'FIXED_AMOUNT',discountValue:20000,minOrderAmount:100000});
 const changed=await session();await order(changed,a,1);await order(changed,a,1);await served(changed);
 const preview=await G.getBillSummary(tenant,changed.sessionId);await clearPromos();
 const changedPaid=await S.confirmPaymentAndCloseSession(tenant,changed.sessionId,preview.settlementVersion,manager);
 check('BUS-04',{displayedAmount:preview.validBillTotal,paidWithSameSettlementVersion:changedPaid.totalAmount,conflictRejected:false});
 const login=await api('/auth/login',null,{email:'admin@phoco.vn',password:'123456'});
 if(login.status!==200)throw new Error('Local demo login failed');
 const token=login.body.token;
 const reports=await api('/staff/reports/summary',token,undefined,'GET');
 check('BUS-05',{recordedSettledRevenue:reports.body.metrics?.totalConfirmedAmount,topItemNetTotals:reports.body.topServedItems?.map(r=>({name:r.item_name,amount:Number(r.total_amount)}))});
 // Closed tables currently cascade-delete immutable financial history.
 const deleted=await api(`/staff/tables/${historic.table}`,token,undefined,'DELETE');
 const remaining=(await query('SELECT COUNT(*) AS count FROM bills WHERE session_id=$1',[historic.sessionId])).rows[0].count;
 const revisedReports=await api('/staff/reports/summary',token,undefined,'GET');
 check('DATA-01',{deleteClosedTableStatus:deleted.status,billsRemainingForSettledSession:Number(remaining),revenueBeforeDelete:reports.body.metrics.totalConfirmedAmount,revenueAfterDelete:revisedReports.body.metrics.totalConfirmedAmount,deletedSessionItemReportAmount:reports.body.topServedItems.reduce((s,r)=>s+Number(r.total_amount),0)-revisedReports.body.topServedItems.reduce((s,r)=>s+Number(r.total_amount),0),deletedSessionSettledAmount:paid.totalAmount});
 // Hold the promotion UPDATE briefly to expose cross-session cap races deterministically.
 await clearPromos();
 const cap=await C.createPromotion(tenant,{title:'Concurrent cap',discountType:'FIXED_AMOUNT',discountValue:20000,minOrderAmount:100000,maxRedemptions:1});
 const contenders=[await session(),await session()];
 for(const s of contenders){await order(s,a,1);await order(s,a,1);await served(s);}
 const summaries=await Promise.all(contenders.map(s=>G.getBillSummary(tenant,s.sessionId)));
 await query(`CREATE FUNCTION audit_pause_promo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.5); RETURN NEW; END $$`);
 await query(`CREATE TRIGGER audit_pause_promo BEFORE UPDATE ON promotions FOR EACH ROW EXECUTE FUNCTION audit_pause_promo()`);
 const settlements=await Promise.allSettled(contenders.map((s,i)=>S.confirmPaymentAndCloseSession(tenant,s.sessionId,summaries[i].settlementVersion,manager)));
 const actual=(await query('SELECT current_redemptions FROM promotions WHERE id=$1',[cap.id])).rows[0].current_redemptions;
 check('BUS-06',{maxRedemptions:1,successfulSettlements:settlements.filter(r=>r.status==='fulfilled').length,currentRedemptions:actual});
 check('BASELINE',{managerDashboardStatus:(await api('/staff/dashboard/snapshot',token,undefined,'GET')).status,reportsStatus:reports.status});
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const child=spawn(process.execPath,['dist/server.js'],{env:{...process.env,NODE_ENV:'test',PORT:String(port),DATABASE_URL:'postgres://audit@127.0.0.1:1/audit'},stdio:['ignore','pipe','pipe']});
 try{
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Startup probe timeout')),10000);child.stdout.on('data',data=>{if(data.toString().includes('running on')){clearTimeout(timer);resolve();}});child.on('exit',code=>{clearTimeout(timer);reject(new Error(`Probe exited: ${code}`));});});
   const health=await fetch(`http://127.0.0.1:${port}/health`);
   check('OPS-01',{databaseUnavailable:true,serverStarted:true,healthStatus:health.status});
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}

} catch(err) {evidence.error={name:err.name,message:err.message,code:err.code};console.error(JSON.stringify(evidence.error));process.exitCode=1;}
finally {if(server)await new Promise(r=>server.close(r));if(pool)await pool.end();await cleanup();writeFileSync('../docs/audits/2026-10-20-evidence.json',JSON.stringify(evidence,null,2)+'\n');}
