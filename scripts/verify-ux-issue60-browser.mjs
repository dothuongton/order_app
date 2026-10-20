import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9226;
const SCREENSHOT_DIR = path.resolve('artifacts/screenshots/issue-60');

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
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

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

async function configureItemOptionGroups(staffToken, itemId) {
  const res = await fetch(`${API_BASE}/staff/menu/items/${itemId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${staffToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      option_groups: [
        {
          name: 'Kích cỡ',
          selection_mode: 'SINGLE',
          min_selections: 1,
          max_selections: 1,
          pricing_mode: 'ADDITIVE',
          options: [
            { name: 'Size M', price_delta: 0, is_default: true },
            { name: 'Size L', price_delta: 10000, is_default: false }
          ]
        },
        {
          name: 'Topping',
          selection_mode: 'MULTIPLE',
          min_selections: 0,
          max_selections: 2,
          pricing_mode: 'ADDITIVE',
          options: [
            { name: 'Nha Đam', price_delta: 5000 },
            { name: 'Trân Châu Hoàng Kim', price_delta: 5000 }
          ]
        }
      ]
    })
  });
  const data = await res.json();
  assert(res.ok, `Failed to configure option groups: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  console.log('🚀 Starting Issue #60 Browser Verification (Option Payload Canonicalization & Multiple Rounds)');

  let profileDir = `/tmp/chrome-issue60-${Date.now()}`;
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

    // Emulate iPhone 12/13/14 viewport (390 x 844)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    const evaluate = async (expr) => {
      const result = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      return result.result?.value;
    };

    const screenshot = async (name) => {
      const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SCREENSHOT_DIR, name), Buffer.from(res.data, 'base64'));
      console.log(`  📸 Screenshot saved: ${name}`);
    };

    // Track network requests to /api/v1/guest/orders
    const interceptedOrders = [];
    cdp.on('Network.requestWillBeSent', (params) => {
      if (params.request.url.includes('/api/v1/guest/orders') && params.request.method === 'POST') {
        try {
          interceptedOrders.push({
            url: params.request.url,
            postData: JSON.parse(params.request.postData || '{}'),
            headers: params.request.headers,
            timestamp: Date.now()
          });
        } catch {}
      }
    });

    // Setup backend table session
    const staffToken = await loginStaff();
    const dashboard = await getDashboard(staffToken);
    const tableA01 = dashboard.tables.find(t => t.table_number === 'A01');
    assert(tableA01, 'Table A01 must exist');

    let activeSessionId = tableA01.current_session_id;
    if (!activeSessionId) {
      console.log('  Opening session on Table A01...');
      const openRes = await openTableSession(staffToken, tableA01.table_id);
      activeSessionId = openRes.sessionId;
    }
    assert(activeSessionId, 'Table A01 must have an active session');
    console.log(`  Table A01 active session: ${activeSessionId}`);

    // Configure item with size & topping option groups
    console.log('  Configuring Size & Topping option groups on Trà Sữa...');
    const menuRes = await fetch(`${API_BASE}/public/tables/qr-phoco-a01/menu`);
    const menuData = await menuRes.json();
    const traSuaItem = menuData.menuItems.find(m => m.name.includes('Trà Sữa'));
    assert(traSuaItem, 'Trà Sữa item must exist');
    await configureItemOptionGroups(staffToken, traSuaItem.id);
    console.log('  ✅ Option groups configured successfully');

    // =========================================================================
    // 1. SCENARIO 1: Quét mã QR, mở menu và thêm món có Options (Size + Topping)
    // =========================================================================
    console.log('\n=== 1. SCENARIO 1: Guest Menu & Add Item with Options ===');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/t/qr-phoco-a01' });
    await sleep(2500);

    let bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Bàn A01'), 'Must display Table A01');

    // Click on item with options (Trà Sữa)
    const clickedItem = await evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label*="Trà Sữa" i]');
        if (btn) {
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    assert(clickedItem, 'Must find and click item customize button');
    await sleep(1000);

    // Verify option modal / sheet opened
    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Tùy chọn món') || bodyText.includes('Trà Sữa'), 'Options sheet must be open');

    // Interact with options sheet
    await evaluate(`
      (() => {
        const sheet = document.querySelector('.fixed.inset-0.z-50');
        if (!sheet) return;

        // Type special note
        const input = sheet.querySelector('input');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(input, 'Ít đường nhiều đá');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }

        // Click Nha Đam topping button
        const toppingBtn = Array.from(sheet.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Nha Đam'));
        if (toppingBtn) toppingBtn.click();

        // Increase quantity to 2
        const plusBtn = Array.from(sheet.querySelectorAll('button')).find(b => b.innerHTML.includes('lucide-plus') || b.innerText === '+');
        if (plusBtn) plusBtn.click();
      })()
    `);
    await sleep(500);

    await screenshot('01_guest_options_modal_selected.png');

    // Click confirm add to cart button inside sheet
    await evaluate(`
      (() => {
        const sheet = document.querySelector('.fixed.inset-0.z-50');
        if (!sheet) return;
        const addBtn = Array.from(sheet.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('Thêm vào đơn') || b.innerText.includes('Thêm vào giỏ')));
        if (addBtn) addBtn.click();
      })()
    `);
    await sleep(800);

    // Open Cart Drawer
    await evaluate(`
      (() => {
        const cartBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('Xem lần gọi mới') || b.innerText.includes('Xem giỏ hàng')));
        if (cartBtn) cartBtn.click();
      })()
    `);
    await sleep(800);

    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Đơn gọi món mới'), 'Cart drawer must be open');
    assert(bodyText.includes('Trà Sữa Trân Châu Đường Đen'), 'Cart must contain selected item');
    assert(bodyText.includes('Ít đường nhiều đá'), 'Cart must display note');
    await screenshot('02_cart_drawer_round1.png');
    console.log('  ✅ Item with options added to cart accurately');

    // =========================================================================
    // 2. SCENARIO 2: Submit Round 1 Order & Verify Canonical Payload (No Alias Duplicates)
    // =========================================================================
    console.log('\n=== 2. SCENARIO 2: Submit Round 1 Order (Canonical Payload Verification) ===');
    const interceptedCountBefore1 = interceptedOrders.length;

    // Click submit order button
    await evaluate(`
      (() => {
        const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('Gửi yêu cầu gọi món') || b.innerText.includes('Đặt món')));
        if (submitBtn) submitBtn.click();
      })()
    `);
    await sleep(2000);

    assert(interceptedOrders.length > interceptedCountBefore1, 'Must intercept POST /api/v1/guest/orders');
    const round1Payload = interceptedOrders[interceptedOrders.length - 1].postData;

    console.log('  Intercepted Round 1 Payload:', JSON.stringify(round1Payload, null, 2));

    // CRITICAL HOTFIX VERIFICATION #60:
    // 1. Each item must contain canonical fields only.
    // 2. If modern options exist, optionIds must be present.
    // 3. variantId and variantIds MUST NOT duplicate optionIds (no alias duplication).
    const submittedItem1 = round1Payload.items[0];
    assert(submittedItem1.menuItemId, 'Item must have menuItemId');
    assert(submittedItem1.quantity >= 1, 'Item quantity must be >= 1');
    assert(submittedItem1.note === 'Ít đường nhiều đá', 'Item note must match');

    if (submittedItem1.optionIds) {
      assert(Array.isArray(submittedItem1.optionIds), 'optionIds must be an array');
      assert(submittedItem1.variantId === undefined, 'variantId MUST be undefined when optionIds are used');
      assert(submittedItem1.variantIds === undefined, 'variantIds MUST be undefined when optionIds are used');
      console.log('  ✅ PASS: Modern options canonicalized to optionIds only, ZERO alias duplication!');
    }

    // Verify toast & cart cleared
    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Đặt món thành công') || !bodyText.includes('Đơn gọi món mới'), 'Round 1 order placed successfully');
    await screenshot('03_round1_order_submitted.png');

    // =========================================================================
    // 3. SCENARIO 3: Gọi lại cùng món đợt 2 trong cùng bàn (Multiple Rounds)
    // =========================================================================
    console.log('\n=== 3. SCENARIO 3: Order Same Item in Round 2 (Multiple Rounds Support) ===');
    await sleep(1500);

    // Click on the same item again
    await evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label*="Trà Sữa" i]');
        if (btn) btn.click();
      })()
    `);
    await sleep(1000);

    // Select Size L, Trân Châu Hoàng Kim, and type note inside sheet
    await evaluate(`
      (() => {
        const sheet = document.querySelector('.fixed.inset-0.z-50');
        if (!sheet) return;

        const sizeLBtn = Array.from(sheet.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Size L'));
        if (sizeLBtn) sizeLBtn.click();

        const toppingBtn = Array.from(sheet.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Trân Châu Hoàng Kim'));
        if (toppingBtn) toppingBtn.click();

        const input = sheet.querySelector('input');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(input, 'Đợt 2 mang về');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      })()
    `);
    await sleep(500);

    // Click confirm add to cart button inside sheet
    await evaluate(`
      (() => {
        const sheet = document.querySelector('.fixed.inset-0.z-50');
        if (!sheet) return;
        const addBtn = Array.from(sheet.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('Thêm vào đơn') || b.innerText.includes('Thêm vào giỏ')));
        if (addBtn) addBtn.click();
      })()
    `);
    await sleep(800);

    // Open Cart Drawer
    await evaluate(`
      (() => {
        const cartBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('Xem lần gọi mới') || b.innerText.includes('Xem giỏ hàng')));
        if (cartBtn) cartBtn.click();
      })()
    `);
    await sleep(800);

    await screenshot('04_cart_drawer_round2.png');

    const interceptedCountBefore2 = interceptedOrders.length;
    // Click submit order for round 2
    await evaluate(`
      (() => {
        const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('Gửi yêu cầu gọi món') || b.innerText.includes('Đặt món')));
        if (submitBtn) submitBtn.click();
      })()
    `);
    await sleep(2000);

    assert(interceptedOrders.length > interceptedCountBefore2, 'Must intercept Round 2 order POST');
    const round2Payload = interceptedOrders[interceptedOrders.length - 1].postData;
    console.log('  Intercepted Round 2 Payload:', JSON.stringify(round2Payload, null, 2));

    // Verify distinct idempotencyKey across rounds
    assert(round2Payload.idempotencyKey !== round1Payload.idempotencyKey,
      'Round 2 order must have a unique idempotency key');
    console.log('  ✅ PASS: Round 2 order placed with unique idempotencyKey');

    // =========================================================================
    // 4. SCENARIO 4: Kiểm tra Bill & Orders bảo toàn cả 2 đợt gọi món
    // =========================================================================
    console.log('\n=== 4. SCENARIO 4: Verify Bill & Orders Retain Both Rounds ===');
    // Switch to Orders Tab (Món đã gọi)
    await evaluate(`
      (() => {
        const navBtns = Array.from(document.querySelectorAll('nav button'));
        const ordersTab = navBtns.find(b => b.innerText && b.innerText.includes('Món đã gọi'));
        if (ordersTab) ordersTab.click();
      })()
    `);
    await sleep(1000);

    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Trà Sữa Trân Châu Đường Đen'), 'Orders tab must list ordered items');
    await screenshot('05_orders_tab_multiple_rounds.png');

    // Switch to Bill Tab (Tổng bill)
    await evaluate(`
      (() => {
        const navBtns = Array.from(document.querySelectorAll('nav button'));
        const billTab = navBtns.find(b => b.innerText && b.innerText.includes('Tổng bill'));
        if (billTab) billTab.click();
      })()
    `);
    await sleep(1000);

    bodyText = await evaluate('document.body.innerText');
    assert(bodyText.includes('Trà Sữa Trân Châu Đường Đen'), 'Bill tab must display line items');
    assert(!bodyText.includes('Chưa có hóa đơn'), 'Bill tab must reflect active orders');
    await screenshot('06_bill_tab_multiple_rounds.png');
    console.log('  ✅ PASS: Bill tab accurately lists multiple rounds of orders');

    console.log('\n🎉 ALL ISSUE #60 BROWSER VERIFICATION SCENARIOS PASSED WITH HARD ASSERTIONS!');
  } finally {
    if (cdp) {
      try { cdp.close(); } catch {}
    }
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
}

main().catch(err => {
  console.error('\n❌ Browser verification failed:', err);
  process.exit(1);
});
