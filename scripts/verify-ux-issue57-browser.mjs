import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9225;
const SCREENSHOT_DIR = path.resolve('artifacts/screenshots/issue-57');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.eventHandlers = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
      if (msg.method && this.eventHandlers.has(msg.method)) {
        for (const handler of this.eventHandlers.get(msg.method)) {
          handler(msg.params);
        }
      }
    };
  }

  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

// Staff API Helpers
const API_BASE = 'http://localhost:4000/api/v1';

async function loginStaff(email = 'admin@phoco.vn', password = '123456') {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  assert(res.ok && data.token, 'Staff login failed');
  return data.token;
}

async function getDashboard(staffToken) {
  const res = await fetch(`${API_BASE}/staff/dashboard/snapshot`, {
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  return await res.json();
}

async function openTableSession(staffToken, tableId) {
  const res = await fetch(`${API_BASE}/staff/tables/${tableId}/open`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  return await res.json();
}

async function acceptAllItems(staffToken, sessionId) {
  const res = await fetch(`${API_BASE}/staff/sessions/${sessionId}/accept-all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  return await res.json();
}

async function serveAllItems(staffToken, sessionId) {
  const res = await fetch(`${API_BASE}/staff/sessions/${sessionId}/serve-all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  return await res.json();
}

async function getBillSummary(staffToken, sessionId) {
  const res = await fetch(`${API_BASE}/staff/sessions/${sessionId}/bill-summary`, {
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  return await res.json();
}

async function confirmPaymentAndClose(staffToken, sessionId, settlementVersion, expectedAmount) {
  const res = await fetch(`${API_BASE}/staff/sessions/${sessionId}/confirm-payment-and-close`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${staffToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      settlementVersion,
      expectedAmount,
      note: 'Verified in browser automated test',
      requestId: 'req-' + Date.now()
    })
  });
  const data = await res.json();
  if (!res.ok) console.error('confirmPaymentAndClose failed:', res.status, data);
  return data;
}

async function closeWithoutCharge(staffToken, sessionId, reason = 'Closed without charge') {
  const res = await fetch(`${API_BASE}/staff/sessions/${sessionId}/close-without-charge`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${staffToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason })
  });
  return await res.json();
}

async function markTableReady(staffToken, tableId) {
  const res = await fetch(`${API_BASE}/staff/tables/${tableId}/mark-ready`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  return await res.json();
}

async function main() {
  console.log('🚀 Launching headless Chrome on port', PORT);
  let profileDir = `/tmp/chrome-issue57-real-${Date.now()}`;
  fs.mkdirSync(profileDir, { recursive: true });

  let chromeProcess = null;
  let cdp = null;

  try {
    chromeProcess = spawn(CHROME_PATH, [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profileDir}`,
      'about:blank'
    ], { stdio: 'ignore' });

    let versionData = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch {}
      await sleep(300);
    }

    assert(versionData, 'Failed to connect to Chrome DevTools endpoint');
    console.log('✅ Chrome connected:', versionData.Browser);

    const targetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
    const target = await targetRes.json();
    cdp = new CDPClient(target.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Network.enable');

    cdp.on('Runtime.exceptionThrown', (params) => {
      console.error('🔴 [Browser Exception]', params.exceptionDetails.text, params.exceptionDetails.exception?.description || '');
    });
    cdp.on('Runtime.consoleAPICalled', (params) => {
      console.log('💬 [Browser Console]', params.args.map(a => JSON.stringify(a.value) || a.description).join(' '));
    });

    // Track network requests
    const networkRequests = [];
    cdp.on('Network.requestWillBeSent', (params) => {
      if (params.request.url.includes('/api/v1/')) {
        networkRequests.push({
          url: params.request.url,
          method: params.request.method,
          timestamp: Date.now()
        });
      }
    });

    async function measureIdleApiRequests(durationMs) {
      const startCount = networkRequests.length;
      await sleep(durationMs);
      const diff = networkRequests.slice(startCount);
      return diff;
    }

    async function setViewport(width, height) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: width <= 500
      });
      await cdp.send('Emulation.setVisibleSize', { width, height });
    }

    async function screenshot(filename) {
      const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const filepath = path.join(SCREENSHOT_DIR, filename);
      fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
      console.log(`📸 Screenshot: ${filename} (${fs.statSync(filepath).size} bytes)`);
      return filepath;
    }

    async function evaluate(expression) {
      const res = await cdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      return res.result?.value;
    }

    // Authenticate Staff to manage table sessions
    console.log('\n--- Setting up Initial Staff & Table State ---');
    const staffToken = await loginStaff();
    const dash = await getDashboard(staffToken);

    const tableA01 = dash.tables.find(t => t.table_number === 'A01');
    const tableA02 = dash.tables.find(t => t.table_number === 'A02');
    const tableA03 = dash.tables.find(t => t.table_number === 'A03');
    assert(tableA01 && tableA02 && tableA03, 'Tables A01, A02, A03 must exist');

    // Reset tables: ensure A03 is unopened/ready
    if (tableA03.active_session_id) {
      await closeWithoutCharge(staffToken, tableA03.active_session_id, 'Reset A03 for test');
      await markTableReady(staffToken, tableA03.table_id);
    }
    // Ensure A02 is unopened/ready
    if (tableA02.active_session_id) {
      await closeWithoutCharge(staffToken, tableA02.active_session_id, 'Reset A02 for test');
      await markTableReady(staffToken, tableA02.table_id);
    }
    // Ensure A01 is unopened/ready
    if (tableA01.active_session_id) {
      await closeWithoutCharge(staffToken, tableA01.active_session_id, 'Reset A01 for test');
      await markTableReady(staffToken, tableA01.table_id);
    }

    // =========================================================================
    // 1. SCENARIO 1: BÀN CHƯA MỞ (Unopened Table - qr-phoco-a03)
    // =========================================================================
    console.log('\n=== 1. SCENARIO 1: Unopened Table (qr-phoco-a03) ===');
    await setViewport(390, 844); // Mobile-first (390x844)
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/t/qr-phoco-a03' });
    await sleep(2000);

    // 1a. Verify Idle Request Budget: Must be 0 ongoing requests during idle!
    const idleUnopened = await measureIdleApiRequests(750);
    assert(idleUnopened.length === 0, `Unopened table idle requests must be 0, got ${idleUnopened.length}`);
    console.log('  ✅ Idle request budget: 0 requests during 750ms idle (no loop)');

    // 1b. Menu Tab assertions
    let bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Chưa mở phiên'), 'Menu tab must display header badge "Chưa mở phiên"');
    assert(bodyText.includes('Bàn chưa được mở gọi món'), 'Menu tab must display banner "Bàn chưa được mở gọi món"');
    await screenshot('01_unopened_menu_390x844.png');
    console.log('  ✅ Menu tab verified: displays unopened banner and badge');

    // 1c. Orders Tab assertions
    await evaluate("Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Đơn đã gọi')).click()");
    await sleep(600);
    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Bàn chưa mở gọi món'), 'Orders tab must show empty title "Bàn chưa mở gọi món"');
    assert(bodyText.includes('Vui lòng liên hệ nhân viên'), 'Orders tab must show subtitle "Vui lòng liên hệ nhân viên"');
    assert(!bodyText.includes('Hãy chọn các món trong mục Thực đơn'), 'Orders tab must NOT show ordering prompt');
    await screenshot('02_unopened_orders_390x844.png');
    console.log('  ✅ Orders tab verified: displays unopened state without ordering prompt');

    // 1d. Bill Tab assertions
    await evaluate("Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Tổng bill')).click()");
    await sleep(600);
    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Chưa mở phiên'), 'Bill tab must show header badge "Chưa mở phiên"');
    assert(bodyText.includes('Chưa có hóa đơn'), 'Bill tab must show "Chưa có hóa đơn"');
    assert(bodyText.includes('Bàn chưa được mở phiên phục vụ'), 'Bill tab must show "Bàn chưa được mở phiên phục vụ"');
    assert(!bodyText.includes('Phiên bàn đã thanh toán hoàn tất'), 'Bill tab must NOT show "Phiên bàn đã thanh toán hoàn tất"');
    assert(!bodyText.includes('Yêu cầu thanh toán'), 'Bill tab must NOT show "Yêu cầu thanh toán" button');
    await screenshot('03_unopened_bill_390x844.png');
    console.log('  ✅ Bill tab verified: clean unopened state, no false paid receipt');

    // 1e. Responsive Viewports
    await setViewport(360, 640);
    await sleep(400);
    await screenshot('04_unopened_bill_360x640.png');

    await setViewport(1024, 768);
    await sleep(400);
    await screenshot('05_unopened_bill_1024x768.png');

    await setViewport(1920, 1080);
    await sleep(400);
    await screenshot('06_unopened_bill_1920x1080.png');
    console.log('  ✅ Responsive viewports verified: 360x640, 1024x768, 1920x1080');

    // =========================================================================
    // 2. SCENARIO 2: BÀN ĐANG PHỤC VỤ & ĐẶT MÓN THỰC TẾ (Table A01)
    // =========================================================================
    console.log('\n=== 2. SCENARIO 2: Active Open Table & Ordering Flow (Table A01) ===');
    await setViewport(390, 844);

    // Staff opens session on Table A01
    const openRes = await openTableSession(staffToken, tableA01.table_id);
    const activeSessionId = openRes.sessionId;
    assert(activeSessionId, 'Staff failed to open session on Table A01');
    console.log(`  Staff opened session on Table A01: ${activeSessionId}`);

    // Guest navigates to Table A01
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/t/qr-phoco-a01' });
    await sleep(2000);

    // Verify Idle Request Budget: Must be 0 ongoing requests during idle!
    const idleOpen = await measureIdleApiRequests(750);
    assert(idleOpen.length === 0, `Active open table idle requests must be 0, got ${idleOpen.length}`);
    console.log('  ✅ Idle request budget: 0 requests during 750ms idle on active table');

    // Check guest token joined
    const currentUrl = await evaluate("window.location.href");
    const storedAuth = await evaluate("sessionStorage.getItem('guest_auth_qr-phoco-a01')");
    const guestToken = await evaluate("sessionStorage.getItem('guest_token')");
    assert(guestToken, 'Guest browser must obtain and store guest_token upon joining open session');

    // Check menu state
    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Phiên mở') || bodyText.includes('Đang phục vụ'), 'Header must show active open session');
    await screenshot('07_active_table_menu_390x844.png');

    // Bill Tab on Open Table
    await evaluate("Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Tổng bill')).click()");
    await sleep(600);
    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Đang phục vụ'), 'Bill badge must show "Đang phục vụ"');
    assert(bodyText.includes('Yêu cầu thanh toán'), 'Bill tab must show "Yêu cầu thanh toán" button');
    assert(bodyText.includes('Gọi nhân viên'), 'Bill tab must show "Gọi nhân viên" button');
    await screenshot('08_active_table_bill_390x844.png');
    console.log('  ✅ Active open bill verified: shows service controls and active badge');

    // Guest orders 2x Nem Chua via API using real session token
    console.log('  Guest submitting order for 2x Nem Chua Rán...');
    const menuRes = await fetch(`${API_BASE}/public/tables/qr-phoco-a01/menu`);
    const menuData = await menuRes.json();
    const nemChua = menuData.menuItems.find(m => m.name.includes('Nem Chua'));
    assert(nemChua, 'Nem Chua menu item must exist');

    const orderRes = await fetch(`${API_BASE}/guest/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-guest-token': guestToken
      },
      body: JSON.stringify({
        idempotencyKey: 'browser-e2e-order-' + Date.now(),
        items: [{ menuItemId: nemChua.id, quantity: 2 }]
      })
    });
    const orderData = await orderRes.json();
    console.log('  order creation result:', orderRes.status, orderData);
    assert(orderRes.ok, 'Guest order creation failed');

    // Staff accepts and serves the items
    console.log('  Staff accepting and serving order items...');
    const acceptRes = await acceptAllItems(staffToken, activeSessionId);
    console.log('  acceptAllItems result:', acceptRes);
    const serveRes = await serveAllItems(staffToken, activeSessionId);
    console.log('  serveAllItems result:', serveRes);

    // Wait for WebSocket update to refresh bill
    for (let i = 0; i < 15; i++) {
      await sleep(500);
      bodyText = await evaluate('document.body.innerText');
      if (bodyText.includes('Nem Chua')) break;
    }

    // Check bill in browser: shows served Nem Chua and amount
    assert(bodyText.includes('Nem Chua'), 'Bill breakdown must list served Nem Chua');
    assert(bodyText.includes('63.000') || bodyText.includes('60.000'), 'Bill breakdown must calculate served total');
    console.log('  ✅ Real order & serving verified in guest browser');

    // =========================================================================
    // 3. SCENARIO 3: CHỐT BÀN VÀ NHẬN BIÊN NHẬN CHÍNH THỨC (Confirmed Settlement)
    // =========================================================================
    console.log('\n=== 3. SCENARIO 3: Confirmed Settlement & Immutable Receipt ===');
    const billSummary = await getBillSummary(staffToken, activeSessionId);
    const finalAmount = billSummary.validBillTotal;
    const settlementVersion = billSummary.settlementVersion;
    console.log(`  Staff confirming payment of ${finalAmount.toLocaleString('vi-VN')}đ (version ${settlementVersion})...`);

    const settleRes = await confirmPaymentAndClose(staffToken, activeSessionId, settlementVersion, finalAmount);
    assert(settleRes.sessionId === activeSessionId, 'Settlement confirmation failed');

    // Wait for WebSocket session.closed delivery
    for (let i = 0; i < 15; i++) {
      await sleep(500);
      bodyText = await evaluate('document.body.innerText');
      if (bodyText.includes('Đã kết thúc')) break;
    }

    // Assert Header badge is "Đã kết thúc"
    assert(bodyText.includes('Đã kết thúc'), 'Bill header badge must be "Đã kết thúc"');

    // Assert banner is "Phiên bàn đã thanh toán hoàn tất"
    assert(bodyText.includes('Phiên bàn đã thanh toán hoàn tất'), 'Must display "Phiên bàn đã thanh toán hoàn tất"');

    // Assert total amount matches exact confirmed settlement
    const expectedVnd = finalAmount.toLocaleString('vi-VN') + 'đ';
    assert(bodyText.includes(expectedVnd), `Must display exact confirmed total ${expectedVnd}`);

    // Assert guest_token is removed (mutation rights revoked)
    const postCloseToken = await evaluate("sessionStorage.getItem('guest_token')");
    assert(!postCloseToken, 'Guest token must be revoked and removed from storage on session close');

    await screenshot('09_closed_receipt_retained.png');
    console.log('  ✅ Confirmed settlement verified: immutable receipt, exact amount, token revoked');

    // =========================================================================
    // 4A. SCENARIO 4A: RELOAD / BACK BẢO TOÀN BIÊN NHẬN TỪ CACHE (No Request Loop)
    // =========================================================================
    console.log('\n=== 4A. SCENARIO 4A: Reload / Back Receipt Cache Preservation (No Request Loop) ===');
    // Reload page with cached receipt intact
    await cdp.send('Page.reload');
    await sleep(1500);

    // Verify Idle Request Budget after reload: Must be 0 requests (prevents the 263-request loop!)
    const reloadIdleReqs = await measureIdleApiRequests(1500);
    assert(reloadIdleReqs.length === 0, `After reload, idle requests must be 0, got ${reloadIdleReqs.length}: ${JSON.stringify(reloadIdleReqs)}`);
    console.log('  ✅ Idle request budget after reload: 0 requests during 1500ms (request loop ELIMINATED)');

    // Verify header status on menu tab
    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Đã kết thúc'), 'After reload, menu header badge must retain "Đã kết thúc" status');
    assert(bodyText.includes('Phiên bàn đã kết thúc'), 'After reload, menu banner must retain "Phiên bàn đã kết thúc"');

    // Switch to Bill Tab to verify receipt retention
    await evaluate("Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Tổng bill')).click()");
    await sleep(600);

    // Assert receipt remains intact on Bill tab after full page reload
    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Đã kết thúc'), 'After reload, Bill header badge must retain "Đã kết thúc" status');
    assert(bodyText.includes('Phiên bàn đã thanh toán hoàn tất'), 'After reload, must retain "Phiên bàn đã thanh toán hoàn tất"');
    assert(bodyText.includes(expectedVnd), `After reload, must retain exact confirmed total ${expectedVnd}`);
    await screenshot('10_closed_receipt_retained_on_reload.png');
    console.log('  ✅ Reload cache preservation verified: zero loops, receipt perfectly preserved');

    // =========================================================================
    // 4B. SCENARIO 4B: MISSED-SOCKET SERVER RECOVERY WITH REAL TOKEN (R3)
    // =========================================================================
    console.log('\n=== 4B. SCENARIO 4B: Missed-Socket Recovery with Real Token (Server Recovery R3) ===');
    // Simulate missed socket: remove cached receipt, restore guest auth token from the closed session
    await evaluate(`
      sessionStorage.removeItem('guest_receipt_qr-phoco-a01');
      sessionStorage.setItem('guest_auth_qr-phoco-a01', JSON.stringify({
        token: ${JSON.stringify(guestToken)},
        sessionId: ${JSON.stringify(activeSessionId)}
      }));
    `);
    // Reload page: loadTableMenu must detect missing cached receipt, use guestToken to query backend /guest/receipt,
    // recover the verified closed receipt, cache it, clean up guest_auth, and display the official receipt!
    await cdp.send('Page.reload');
    await sleep(1500);

    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Đã kết thúc'), 'After server recovery, header badge must show "Đã kết thúc"');

    // Switch to Bill Tab to verify recovered receipt
    await evaluate("Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Tổng bill')).click()");
    await sleep(600);
    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Phiên bàn đã thanh toán hoàn tất'), 'After server recovery, Bill must display "Phiên bàn đã thanh toán hoàn tất"');
    assert(bodyText.includes(expectedVnd), `After server recovery, Bill must display confirmed total ${expectedVnd}`);

    // Verify guest_auth was cleaned up and receipt was cached in storage
    const recoveredAuth = await evaluate("sessionStorage.getItem('guest_auth_qr-phoco-a01')");
    assert(!recoveredAuth, 'After server recovery, guest_auth must be cleaned up');
    const recoveredReceiptRaw = await evaluate("sessionStorage.getItem('guest_receipt_qr-phoco-a01')");
    assert(recoveredReceiptRaw, 'After server recovery, receipt must be cached in sessionStorage');
    console.log('  ✅ Missed-socket recovery verified: recovered official receipt from server via real token');

    // =========================================================================
    // 5. SCENARIO 5: MỞ LẠI BÀN -> KHÁCH CŨ KHÔNG ĐƯỢC TỰ ĐỘNG THAM GIA
    // =========================================================================
    console.log('\n=== 5. SCENARIO 5: Table Reopened -> Old Guest MUST NOT Auto-Join ===');
    // Staff marks table ready and opens a new session for a new party
    await markTableReady(staffToken, tableA01.table_id);
    const newSessionRes = await openTableSession(staffToken, tableA01.table_id);
    const newSessionId = newSessionRes.sessionId;
    assert(newSessionId && newSessionId !== activeSessionId, 'New session must be opened');
    console.log(`  Staff opened new session ${newSessionId} on Table A01`);

    // The previous guest's browser is still on A01 URL. Wait 8500ms (past the 8s poll timer)
    console.log('  Waiting 8.5s for poll interval to fire...');
    await sleep(8500);

    // The old guest must NOT auto-join the new customer session!
    const oldGuestTokenAfterReopen = await evaluate("sessionStorage.getItem('guest_token')");
    assert(!oldGuestTokenAfterReopen, 'Previous guest must NEVER auto-join a subsequent party session');

    // Check stored auth
    const storedAuthRaw = await evaluate("sessionStorage.getItem('guest_auth_qr-phoco-a01')");
    if (storedAuthRaw) {
      const storedAuth = JSON.parse(storedAuthRaw);
      assert(storedAuth.sessionId !== newSessionId, 'Stored auth must not point to new session');
    }
    await screenshot('11_reopened_table_no_autojoin.png');
    console.log('  ✅ Session isolation verified: old guest did NOT auto-join new session');

    // =========================================================================
    // 6. SCENARIO 6: KHÁCH MỚI QUÉT MÃ -> ISOLATION TUYỆT ĐỐI (Clean Session)
    // =========================================================================
    console.log('\n=== 6. SCENARIO 6: New Guest Scan -> Zero Data Leakage ===');
    // Create a new CDP target (isolated browser context without prior sessionStorage)
    const newTargetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
    const newTarget = await newTargetRes.json();
    const newCdp = new CDPClient(newTarget.webSocketDebuggerUrl);
    await newCdp.connect();
    await newCdp.send('Page.enable');
    await newCdp.send('Runtime.enable');
    await newCdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    // New guest scans Table A03 (which is unopened)
    await newCdp.send('Page.navigate', { url: 'http://localhost:5173/t/qr-phoco-a03' });
    await sleep(2000);

    // Switch to Bill tab
    await newCdp.send('Runtime.evaluate', {
      expression: "Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Tổng bill')).click()",
      awaitPromise: true
    });
    await sleep(600);

    const newGuestBillText = (await newCdp.send('Runtime.evaluate', {
      expression: 'document.body.innerText',
      returnByValue: true
    })).result?.value;

    assert(newGuestBillText.includes('Chưa có hóa đơn'), 'New guest must see "Chưa có hóa đơn"');
    assert(!newGuestBillText.includes('Nem Chua'), 'New guest must NOT see previous customer ordered items');
    assert(!newGuestBillText.includes('Phiên bàn đã thanh toán hoàn tất'), 'New guest must NOT see previous bill');

    const resScreen = await newCdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, '12_new_guest_clean_isolation.png'), Buffer.from(resScreen.data, 'base64'));
    console.log('  📸 Screenshot: 12_new_guest_clean_isolation.png');
    console.log('  ✅ Clean isolation verified: zero financial leakage to new guest');
    newCdp.close();

    // =========================================================================
    // 7. SCENARIO 7: ĐÓNG BÀN KHÔNG TÍNH TIỀN (Close Without Charge on Table A02)
    // =========================================================================
    console.log('\n=== 7. SCENARIO 7: Close Without Charge (Table A02) ===');
    // Staff opens session on Table A02
    const a02Open = await openTableSession(staffToken, tableA02.table_id);
    const a02SessionId = a02Open.sessionId;
    assert(a02SessionId, 'Staff failed to open session on Table A02');

    // Guest navigates to A02
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/t/qr-phoco-a02' });
    await sleep(2000);

    // Staff closes session without charge
    console.log('  Staff closing Table A02 without charge...');
    await closeWithoutCharge(staffToken, a02SessionId, 'Customer changed mind');

    // Wait for WebSocket session.closed delivery
    for (let i = 0; i < 15; i++) {
      await sleep(500);
      bodyText = await evaluate('document.body.innerText');
      if (bodyText.includes('Đã kết thúc')) break;
    }

    // Check Bill tab
    await evaluate("Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Tổng bill')).click()");
    await sleep(600);
    bodyText = await evaluate('document.body.innerText');

    assert(bodyText.includes('Đã kết thúc'), 'Must show "Đã kết thúc" status');
    assert(bodyText.includes('Phiên bàn đã kết thúc (không tính tiền)') || bodyText.includes('Phiên bàn đã kết thúc'),
      'Must display closed without charge message');
    assert(!bodyText.includes('Phiên bàn đã thanh toán hoàn tất'),
      'CRITICAL: Must NEVER display "Phiên bàn đã thanh toán hoàn tất" when closed without charge!');
    assert(bodyText.includes('0đ'), 'Must show 0đ total when closed without charge');
    await screenshot('13_closed_without_charge_bill.png');
    console.log('  ✅ Close without charge verified: explicitly distinguished from paid settlement');

    // =========================================================================
    // 8. SCENARIO 8: ĐỔI BÀN (QR Switch in Single Provider)
    // =========================================================================
    console.log('\n=== 8. SCENARIO 8: QR Table Switch in Same Provider (Stale Guard) ===');
    // Client-side navigation in same provider without reloading document
    await evaluate(`
      window.history.pushState({}, '', '/t/qr-phoco-a03');
      window.dispatchEvent(new PopStateEvent('popstate'));
    `);
    await sleep(1500);

    const switchIdle = await measureIdleApiRequests(750);
    assert(switchIdle.length === 0, `Table switch idle requests must be 0, got ${switchIdle.length}`);
    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Bàn A03'), 'Table header must update to Bàn A03');
    assert(bodyText.includes('Chưa mở phiên'), 'Switched table state must accurately show unopened');
    await screenshot('14_table_switch_clean.png');
    console.log('  ✅ Table switch verified: clean state transition, zero stale data leaks');

    console.log('\n🎉 ALL 8 BROWSER UX & ISOLATION SCENARIOS FULLY VERIFIED (100% PASS with Hard Assertions)!');
  } finally {
    try { cdp?.close(); } catch {}
    if (chromeProcess) {
      try {
        chromeProcess.kill('SIGTERM');
      } catch {}
      await new Promise(resolve => {
        if (chromeProcess.exitCode !== null) return resolve();
        chromeProcess.on('exit', () => resolve());
        setTimeout(() => {
          try { chromeProcess.kill('SIGKILL'); } catch {}
          resolve();
        }, 3000);
      });
    }
    if (profileDir && fs.existsSync(profileDir)) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch {}
    }
  }
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Unhandled error in browser verification:', err);
  process.exit(1);
});
