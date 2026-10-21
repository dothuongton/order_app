import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { Client } = require(path.join(ROOT_DIR, 'backend/node_modules/pg'));

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ||
  path.resolve('/Users/admin/.gemini/antigravity/brain/1af5de4a-254b-4323-abd3-b3906087bfbe/payment-regression');

try {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
} catch {
  SCREENSHOT_DIR = '/tmp/payment-regression-screenshots';
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const createdProfileDirs = [];

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

  off(event, handler) {
    if (!this.eventHandlers.has(event)) return;
    const handlers = this.eventHandlers.get(event);
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  removeAllListeners(event) {
    if (event) {
      this.eventHandlers.delete(event);
    } else {
      this.eventHandlers.clear();
    }
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error(`CDP command ${method} timed out after 5000ms`));
      }, 5000);
      this.callbacks.set(id, {
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

async function startChromeInstance(port, profileName) {
  const profileDir = `/tmp/chrome-pay-reg-${profileName}-${Date.now()}-${randomUUID().slice(0, 6)}`;
  fs.mkdirSync(profileDir, { recursive: true });
  createdProfileDirs.push(profileDir);

  const proc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let versionData = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        versionData = await res.json();
        break;
      }
    } catch {}
    await sleep(200);
  }
  assert(versionData, `Failed to connect to Chrome on port ${port}`);

  const targetRes = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await targetRes.json();
  const cdp = new CDPClient(target.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Network.enable');

  cdp.on('Page.javascriptDialogOpening', async (params) => {
    console.log(`  ⚠️ [Browser Dialog (${params.type})]: ${params.message}`);
    try {
      await cdp.send('Page.handleJavaScriptDialog', { accept: true });
    } catch {}
  });

  const evaluate = async (expr) => {
    const result = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(`Runtime.evaluate exception: ${result.exceptionDetails.text} - ${result.exceptionDetails.exception?.description || ''}`);
    }
    return result.result?.value;
  };

  const screenshot = async (name) => {
    const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const fullPath = path.join(SCREENSHOT_DIR, name);
    fs.writeFileSync(fullPath, Buffer.from(res.data, 'base64'));
    console.log(`  📸 Screenshot saved: ${name}`);
  };

  return { proc, cdp, evaluate, screenshot };
}

function getAdminDbUrl() {
  if (process.env.TEST_ADMIN_DATABASE_URL) {
    return process.env.TEST_ADMIN_DATABASE_URL;
  }
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      url.pathname = '/postgres';
      return url.toString();
    } catch {}
  }
  return 'postgres://admin:@localhost:5432/postgres';
}

function getTestDbUrl(testDbName) {
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      url.pathname = `/${testDbName}`;
      return url.toString();
    } catch {}
  }
  return `postgres://admin:@localhost:5432/${testDbName}`;
}

async function main() {
  console.log('🚀 Starting Isolated Browser Verification for Payment Lifecycle Regression (PR #114)');

  let adminClient = null;
  let testDbName = null;
  let testDbCreated = false;
  let dbClient = null;
  let backendProc = null;
  let frontendProc = null;
  let chromeStaff = null;

  try {
    testDbName = `qr_order_test_pay_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 6)}`;
    const adminDbUrl = getAdminDbUrl();
    adminClient = new Client({ connectionString: adminDbUrl });
    await adminClient.connect();

    console.log(`Creating isolated test DB: ${testDbName}`);
    await adminClient.query(`CREATE DATABASE "${testDbName}"`);
    testDbCreated = true;
    const testDbUrl = getTestDbUrl(testDbName);

    // Run migrations and seed
    execSync('node dist/db/migrate.js', {
      cwd: path.join(ROOT_DIR, 'backend'),
      env: { ...process.env, DATABASE_URL: testDbUrl, NODE_ENV: 'test' },
      stdio: 'pipe'
    });
    execSync('node dist/db/seed.js', {
      cwd: path.join(ROOT_DIR, 'backend'),
      env: { ...process.env, DATABASE_URL: testDbUrl, NODE_ENV: 'test' },
      stdio: 'pipe'
    });
    console.log(`✅ Migrated and seeded isolated test DB: ${testDbName}`);

    dbClient = new Client({ connectionString: testDbUrl });
    await dbClient.connect();

    // Launch Backend on Port 4020
    console.log('1️⃣ Launching backend on port 4020 with isolated test DB...');
    backendProc = spawn('node', ['dist/server.js'], {
      cwd: path.join(ROOT_DIR, 'backend'),
      env: {
        ...process.env,
        PORT: '4020',
        ORDERING_MODE: 'multi_device',
        FRONTEND_URL: 'http://localhost:5188',
        CORS_ORIGINS: 'http://localhost:5188',
        DATABASE_URL: testDbUrl,
        JWT_SECRET: 'test-jwt-secret-payment-reg-1234567890'
      },
      stdio: 'pipe'
    });

    backendProc.stdout.on('data', d => {
      const line = d.toString().trim();
      if (line && line.includes('Error')) console.log('  [backend]', line);
    });
    backendProc.stderr.on('data', d => console.error('  [backend err]', d.toString().trim()));

    let backendReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://localhost:4020/health');
        if (res.ok) {
          backendReady = true;
          break;
        }
      } catch {}
      await sleep(200);
    }
    assert(backendReady, 'Backend failed to start on port 4020');
    console.log('✅ Backend running on http://localhost:4020');

    // Launch Frontend on Port 5188 proxying to 4020
    console.log('2️⃣ Launching frontend on port 5188...');
    frontendProc = spawn('npx', ['vite', '--port', '5188', '--strictPort'], {
      cwd: path.join(ROOT_DIR, 'frontend'),
      env: {
        ...process.env,
        VITE_BACKEND_URL: 'http://localhost:4020'
      },
      stdio: 'pipe'
    });

    let frontendReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch('http://localhost:5188');
        if (res.ok) {
          frontendReady = true;
          break;
        }
      } catch {}
      await sleep(250);
    }
    assert(frontendReady, 'Frontend failed to start on port 5188');
    console.log('✅ Frontend running on http://localhost:5188');

    // Launch Chrome Staff
    console.log('3️⃣ Spawning Chrome for Staff Dashboard...');
    chromeStaff = await startChromeInstance(9240, 'staff');
    await chromeStaff.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Helper to get Table ID & Tenant ID for Pho Co
    const tableRes = await dbClient.query(`
      SELECT t.id, t.table_number, t.tenant_id
      FROM tables t
      JOIN tenants tn ON tn.id = t.tenant_id
      WHERE tn.slug = 'pho-co' AND t.table_number IN ('A01', 'A02', 'A03', 'B01')
      ORDER BY t.table_number
    `);
    const tables = {};
    for (const row of tableRes.rows) {
      tables[row.table_number] = row;
    }
    const tenantId = tables['A01'].tenant_id;

    // Helper to get a menu item
    const itemRes = await dbClient.query(`SELECT id, name, price FROM menu_items WHERE tenant_id = $1 AND is_available = true LIMIT 1`, [tenantId]);
    const testItem = itemRes.rows[0];

    // Helper function: create an active session with served order on a table
    async function createServedSessionOnTable(tableId) {
      const sessRes = await dbClient.query(`
        INSERT INTO table_sessions (table_id, tenant_id, status, opened_at, settlement_version)
        VALUES ($1, $2, 'OPEN', NOW(), 1)
        RETURNING id
      `, [tableId, tenantId]);
      const sessionId = sessRes.rows[0].id;

      await dbClient.query(`
        INSERT INTO bills (session_id, tenant_id, total_amount, status)
        VALUES ($1, $2, $3, 'OPEN')
      `, [sessionId, tenantId, testItem.price]);

      const orderRes = await dbClient.query(`
        INSERT INTO orders (id, tenant_id, session_id, order_number, idempotency_key)
        VALUES (gen_random_uuid(), $1, $2, 1, $3)
        RETURNING id
      `, [tenantId, sessionId, randomUUID()]);
      const orderId = orderRes.rows[0].id;

      const oiRes = await dbClient.query(`
        INSERT INTO order_items (id, tenant_id, order_id, menu_item_id, snapshot_name, snapshot_price, quantity)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 1)
        RETURNING id
      `, [tenantId, orderId, testItem.id, testItem.name, testItem.price]);
      const orderItemId = oiRes.rows[0].id;

      await dbClient.query(`
        INSERT INTO order_item_parts (tenant_id, order_item_id, status, quantity)
        VALUES ($1, $2, 'SERVED', 1)
      `, [tenantId, orderItemId]);

      return sessionId;
    }

    // Helper function: create an empty 0đ session on a table
    async function createEmptySessionOnTable(tableId) {
      const sessRes = await dbClient.query(`
        INSERT INTO table_sessions (table_id, tenant_id, status, opened_at, settlement_version)
        VALUES ($1, $2, 'OPEN', NOW(), 1)
        RETURNING id
      `, [tableId, tenantId]);
      const sessionId = sessRes.rows[0].id;

      await dbClient.query(`
        INSERT INTO bills (session_id, tenant_id, total_amount, status)
        VALUES ($1, $2, 0, 'OPEN')
      `, [sessionId, tenantId]);

      return sessionId;
    }

    // Prepare initial sessions
    const s1A01 = await createServedSessionOnTable(tables['A01'].id);
    const s1A02 = await createEmptySessionOnTable(tables['A02'].id);
    const s1A03 = await createServedSessionOnTable(tables['A03'].id);
    const s1B01 = await createServedSessionOnTable(tables['B01'].id);

    // =========================================================================
    // STAFF LOGIN
    // =========================================================================
    console.log('\n--- Staff Login ---');
    await chromeStaff.cdp.send('Page.navigate', { url: 'http://localhost:5188/staff' });
    await sleep(1500);

    await chromeStaff.evaluate(`
      (() => {
        const emailInput = document.querySelector('input[type="email"]');
        if (emailInput) emailInput.focus();
      })()
    `);
    await chromeStaff.cdp.send('Input.insertText', { text: 'admin@phoco.vn' });
    await sleep(100);

    await chromeStaff.evaluate(`
      (() => {
        const passInput = document.querySelector('input[type="password"]');
        if (passInput) passInput.focus();
      })()
    `);
    await chromeStaff.cdp.send('Input.insertText', { text: '123456' });
    await sleep(100);

    await chromeStaff.evaluate(`
      (() => {
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      })()
    `);
    await sleep(2500);

    let staffText = await chromeStaff.evaluate('document.body.innerText');
    assert(staffText.includes('Bàn A01'), 'Staff dashboard must display Table A01');
    console.log('✅ Staff logged in successfully');

    // =========================================================================
    // SCENARIO 1: Settle Session 1 -> Reopen Session 2 -> Settle Session 2 (NO RELOAD)
    // + Check: No Stray "0" anywhere in bill or confirmation modal
    // =========================================================================
    console.log('\n--- SCENARIO 1: Settle Session 1 -> Reopen Session 2 -> Settle Session 2 without page reload ---');

    // Click Table A01
    await chromeStaff.evaluate(`
      (() => {
        const card = Array.from(document.querySelectorAll('div.cursor-pointer')).find(el => el.innerText && el.innerText.includes('Bàn A01'));
        if (card) card.click();
      })()
    `);
    await sleep(1500);

    let modalText = await chromeStaff.evaluate('document.body.innerText');
    assert(modalText.includes('Chi tiết Bàn A01') || modalText.includes('Bàn A01'), 'TableDetailModal must open for A01');
    assert(modalText.includes('Xác nhận đã thanh toán'), 'Must show settlement CTA');

    // Assertion: Check for Stray "0" in the bill summary section
    const strayZeroFound = await chromeStaff.evaluate(`
      (() => {
        const modal = document.querySelector('.fixed.inset-0');
        if (!modal) return false;
        const totalRow = Array.from(modal.querySelectorAll('div')).find(d => d.innerText && d.innerText.includes('Tổng thanh toán'));
        if (!totalRow || !totalRow.parentElement) return false;
        return Boolean(totalRow.parentElement.innerText.match(/\\n\\s*0\\s*\\n/));
      })()
    `);
    assert(!strayZeroFound, 'Stray "0" must NOT be rendered in bill summary');
    console.log('  ✅ Verified no stray "0" in bill summary');

    // Click "Xác nhận đã thanh toán ... & Kết thúc phiên"
    await chromeStaff.evaluate(`
      (() => {
        const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xác nhận đã thanh toán'));
        if (settleBtn) settleBtn.click();
      })()
    `);
    await sleep(1000);

    // Confirmation modal should appear
    modalText = await chromeStaff.evaluate('document.body.innerText');
    assert(modalText.includes('Xác nhận thanh toán thủ công'), 'Confirmation settlement modal must open');
    assert(modalText.includes('Đã nhận đủ tiền'), 'Must show confirm button');

    // Check no stray "0" in confirmation modal either
    const confirmModalZeroCheck = await chromeStaff.evaluate(`
      (() => {
        const confirmModal = Array.from(document.querySelectorAll('.fixed.inset-0')).pop();
        if (!confirmModal) return false;
        return Boolean(confirmModal.innerText.match(/\\n\\s*0\\s*\\n/));
      })()
    `);
    assert(!confirmModalZeroCheck, 'Stray "0" must NOT be rendered in confirmation modal');

    // Click "Đã nhận đủ tiền"
    await chromeStaff.evaluate(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Đã nhận đủ tiền'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(2000);

    // Verify Session 1 closed in DB
    const s1DbRes = await dbClient.query(`SELECT status FROM table_sessions WHERE id = $1`, [s1A01]);
    assert(s1DbRes.rows[0]?.status === 'CLOSED', 'Session 1 on Table A01 must be CLOSED in DB');
    console.log('  ✅ Session 1 settled and closed successfully');

    // WITHOUT RELOADING PAGE: create new session 2 on Table A01
    console.log('  Creating Session 2 on Table A01 while staff page remains un-reloaded...');
    const s2A01 = await createServedSessionOnTable(tables['A01'].id);

    // Refresh staff dashboard by clicking the refresh button on the header or polling
    await chromeStaff.evaluate(`
      (() => {
        const refreshBtn = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-refresh-cw') || (b.title && b.title.includes('Làm mới')));
        if (refreshBtn) refreshBtn.click();
      })()
    `);
    await sleep(2000);

    // Now click Table A01 again!
    await chromeStaff.evaluate(`
      (() => {
        const card = Array.from(document.querySelectorAll('div.cursor-pointer')).find(el => el.innerText && el.innerText.includes('Bàn A01'));
        if (card) card.click();
      })()
    `);
    await sleep(1500);

    // Verify TableDetailModal opens for Session 2
    modalText = await chromeStaff.evaluate('document.body.innerText');
    assert(modalText.includes('Bàn A01'), 'TableDetailModal must open for Session 2');

    // CRITICAL REGRESSION ASSERTION: isSettling must NOT be true! The settlement button must be ENABLED.
    const settleBtnState = await chromeStaff.evaluate(`
      (() => {
        const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xác nhận đã thanh toán'));
        if (!settleBtn) return { found: false };
        return {
          found: true,
          disabled: settleBtn.disabled,
          text: settleBtn.innerText
        };
      })()
    `);
    assert(settleBtnState.found, 'Settlement button must be present in Session 2');
    assert(!settleBtnState.disabled, 'Settlement button must NOT be disabled (isSettling was stranded before fix)');
    assert(!settleBtnState.text.includes('Đang'), 'Settlement button must not be stuck in loading/settling state');
    console.log('  ✅ Session 2 opened cleanly: isSettling is false, settlement CTA is fully enabled');

    // Settle Session 2
    await chromeStaff.evaluate(`
      (() => {
        const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xác nhận đã thanh toán'));
        if (settleBtn) settleBtn.click();
      })()
    `);
    await sleep(1000);

    await chromeStaff.evaluate(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Đã nhận đủ tiền'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(2000);

    // Verify Session 2 closed in DB
    const s2DbRes = await dbClient.query(`SELECT status FROM table_sessions WHERE id = $1`, [s2A01]);
    assert(s2DbRes.rows[0]?.status === 'CLOSED', 'Session 2 on Table A01 must be CLOSED in DB');
    await chromeStaff.screenshot('pay_reg_01_double_settlement_success.png');
    console.log('  ✅ Scenario 1 Passed: Double settlement without page reload succeeds completely!');

    // =========================================================================
    // SCENARIO 2: Close 0đ session (close-without-charge) -> Reopen -> Settle normally
    // =========================================================================
    console.log('\n--- SCENARIO 2: Close 0đ session -> Reopen -> Settle normally ---');

    // Refresh staff dashboard to reflect Table A02
    await chromeStaff.evaluate(`
      (() => {
        const refreshBtn = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-refresh-cw'));
        if (refreshBtn) refreshBtn.click();
      })()
    `);
    await sleep(2000);

    // Click Table A02 (which has 0 items, 0đ)
    await chromeStaff.evaluate(`
      (() => {
        const card = Array.from(document.querySelectorAll('div.cursor-pointer')).find(el => el.innerText && el.innerText.includes('Bàn A02'));
        if (card) card.click();
      })()
    `);
    await sleep(1500);

    modalText = await chromeStaff.evaluate('document.body.innerText');
    assert(modalText.includes('Tắt bàn (0đ)'), 'Table A02 must show "Tắt bàn (0đ)" button');

    // Click "Tắt bàn (0đ)"
    await chromeStaff.evaluate(`
      (() => {
        const closeZeroBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Tắt bàn (0đ)'));
        if (closeZeroBtn) closeZeroBtn.click();
      })()
    `);
    await sleep(2000);

    // Verify Session 1 on A02 closed without charge in DB
    const s1A02DbRes = await dbClient.query(`SELECT status, close_reason FROM table_sessions WHERE id = $1`, [s1A02]);
    assert(s1A02DbRes.rows[0]?.status === 'CLOSED', 'Table A02 Session 1 must be CLOSED');
    assert(s1A02DbRes.rows[0]?.close_reason === 'WITHOUT_CHARGE', 'close_reason must be WITHOUT_CHARGE');
    console.log('  ✅ Table A02 closed with 0đ (WITHOUT_CHARGE) successfully');

    // Reopen Session 2 on Table A02 with served orders
    console.log('  Reopening Table A02 with served orders...');
    const s2A02 = await createServedSessionOnTable(tables['A02'].id);

    // Refresh dashboard
    await chromeStaff.evaluate(`
      (() => {
        const refreshBtn = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-refresh-cw'));
        if (refreshBtn) refreshBtn.click();
      })()
    `);
    await sleep(2000);

    // Click Table A02 again
    await chromeStaff.evaluate(`
      (() => {
        const card = Array.from(document.querySelectorAll('div.cursor-pointer')).find(el => el.innerText && el.innerText.includes('Bàn A02'));
        if (card) card.click();
      })()
    `);
    await sleep(1500);

    // Assert: button is "Xác nhận đã thanh toán", NOT stuck in "Đang tắt bàn..."
    const a02BtnState = await chromeStaff.evaluate(`
      (() => {
        const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xác nhận đã thanh toán'));
        if (!settleBtn) return { found: false };
        return {
          found: true,
          disabled: settleBtn.disabled,
          text: settleBtn.innerText
        };
      })()
    `);
    assert(a02BtnState.found, 'Settlement button must be present for reopened Table A02');
    assert(!a02BtnState.disabled, 'Settlement button must NOT be disabled after 0đ close');
    console.log('  ✅ Reopened Table A02 is not stranded in settling state');

    // Settle reopened Table A02 normally
    await chromeStaff.evaluate(`
      (() => {
        const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xác nhận đã thanh toán'));
        if (settleBtn) settleBtn.click();
      })()
    `);
    await sleep(1000);

    await chromeStaff.evaluate(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Đã nhận đủ tiền'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(2000);

    const s2A02DbRes = await dbClient.query(`SELECT status FROM table_sessions WHERE id = $1`, [s2A02]);
    assert(s2A02DbRes.rows[0]?.status === 'CLOSED', 'Table A02 Session 2 must be CLOSED in DB');
    await chromeStaff.screenshot('pay_reg_02_zero_dong_reopened_settled.png');
    console.log('  ✅ Scenario 2 Passed: 0đ close followed by normal session settlement succeeds!');

    // =========================================================================
    // SCENARIO 3: Genuine POST 409 Conflict Assertion (R2 Requirement 1)
    // Preflight GET succeeds with original version -> DB version updated right
    // as POST is sent -> POST actually executes and returns HTTP 409
    // =========================================================================
    console.log('\n--- SCENARIO 3: Genuine POST 409 Conflict Assertion ---');

    // Click Table A03
    await chromeStaff.evaluate(`
      (() => {
        const card = Array.from(document.querySelectorAll('div.cursor-pointer')).find(el => el.innerText && el.innerText.includes('Bàn A03'));
        if (card) card.click();
      })()
    `);
    await sleep(1500);

    modalText = await chromeStaff.evaluate('document.body.innerText');
    assert(modalText.includes('Bàn A03'), 'TableDetailModal must open for A03');

    // Click "Xác nhận đã thanh toán ... & Kết thúc phiên"
    await chromeStaff.evaluate(`
      (() => {
        const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xác nhận đã thanh toán'));
        if (settleBtn) settleBtn.click();
      })()
    `);
    await sleep(1000);

    // Track network responses to prove POST actually returned 409
    let postStatusCode = null;
    let post409Intercepted = false;
    const handleNetworkResponse = ({ response }) => {
      if (response.url.includes('confirm-payment-and-close')) {
        postStatusCode = response.status;
        console.log(`  🎯 Network response received: HTTP ${response.status} for ${response.url}`);
      }
    };
    chromeStaff.cdp.on('Network.responseReceived', handleNetworkResponse);

    await chromeStaff.cdp.send('Fetch.enable', {
      patterns: [{ urlPattern: '*/confirm-payment-and-close*', requestStage: 'Request' }]
    });

    const handlePostIntercept = async ({ requestId, request }) => {
      if (request.method === 'POST') {
        post409Intercepted = true;
        console.log('  🎯 Intercepted POST /confirm-payment-and-close. Preflight GET already passed!');
        // Invalidate settlement_version in PostgreSQL DB right now before POST transaction locks the row!
        await dbClient.query(`UPDATE table_sessions SET settlement_version = settlement_version + 1 WHERE id = $1`, [s1A03]);
        await chromeStaff.cdp.send('Fetch.continueRequest', { requestId });
      } else {
        await chromeStaff.cdp.send('Fetch.continueRequest', { requestId });
      }
    };
    chromeStaff.cdp.on('Fetch.requestPaused', handlePostIntercept);

    // Click "Đã nhận đủ tiền"
    await chromeStaff.evaluate(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Đã nhận đủ tiền'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(2500);

    chromeStaff.cdp.off('Fetch.requestPaused', handlePostIntercept);
    await chromeStaff.cdp.send('Fetch.disable');
    chromeStaff.cdp.off('Network.responseReceived', handleNetworkResponse);

    assert(post409Intercepted, 'POST /confirm-payment-and-close must be intercepted');
    assert(postStatusCode === 409, `POST must genuinely return HTTP 409, got ${postStatusCode}`);
    console.log('  ✅ Verified POST /confirm-payment-and-close actually returned HTTP 409');

    // Verify modal state after 409:
    modalText = await chromeStaff.evaluate('document.body.innerText');
    assert(
      modalText.includes('thay đổi') || modalText.includes('kiểm tra và xác nhận lại'),
      `Modal must display 409 error message, got:\n${modalText}`
    );
    console.log('  ✅ 409 Conflict error message displayed properly in modal');

    const recoverBtnState = await chromeStaff.evaluate(`
      (() => {
        const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xác nhận đã thanh toán'));
        if (!settleBtn) return { found: false };
        return {
          found: true,
          disabled: settleBtn.disabled,
          text: settleBtn.innerText
        };
      })()
    `);
    assert(recoverBtnState.found, 'Settlement button must still be available after 409 conflict');
    assert(!recoverBtnState.disabled, 'Settlement button must NOT be permanently locked/disabled after 409 error');
    assert(!recoverBtnState.text.includes('Đang'), 'Settlement button must NOT be stuck in loading state');
    console.log('  ✅ Verified: 409 error did NOT lock the settlement button!');
    await chromeStaff.screenshot('pay_reg_03_post_409_conflict.png');
    console.log('  ✅ Scenario 3 Passed: Real POST 409 conflict verified!');

    // =========================================================================
    // SCENARIO 4: Refresh failure after conflict recovers UI cleanly (R2 Requirement 2)
    // When 409 conflict occurs, the subsequent bill-summary refresh fails,
    // but UI still recovers and allows retry without permanent button lock.
    // =========================================================================
    console.log('\n--- SCENARIO 4: Failed refresh after 409 conflict recovers UI cleanly ---');

    // Modal is currently showing error. Click "Xác nhận đã thanh toán..." to open confirm modal again
    await chromeStaff.evaluate(`
      (() => {
        const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xác nhận đã thanh toán'));
        if (settleBtn) settleBtn.click();
      })()
    `);
    await sleep(1000);

    let refreshFailedInjected = false;
    let postHit = false;

    await chromeStaff.cdp.send('Fetch.enable', {
      patterns: [
        { urlPattern: '*/confirm-payment-and-close*', requestStage: 'Request' },
        { urlPattern: '*/bill-summary*', requestStage: 'Request' }
      ]
    });

    const handleRefreshFail = async ({ requestId, request }) => {
      if (request.url.includes('confirm-payment-and-close')) {
        postHit = true;
        console.log('  🎯 Intercepted POST /confirm-payment-and-close: responding with 409');
        await chromeStaff.cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 409,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Access-Control-Allow-Origin', value: '*' }
          ],
          body: Buffer.from(JSON.stringify({ error: 'SUMMARY_CHANGED', message: 'Hóa đơn đã thay đổi trên máy chủ' })).toString('base64')
        });
      } else if (request.url.includes('bill-summary')) {
        if (postHit) {
          refreshFailedInjected = true;
          console.log('  🎯 Injected network failure on bill-summary refresh request following 409 conflict');
          await chromeStaff.cdp.send('Fetch.failRequest', { requestId, errorReason: 'ConnectionFailed' });
        } else {
          await chromeStaff.cdp.send('Fetch.continueRequest', { requestId });
        }
      } else {
        await chromeStaff.cdp.send('Fetch.continueRequest', { requestId });
      }
    };
    chromeStaff.cdp.on('Fetch.requestPaused', handleRefreshFail);

    // Click "Đã nhận đủ tiền"
    await chromeStaff.evaluate(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Đã nhận đủ tiền'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(2500);

    chromeStaff.cdp.off('Fetch.requestPaused', handleRefreshFail);
    await chromeStaff.cdp.send('Fetch.disable');

    assert(refreshFailedInjected, 'Bill-summary refresh failure must have been injected');
    const refreshFailBtnState = await chromeStaff.evaluate(`
      (() => {
        const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xác nhận đã thanh toán'));
        if (!settleBtn) return { found: false };
        return { found: true, disabled: settleBtn.disabled, text: settleBtn.innerText };
      })()
    `);
    assert(refreshFailBtnState.found, 'Settlement button must be present after failed refresh');
    assert(!refreshFailBtnState.disabled, 'Settlement button must NOT be disabled when bill refresh fails');
    assert(!refreshFailBtnState.text.includes('Đang'), 'Settlement button must NOT be stuck in loading state');
    console.log('  ✅ Scenario 4 Passed: Failed refresh after 409 conflict cleanly recovers UI!');
    await chromeStaff.screenshot('pay_reg_04_failed_refresh_recovered.png');

    // Close Table A03 modal cleanly
    await chromeStaff.evaluate(`
      (() => {
        const closeBtn = document.querySelector('button[title*="Đóng"]') || Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-x'));
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(1000);

    // =========================================================================
    // SCENARIO 5: Delayed A completion while B settlement is pending (R1 + R2 Requirement 3)
    // Hold A response -> switch to B and start B settlement -> release A
    // ASSERTION: Modal B remains OPEN and button remains LOCKED until B finishes!
    // =========================================================================
    console.log('\n--- SCENARIO 5: Delayed Operation A while Operation B is pending ---');

    // Create a fresh served session on Table A01 (which is currently closed and free)
    const s3A01 = await createServedSessionOnTable(tables['A01'].id);

    // Refresh staff dashboard
    await chromeStaff.evaluate(`
      (() => {
        const refreshBtn = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-refresh-cw'));
        if (refreshBtn) refreshBtn.click();
      })()
    `);
    await sleep(2000);

    await chromeStaff.cdp.send('Fetch.enable', {
      patterns: [{ urlPattern: '*/confirm-payment-and-close*', requestStage: 'Request' }]
    });

    let delayedRequestIdA = null;
    let delayedRequestIdB = null;

    const handleDelayedRace = async ({ requestId, request }) => {
      if (!delayedRequestIdA) {
        console.log('  🎯 Intercepted Operation A (Table A01) - Holding response...');
        delayedRequestIdA = requestId;
        // HOLD request! Do not continue yet.
      } else {
        console.log('  🎯 Intercepted Operation B (Table B01) - Holding response...');
        delayedRequestIdB = requestId;
        // HOLD request! Do not continue yet.
      }
    };
    chromeStaff.cdp.on('Fetch.requestPaused', handleDelayedRace);

    // Open Table A01
    await chromeStaff.evaluate(`
      (() => {
        const card = Array.from(document.querySelectorAll('div.cursor-pointer')).find(el => el.innerText && el.innerText.includes('Bàn A01'));
        if (card) card.click();
      })()
    `);
    await sleep(1500);

    // Click "Xác nhận đã thanh toán..." on Table A01
    await chromeStaff.evaluate(`
      (() => {
        const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xác nhận đã thanh toán'));
        if (settleBtn) settleBtn.click();
      })()
    `);
    await sleep(1000);

    // Click "Đã nhận đủ tiền" on Table A01 -> Operation A starts and is held
    await chromeStaff.evaluate(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Đã nhận đủ tiền'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(1000);
    assert(delayedRequestIdA !== null, 'Operation A request must be intercepted and held');

    // While Operation A is held in-flight:
    // Close Modal A01 and switch to Table B01
    await chromeStaff.evaluate(`
      (() => {
        const closeBtn = document.querySelector('button[title*="Đóng"]') || Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg.lucide-x'));
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(1000);

    // Open Table B01
    await chromeStaff.evaluate(`
      (() => {
        const card = Array.from(document.querySelectorAll('div.cursor-pointer')).find(el => el.innerText && el.innerText.includes('Bàn B01'));
        if (card) card.click();
      })()
    `);
    await sleep(1500);

    modalText = await chromeStaff.evaluate('document.body.innerText');
    assert(modalText.includes('Bàn B01'), 'TableDetailModal must open for B01');

    // Start settlement on Table B01
    await chromeStaff.evaluate(`
      (() => {
        const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xác nhận đã thanh toán'));
        if (settleBtn) settleBtn.click();
      })()
    `);
    await sleep(1000);

    // Click "Đã nhận đủ tiền" on Table B01 -> Operation B starts and is held
    await chromeStaff.evaluate(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Đã nhận đủ tiền'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(1000);
    assert(delayedRequestIdB !== null, 'Operation B request must be intercepted and held');

    // Now Operation B is in-flight on Table B01
    const modalBLockedBeforeA = await chromeStaff.evaluate(`
      (() => {
        const modal = Array.from(document.querySelectorAll('.fixed.inset-0')).pop();
        if (!modal) return { found: false, detail: 'no modal' };
        const btn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('Đang xác nhận') || b.innerText.includes('Đã nhận đủ tiền')));
        return { found: Boolean(btn), disabled: btn?.disabled, text: btn?.innerText };
      })()
    `);
    assert(modalBLockedBeforeA.found, 'Modal B01 must show settlement in-flight state');
    assert(modalBLockedBeforeA.disabled, 'Modal B01 button must be disabled while Operation B is pending');

    // NOW RELEASE Operation A's held request!
    console.log('  🚀 Resuming Operation A completion while Operation B is pending on Table B01...');
    await chromeStaff.cdp.send('Fetch.continueRequest', { requestId: delayedRequestIdA });
    await sleep(2000); // Allow Operation A to complete on server and in browser

    // CRITICAL ASSERTION 1: Modal B01 is STILL OPEN! Modal B01 was NOT closed by Operation A's completion!
    const isModalBStillOpen = await chromeStaff.evaluate('document.body.innerText.includes("Chi tiết Bàn B01") || document.body.innerText.includes("Bàn B01")');
    assert(isModalBStillOpen, 'Modal B01 must NOT be closed by stale Operation A completion');

    // CRITICAL ASSERTION 2: Modal B01's settlement button is STILL DISABLED (isSettling remains true for B01)!
    const modalBStillLocked = await chromeStaff.evaluate(`
      (() => {
        const modal = Array.from(document.querySelectorAll('.fixed.inset-0')).pop();
        if (!modal) return { found: false, detail: 'no modal' };
        const btn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('Đang xác nhận') || b.innerText.includes('Đã nhận đủ tiền')));
        return { found: Boolean(btn), disabled: btn?.disabled, text: btn?.innerText };
      })()
    `);
    assert(modalBStillLocked.found, 'Modal B01 must still show settlement button');
    assert(modalBStillLocked.disabled, 'Modal B01 button must REMAIN DISABLED (Operation A did NOT clear B01 loading state)');
    console.log('  ✅ Verified: Operation A completion did NOT close Modal B01 or clear B01 isSettling loading state!');

    // Verify Table A01 session 3 is CLOSED in DB
    const s3A01DbRes = await dbClient.query(`SELECT status FROM table_sessions WHERE id = $1`, [s3A01]);
    assert(s3A01DbRes.rows[0]?.status === 'CLOSED', 'Table A01 Session 3 must be CLOSED in DB');

    // NOW RELEASE Operation B's held request
    console.log('  🚀 Resuming Operation B completion...');
    await chromeStaff.cdp.send('Fetch.continueRequest', { requestId: delayedRequestIdB });
    await sleep(2500); // Allow Operation B to complete

    chromeStaff.cdp.off('Fetch.requestPaused', handleDelayedRace);
    await chromeStaff.cdp.send('Fetch.disable');

    // FINAL ASSERTIONS:
    // Modal B01 closes
    const isModalBClosed = await chromeStaff.evaluate('!document.querySelector(".fixed.inset-0")');
    assert(isModalBClosed, 'Modal B01 must close upon Operation B completion');

    // Table B01 is CLOSED in DB
    const s1B01DbRes = await dbClient.query(`SELECT status FROM table_sessions WHERE id = $1`, [s1B01]);
    assert(s1B01DbRes.rows[0]?.status === 'CLOSED', 'Table B01 Session 1 must be CLOSED in DB');
    await chromeStaff.screenshot('pay_reg_05_delayed_a_while_b_pending_success.png');
    console.log('  ✅ Scenario 5 Passed: Delayed Operation A cleanly isolated from Operation B!');

    console.log('\n🎉 ALL PAYMENT LIFECYCLE REGRESSION SCENARIOS (1-5) VERIFIED SUCCESSFULLY!');
  } finally {
    console.log('\n🧹 Cleaning up browser and server processes...');
    if (chromeStaff?.proc) {
      try { chromeStaff.cdp.close(); chromeStaff.proc.kill('SIGKILL'); } catch {}
    }
    if (frontendProc) {
      try { frontendProc.kill('SIGKILL'); } catch {}
    }
    if (backendProc) {
      try { backendProc.kill('SIGKILL'); } catch {}
    }

    for (const dir of createdProfileDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`Failed to clean up profile dir ${dir}:`, e.message);
      }
    }

    if (dbClient) {
      try { await dbClient.end(); } catch {}
    }
    if (testDbCreated && testDbName) {
      try {
        if (!adminClient) {
          const adminDbUrl = getAdminDbUrl();
          adminClient = new Client({ connectionString: adminDbUrl });
          await adminClient.connect();
        }
        await adminClient.query(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE)`);
        console.log(`🧹 Dropped isolated test DB: ${testDbName}`);
      } catch (e) {
        console.warn(`Failed to drop test DB ${testDbName}:`, e.message);
      }
    }
    if (adminClient) {
      try { await adminClient.end(); } catch {}
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ VERIFICATION SCRIPT FAILED:', err);
    process.exit(1);
  });
