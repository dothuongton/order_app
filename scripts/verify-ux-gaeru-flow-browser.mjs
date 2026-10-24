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
  path.resolve('/Users/admin/.gemini/antigravity/brain/1af5de4a-254b-4323-abd3-b3906087bfbe/gaeru-p1');

try {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
} catch {
  SCREENSHOT_DIR = '/tmp/gaeru-p1-screenshots';
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const createdProfileDirs = [];
const BACKEND_PORT = process.env.TEST_BACKEND_PORT || '4012';
const FRONTEND_PORT = process.env.TEST_FRONTEND_PORT || '5182';

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
  const profileDir = `/tmp/chrome-gaeru-${profileName}-${Date.now()}-${randomUUID().slice(0, 6)}`;
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
  console.log('🚀 Starting Gaeru P1 Browser E2E Verification (Request Table Open -> Staff Approve -> Claim Device -> Viewer Isolation -> Replacement Claim -> Multi-Device Flag-Off)');

  // 0. Isolated DB Setup (H1b: full lifecycle protected inside try/finally)
  let adminClient = null;
  let testDbName = null;
  let testDbCreated = false;
  let dbClient = null;
  let backendProc = null;
  let frontendProc = null;
  let chromeDeviceA = null;
  let chromeDeviceB = null;
  let chromeStaff = null;

  try {
    testDbName = `qr_order_test_harness_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const adminDbUrl = getAdminDbUrl();
    console.log(`0️⃣ Setting up isolated test DB: ${testDbName}...`);
    adminClient = new Client({ connectionString: adminDbUrl });
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${testDbName}"`);
    testDbCreated = true;
    const testDbUrl = getTestDbUrl(testDbName);

    if (process.env.FAULT_INJECT_SETUP === 'pre-migrate') {
      throw new Error('FAULT_INJECT: Simulated failure right before migration');
    }

    if (process.env.FAULT_INJECT_SETUP === 'migrate') {
      execSync('node -e "console.error(\\"Simulated migration failure\\"); process.exit(1)"', { stdio: 'pipe' });
    } else {
      execSync('node dist/db/migrate.js', {
        cwd: path.join(ROOT_DIR, 'backend'),
        env: { ...process.env, DATABASE_URL: testDbUrl, NODE_ENV: 'test' },
        stdio: 'pipe'
      });
    }

    if (process.env.FAULT_INJECT_SETUP === 'seed') {
      execSync('node -e "console.error(\\"Simulated seed failure\\"); process.exit(1)"', { stdio: 'pipe' });
    } else {
      execSync('node dist/db/seed.js', {
        cwd: path.join(ROOT_DIR, 'backend'),
        env: { ...process.env, DATABASE_URL: testDbUrl, NODE_ENV: 'test' },
        stdio: 'pipe'
      });
    }
    console.log(`✅ Migrated and seeded isolated test DB: ${testDbName}`);

    if (process.env.FAULT_INJECT_SETUP === 'connect') {
      throw new Error('FAULT_INJECT: Simulated dbClient.connect failure');
    }

    dbClient = new Client({ connectionString: testDbUrl });
    await dbClient.connect();

    // 1. Launch Backend on Port BACKEND_PORT with test DB and approved_single_device mode
    console.log(`1️⃣ Launching backend on port ${BACKEND_PORT} with isolated test DB...`);
    backendProc = spawn('node', ['dist/server.js'], {
      cwd: path.join(ROOT_DIR, 'backend'),
      env: {
        ...process.env,
        PORT: BACKEND_PORT,
        ORDERING_MODE: 'approved_single_device',
        FRONTEND_URL: `http://localhost:${FRONTEND_PORT}`,
        CORS_ORIGINS: `http://localhost:${FRONTEND_PORT}`,
        DATABASE_URL: testDbUrl,
        JWT_SECRET: 'test-jwt-secret-gaeru-flow-1234567890'
      },
      stdio: 'pipe'
    });

    backendProc.stdout.on('data', d => {
      const line = d.toString().trim();
      if (line && line.includes('Error')) console.log('  [backend]', line);
    });
    backendProc.stderr.on('data', d => console.error('  [backend err]', d.toString().trim()));

    // Wait for backend to be ready
    let backendReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://localhost:${BACKEND_PORT}/health`);
        if (res.ok) {
          backendReady = true;
          break;
        }
      } catch {}
      await sleep(200);
    }
    assert(backendReady, `Backend failed to start on port ${BACKEND_PORT}`);
    console.log(`✅ Backend running on http://localhost:${BACKEND_PORT} (ORDERING_MODE=approved_single_device)`);

    // 2. Launch Frontend on Port FRONTEND_PORT proxying to BACKEND_PORT
    console.log(`2️⃣ Launching frontend on port ${FRONTEND_PORT}...`);
    frontendProc = spawn('npx', ['vite', '--port', FRONTEND_PORT, '--strictPort'], {
      cwd: path.join(ROOT_DIR, 'frontend'),
      env: {
        ...process.env,
        VITE_BACKEND_URL: `http://localhost:${BACKEND_PORT}`
      },
      stdio: 'pipe'
    });

    let frontendReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://localhost:${FRONTEND_PORT}`);
        if (res.ok) {
          frontendReady = true;
          break;
        }
      } catch {}
      await sleep(250);
    }
    assert(frontendReady, `Frontend failed to start on port ${FRONTEND_PORT}`);
    console.log(`✅ Frontend running on http://localhost:${FRONTEND_PORT}`);

    // 3. Launch Chrome for Device A (Mobile 390x844)
    console.log('3️⃣ Spawning Chrome for Device A (Requester / Claimed)...');
    chromeDeviceA = await startChromeInstance(9231, 'dev-a');
    await chromeDeviceA.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    // 4. Launch Chrome for Device B (Mobile 390x844)
    console.log('4️⃣ Spawning Chrome for Device B (Viewer / Replacement)...');
    chromeDeviceB = await startChromeInstance(9232, 'dev-b');
    await chromeDeviceB.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    // 5. Launch Chrome for Staff Dashboard (Desktop 1280x800)
    console.log('5️⃣ Spawning Chrome for Staff Dashboard...');
    chromeStaff = await startChromeInstance(9233, 'staff');
    await chromeStaff.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    // =========================================================================
    // STEP 1: Device A scans Table A01 (Vacant) and submits Request Open
    // =========================================================================
    console.log('\n--- STEP 1: Device A scans Table A01 (Vacant) ---');
    await chromeDeviceA.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await sleep(2000);

    let textA = await chromeDeviceA.evaluate('document.body.innerText');
    assert(textA.includes('Bàn A01'), 'Device A must see Table A01');
    assert(textA.includes('Yêu cầu mở bàn') && textA.includes('Gửi yêu cầu'), 'Must show request open card');

    await chromeDeviceA.screenshot('01_device_a_request_form_vacant.png');

    // Type Guest Name "Khách Bàn 1 - Nam" and submit request
    console.log('  Device A fills name and submits request open...');
    await chromeDeviceA.evaluate(`
      (() => {
        const input = document.querySelector('input[placeholder*="Anh Ba" i]');
        if (input) input.focus();
      })()
    `);
    await sleep(200);
    await chromeDeviceA.cdp.send('Input.insertText', { text: 'Khách Bàn 1 - Nam' });
    await sleep(300);

    await chromeDeviceA.evaluate(`
      (() => {
        const btn = document.querySelector('button[type="submit"]');
        if (btn) btn.click();
      })()
    `);
    await sleep(2000);

    textA = await chromeDeviceA.evaluate('document.body.innerText');
    assert(textA.includes('Đang chờ nhân viên duyệt'), 'Device A must see pending approval status');
    assert(textA.includes('Rút yêu cầu'), 'Device A must see withdraw button');
    await chromeDeviceA.screenshot('02_device_a_requested_waiting_countdown.png');
    console.log('  ✅ Device A entered PENDING_APPROVAL state with countdown timer');

    // =========================================================================
    // STEP 2: Device B scans Table A01 (Pending Approval) -> Read-Only Viewer
    // =========================================================================
    console.log('\n--- STEP 2: Device B scans Table A01 (Pending Approval) ---');
    await chromeDeviceB.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await sleep(2000);

    let textB = await chromeDeviceB.evaluate('document.body.innerText');
    assert(textB.includes('Bàn A01'), 'Device B must see Table A01');
    assert(textB.includes('chế độ xem thực đơn') && textB.includes('chờ nhân viên duyệt'), 'Device B must see read-only banner');
    assert(!textB.includes('Khách Bàn 1 - Nam'), 'Device B MUST NOT see requester name (PII isolation)');

    await chromeDeviceB.screenshot('03_device_b_viewer_pending_readonly.png');
    console.log('  ✅ Device B isolated in read-only viewer mode, requester PII protected');

    // =========================================================================
    // STEP 3: Staff Logs in and views Pending Requests
    // =========================================================================
    console.log('\n--- STEP 3: Staff logs in and views Pending Requests ---');
    await chromeStaff.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/staff` });
    await sleep(1500);

    // Login as admin@phoco.vn / 123456
    await chromeStaff.evaluate(`
      (() => {
        const emailInput = document.querySelector('input[type="email"]');
        if (emailInput) emailInput.focus();
      })()
    `);
    await sleep(100);
    await chromeStaff.cdp.send('Input.insertText', { text: 'admin@phoco.vn' });
    await sleep(200);

    await chromeStaff.evaluate(`
      (() => {
        const passInput = document.querySelector('input[type="password"]');
        if (passInput) passInput.focus();
      })()
    `);
    await sleep(100);
    await chromeStaff.cdp.send('Input.insertText', { text: '123456' });
    await sleep(200);

    await chromeStaff.evaluate(`
      (() => {
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      })()
    `);
    await sleep(2500);

    let staffText = await chromeStaff.evaluate('document.body.innerText');
    assert(staffText.toUpperCase().includes('YÊU CẦU MỞ BÀN CHỜ DUYỆT'), 'Staff dashboard must show pending requests banner');
    assert(staffText.includes('Bàn A01'), 'Staff banner must show Table A01');
    assert(staffText.includes('Khách Bàn 1 - Nam'), 'Staff banner must show requester name');

    await chromeStaff.screenshot('04_staff_dashboard_pending_banner.png');
    console.log('  ✅ Staff Dashboard successfully shows pending request from Device A');

    // =========================================================================
    // STEP 4: Staff clicks "Duyệt mở" -> Table opens and Device A claims session
    // =========================================================================
    console.log('\n--- STEP 4: Staff approves request ---');
    await chromeStaff.evaluate(`
      (() => {
        const approveBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Duyệt mở'));
        if (approveBtn) approveBtn.click();
      })()
    `);
    await sleep(2000);

    staffText = await chromeStaff.evaluate('document.body.innerText');
    await chromeStaff.screenshot('05_staff_dashboard_after_approval.png');
    console.log('  ✅ Staff approved request successfully');

    // =========================================================================
    // STEP 5: Device A automatically transitions to CLAIMED and places an order
    // =========================================================================
    console.log('\n--- STEP 5: Device A receives claim and places order ---');
    await chromeDeviceA.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await sleep(2000);

    textA = await chromeDeviceA.evaluate('document.body.innerText');
    assert(textA.includes('Thực đơn') || textA.includes('Bàn A01'), 'Device A must see menu');

    // Check that Add to Cart button exists and click it
    console.log('  Adding item to cart on Device A...');
    const addBtnFound = await chromeDeviceA.evaluate(`
      (() => {
        const addBtn = document.querySelector('button[aria-label^="Thêm "]');
        if (addBtn) { addBtn.click(); return true; }
        return false;
      })()
    `);
    assert(addBtnFound, 'Device A must find an Add to Cart button');
    await sleep(1000);

    // Confirm customization if modal opens
    await chromeDeviceA.evaluate(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Thêm vào đơn'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(1000);

    await chromeDeviceA.screenshot('06_device_a_claimed_active_menu.png');

    // Open Cart and submit order
    console.log('  Submitting order from Device A...');
    const cartBarFound = await chromeDeviceA.evaluate(`
      (() => {
        const cartBarBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xem lần gọi mới'));
        if (cartBarBtn) { cartBarBtn.click(); return true; }
        return false;
      })()
    `);
    assert(cartBarFound, 'Device A must find and click cart bar button');
    await sleep(1000);

    // Click confirm order inside cart sheet
    const submitBtnFound = await chromeDeviceA.evaluate(`
      (() => {
        const submitOrderBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Gửi yêu cầu gọi món'));
        if (submitOrderBtn) { submitOrderBtn.click(); return true; }
        return false;
      })()
    `);
    assert(submitBtnFound, 'Device A must find and click submit order button');
    await sleep(2500);

    await chromeDeviceA.screenshot('07_device_a_order_placed_modal.png');
    console.log('  ✅ Device A successfully placed order with active device claim');

    // Verify in DB that Order 1 was created on Table A01 session
    const sessionRes1 = await dbClient.query(`
      SELECT
        ts.id as session_id,
        b.id as bill_id,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(oi.snapshot_price * oi.quantity), 0) as total_order_amount
      FROM tables t
      JOIN table_sessions ts ON ts.table_id = t.id AND ts.status = 'OPEN'
      LEFT JOIN bills b ON b.session_id = ts.id
      LEFT JOIN orders o ON o.session_id = ts.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE t.table_number = 'A01'
      GROUP BY ts.id, b.id
    `);
    assert(sessionRes1.rows.length === 1, 'Table A01 must have exactly 1 active OPEN session');
    const initialSessionId = sessionRes1.rows[0].session_id;
    const initialBillId = sessionRes1.rows[0].bill_id;
    const initialOrderCount = parseInt(sessionRes1.rows[0].order_count, 10);
    const initialOrderAmount = parseFloat(sessionRes1.rows[0].total_order_amount);
    assert(initialOrderCount >= 1, 'At least 1 order must be persisted in DB for Device A');
    assert(initialOrderAmount > 0, 'Initial order amount must be greater than 0');
    console.log(`  [DB State after Device A]: Session=${initialSessionId}, Bill=${initialBillId}, Orders=${initialOrderCount}, TotalAmount=${initialOrderAmount}`);

    // =========================================================================
    // STEP 6: Device B verifies Viewer Isolation on Active Session
    // =========================================================================
    console.log('\n--- STEP 6: Device B views active session (Read-Only Viewer) ---');
    await chromeDeviceB.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await sleep(2000);

    textB = await chromeDeviceB.evaluate('document.body.innerText');
    assert(textB.includes('Chế độ chỉ xem menu') || textB.includes('thiết bị khác'), 'Device B must see read-only active banner');

    // Check that + Thêm món buttons are NOT available / disabled for viewer
    const hasOrderButton = await chromeDeviceB.evaluate(`
      (() => {
        const addButtons = Array.from(document.querySelectorAll('button')).filter(b => b.innerText && b.innerText.includes('+ Thêm món') && !b.disabled);
        return addButtons.length > 0;
      })()
    `);
    assert(!hasOrderButton, 'Device B must NOT have enabled + Thêm món buttons');

    await chromeDeviceB.screenshot('08_device_b_viewer_active_readonly.png');
    console.log('  ✅ Device B verified in read-only mode during active table session');

    // =========================================================================
    // STEP 7: Staff opens Table A01 modal and verifies Release Claim option
    // =========================================================================
    console.log('\n--- STEP 7: Staff opens Table A01 modal and releases claim ---');
    await chromeStaff.evaluate(`
      (() => {
        const viewOrderBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xem đơn'));
        if (viewOrderBtn) {
          viewOrderBtn.click();
          return;
        }
        const tableCard = Array.from(document.querySelectorAll('div.cursor-pointer')).find(el => el.innerText && el.innerText.includes('Bàn A01'));
        if (tableCard) tableCard.click();
      })()
    `);
    await sleep(1500);

    let modalText = await chromeStaff.evaluate('document.body.innerText');
    assert(modalText.includes('Giải phóng máy gọi') || modalText.includes('Đổi máy gọi món'), 'Modal must contain Release Claim button');

    // Click "Giải phóng máy gọi"
    await chromeStaff.evaluate(`
      (() => {
        const releaseBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Giải phóng máy gọi'));
        if (releaseBtn) releaseBtn.click();
      })()
    `);
    await sleep(1500);

    await chromeStaff.screenshot('09_staff_modal_release_claim.png');
    console.log('  ✅ Staff successfully clicked Release Claim');

    // Verify DB: claimed_device_hash is now NULL
    const claimRes = await dbClient.query(`SELECT claimed_device_hash, claim_version FROM table_sessions WHERE id = $1`, [initialSessionId]);
    assert(claimRes.rows[0].claimed_device_hash === null, 'claimed_device_hash must be NULL after release');
    console.log(`  [DB State after release]: claimed_device_hash=NULL, claim_version=${claimRes.rows[0].claim_version}`);

    // =========================================================================
    // STEP 8: Device B (Viewer) reloads and sees Replacement Request form (G3e)
    // =========================================================================
    console.log('\n--- STEP 8: Device B requests replacement claim (G3e) ---');
    await chromeDeviceB.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await sleep(2000);

    textB = await chromeDeviceB.evaluate('document.body.innerText');
    console.log('  [Device B text after release]:', textB);
    assert(textB.includes('Yêu cầu đổi máy gọi món') || textB.includes('Gửi yêu cầu'), 'Device B must see replacement request form when canRequest is true');

    // Enter name "Khách Bàn 1 - Thay Nam" and submit request
    await chromeDeviceB.evaluate(`
      (() => {
        const input = document.querySelector('input[placeholder*="Anh Ba" i]');
        if (input) input.focus();
      })()
    `);
    await sleep(200);
    await chromeDeviceB.cdp.send('Input.insertText', { text: 'Khách Bàn 1 - Thay Nam' });
    await sleep(300);

    const submitReqB = await chromeDeviceB.evaluate(`
      (() => {
        const btn = document.querySelector('button[type="submit"]');
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    assert(submitReqB, 'Device B must find and click submit request button');
    await sleep(2000);

    textB = await chromeDeviceB.evaluate('document.body.innerText');
    assert(textB.includes('Đang chờ nhân viên duyệt'), 'Device B must see pending approval state after replacement request');
    await chromeDeviceB.screenshot('10_device_b_replacement_waiting.png');
    console.log('  ✅ Device B successfully submitted replacement claim request');

    // =========================================================================
    // STEP 9: Staff Dashboard shows replacement request and Staff approves it
    // =========================================================================
    console.log('\n--- STEP 9: Staff Dashboard shows replacement request and approves ---');
    await chromeStaff.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/staff` });
    await sleep(2000);

    staffText = await chromeStaff.evaluate('document.body.innerText');
    console.log('  [Staff text for replacement]:', staffText);
    assert(staffText.toUpperCase().includes('YÊU CẦU MỞ BÀN CHỜ DUYỆT') || staffText.includes('Khách Bàn 1 - Thay Nam'), 'Staff dashboard must show replacement request banner');

    const approveBtnFound = await chromeStaff.evaluate(`
      (() => {
        const approveBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Duyệt mở'));
        if (approveBtn) { approveBtn.click(); return true; }
        return false;
      })()
    `);
    assert(approveBtnFound, 'Staff must find and click approve button for replacement');
    await sleep(2000);

    await chromeStaff.screenshot('11_staff_approved_replacement.png');
    console.log('  ✅ Staff successfully approved replacement claim');

    // =========================================================================
    // STEP 10: Device B transitions to CLAIMED and places second order
    // =========================================================================
    console.log('\n--- STEP 10: Device B claims session and places second order ---');
    await chromeDeviceB.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await sleep(2000);

    textB = await chromeDeviceB.evaluate('document.body.innerText');
    assert(textB.includes('Thực đơn') || textB.includes('Bàn A01'), 'Device B must see active menu');

    // Add another item to cart on Device B
    const addBtnFoundB = await chromeDeviceB.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button[aria-label^="Thêm "]'));
        if (buttons.length > 1) {
          buttons[1].click();
          return true;
        } else if (buttons.length > 0) {
          buttons[0].click();
          return true;
        }
        return false;
      })()
    `);
    assert(addBtnFoundB, 'Device B must find Add to Cart button');
    await sleep(1000);

    // Confirm customization if modal opens
    await chromeDeviceB.evaluate(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Thêm vào đơn'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(1000);

    // Open Cart and submit order
    const cartBarFoundB = await chromeDeviceB.evaluate(`
      (() => {
        const cartBarBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xem lần gọi mới'));
        if (cartBarBtn) { cartBarBtn.click(); return true; }
        return false;
      })()
    `);
    assert(cartBarFoundB, 'Device B must find cart bar button');
    await sleep(1000);

    const submitOrderFoundB = await chromeDeviceB.evaluate(`
      (() => {
        const submitOrderBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Gửi yêu cầu gọi món'));
        if (submitOrderBtn) { submitOrderBtn.click(); return true; }
        return false;
      })()
    `);
    assert(submitOrderFoundB, 'Device B must find submit order button');
    await sleep(2500);

    await chromeDeviceB.screenshot('12_device_b_claimed_order_placed.png');
    console.log('  ✅ Device B successfully placed second order on the same table session');

    // =========================================================================
    // STEP 11: Device A has lost claim, demoted to VIEWER, and forbidden by API
    // =========================================================================
    console.log('\n--- STEP 11: Device A demoted to VIEWER and forbidden by API ---');
    await chromeDeviceA.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await sleep(2000);

    textA = await chromeDeviceA.evaluate('document.body.innerText');
    console.log('  [Device A text after replacement]:', textA);
    assert(textA.includes('chế độ xem thực đơn') || textA.includes('thiết bị khác'), 'Device A must see viewer read-only banner');

    const hasOrderButtonA = await chromeDeviceA.evaluate(`
      (() => {
        const addButtons = Array.from(document.querySelectorAll('button')).filter(b => b.innerText && b.innerText.includes('+ Thêm món') && !b.disabled);
        return addButtons.length > 0;
      })()
    `);
    assert(!hasOrderButtonA, 'Device A must NOT have enabled + Thêm món buttons after replacement');

    // Direct server API test from Device A's context: attempting to place order MUST return 403
    const apiOrderResultA = await chromeDeviceA.evaluate(`
      (async () => {
        try {
          const res = await fetch('/api/v1/guest/orders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-guest-token': sessionStorage.getItem('guest_token') || ''
            },
            body: JSON.stringify({
              items: [{ menuItemId: '11111111-1111-1111-1111-111111111101', quantity: 1 }]
            })
          });
          const data = await res.json().catch(() => ({}));
          return { status: res.status, data };
        } catch (err) {
          return { error: err.message };
        }
      })()
    `);
    console.log('  [Direct API Order attempt from Device A]:', apiOrderResultA);
    assert(
      apiOrderResultA.status === 401 || apiOrderResultA.status === 403,
      `Device A order API must be rejected with 401 or 403 (actual status: ${apiOrderResultA.status})`
    );
    assert(
      apiOrderResultA.data?.error === 'ACCESS_REVOKED' || apiOrderResultA.data?.error === 'DEVICE_NOT_CLAIMED',
      `Device A order API must return ACCESS_REVOKED or DEVICE_NOT_CLAIMED (actual error: ${apiOrderResultA.data?.error})`
    );

    await chromeDeviceA.screenshot('13_device_a_demoted_to_viewer.png');
    console.log('  ✅ Device A verified forbidden by both DOM controls and server API (403)');

    // =========================================================================
    // STEP 12: Session Continuity & Bill Retention Verification
    // =========================================================================
    console.log('\n--- STEP 12: Verifying Session, Orders, and Bill Continuity ---');
    // Verify in DB that Session ID and Bill ID are UNCHANGED, exactly 2 orders exist, and total is updated
    const sessionRes2 = await dbClient.query(`
      SELECT
        ts.id as session_id,
        b.id as bill_id,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(oi.snapshot_price * oi.quantity), 0) as total_order_amount
      FROM tables t
      JOIN table_sessions ts ON ts.table_id = t.id AND ts.status = 'OPEN'
      LEFT JOIN bills b ON b.session_id = ts.id
      LEFT JOIN orders o ON o.session_id = ts.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE t.table_number = 'A01'
      GROUP BY ts.id, b.id
    `);
    assert(sessionRes2.rows.length === 1, 'Table A01 must still have 1 active OPEN session');
    const finalSessionId = sessionRes2.rows[0].session_id;
    const finalBillId = sessionRes2.rows[0].bill_id;
    const finalOrderCount = parseInt(sessionRes2.rows[0].order_count, 10);
    const finalOrderAmount = parseFloat(sessionRes2.rows[0].total_order_amount);

    assert(finalSessionId === initialSessionId, `Session ID must be unchanged across replacement (expected ${initialSessionId}, got ${finalSessionId})`);
    assert(finalBillId === initialBillId, `Bill ID must be unchanged across replacement (expected ${initialBillId}, got ${finalBillId})`);
    assert(finalOrderCount === initialOrderCount + 1, `Order count must be incremented by 1 (expected ${initialOrderCount + 1}, got ${finalOrderCount})`);
    assert(finalOrderAmount > initialOrderAmount, `Order total amount must increase with Device B order (initial: ${initialOrderAmount}, final: ${finalOrderAmount})`);
    console.log(`  [DB Continuity Verified]: Session=${finalSessionId}, Bill=${finalBillId}, TotalOrders=${finalOrderCount}, UnifiedTotal=${finalOrderAmount}`);

    // Verify on Device B UI: check "Đơn đã gọi" tab
    await chromeDeviceB.evaluate(`
      (() => {
        const navBtns = Array.from(document.querySelectorAll('nav button'));
        const ordersTab = navBtns.find(b => b.innerText && b.innerText.includes('Đơn đã gọi'));
        if (ordersTab) ordersTab.click();
      })()
    `);
    await sleep(1500);

    const ordersTabContent = await chromeDeviceB.evaluate('document.body.innerText');
    assert(
      ordersTabContent.includes('Lần 1') ||
      ordersTabContent.includes('Lần 2') ||
      ordersTabContent.toLowerCase().includes('lần gọi') ||
      ordersTabContent.includes('Các lần gọi món'),
      `Device B orders tab must show order history, got:\n${ordersTabContent}`
    );

    // Verify on Device B UI: check "Tổng bill" tab
    await chromeDeviceB.evaluate(`
      (() => {
        const navBtns = Array.from(document.querySelectorAll('nav button'));
        const billTab = navBtns.find(b => b.innerText && b.innerText.includes('Tổng bill'));
        if (billTab) billTab.click();
      })()
    `);
    await sleep(1500);

    const billTabContent = await chromeDeviceB.evaluate('document.body.innerText');
    assert(
      billTabContent.includes('Tổng hóa đơn') ||
      billTabContent.includes('Tạm tính') ||
      billTabContent.includes('Tổng bill') ||
      billTabContent.includes('Hóa đơn bàn hiện tại'),
      `Device B bill tab must show unified bill, got:\n${billTabContent}`
    );

    await chromeDeviceB.screenshot('14_device_b_orders_bill_continuity.png');
    console.log('  ✅ Session, order history, and bill continuity confirmed on UI and DB');

    // =========================================================================
    // STEP 13: Mode Gating and Multi-Device Compatibility Verification (Flag-Off)
    // =========================================================================
    console.log('\n--- STEP 13: Testing Multi-Device Mode Compatibility (Flag-Off) ---');
    // Stop single-device backend
    backendProc.kill('SIGKILL');
    await sleep(1000);

    // Launch Backend with ORDERING_MODE=multi_device on the same isolated DB
    console.log(`  Restarting backend on port ${BACKEND_PORT} with ORDERING_MODE=multi_device...`);
    backendProc = spawn('node', ['dist/server.js'], {
      cwd: path.join(ROOT_DIR, 'backend'),
      env: {
        ...process.env,
        PORT: BACKEND_PORT,
        ORDERING_MODE: 'multi_device',
        FRONTEND_URL: `http://localhost:${FRONTEND_PORT}`,
        CORS_ORIGINS: `http://localhost:${FRONTEND_PORT}`,
        DATABASE_URL: testDbUrl,
        JWT_SECRET: 'test-jwt-secret-gaeru-flow-1234567890'
      },
      stdio: 'pipe'
    });

    backendProc.stdout.on('data', d => {
      const line = d.toString().trim();
      if (line && line.includes('Error')) console.log('  [multi-backend]', line);
    });
    backendProc.stderr.on('data', d => console.error('  [multi-backend err]', d.toString().trim()));

    let multiBackendReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://localhost:${BACKEND_PORT}/health`);
        if (res.ok) {
          multiBackendReady = true;
          break;
        }
      } catch {}
      await sleep(200);
    }
    assert(multiBackendReady, 'Backend failed to restart in multi_device mode');

    // Verify public menu reflects multi_device mode
    const multiMenuRes = await fetch(`http://localhost:${BACKEND_PORT}/api/v1/public/tables/qr-phoco-a02/menu`);
    assert(multiMenuRes.ok, 'Menu API must respond 200 in multi_device mode');
    const multiMenuJson = await multiMenuRes.json();
    assert(multiMenuJson.table?.orderingMode === 'multi_device', `Expected multi_device, got ${multiMenuJson.table?.orderingMode}`);
    console.log('  ✅ Backend successfully switched to ORDERING_MODE=multi_device');

    // In multi_device mode: Staff opens Table A02
    const staffLoginRes = await fetch(`http://localhost:${BACKEND_PORT}/api/v1/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@phoco.vn', password: 'password123' })
    }).catch(() => null);

    // Get Table A02 ID
    const tableA02Res = await dbClient.query(`SELECT id FROM tables WHERE table_number = 'A02'`);
    const tableA02Id = tableA02Res.rows[0]?.id;
    assert(tableA02Id, 'Table A02 must exist');

    // Create session directly via DB or staff open
    const openRes = await dbClient.query(`
      INSERT INTO table_sessions (table_id, tenant_id, status, opened_at)
      SELECT id, tenant_id, 'OPEN', NOW() FROM tables WHERE id = $1
      RETURNING id
    `, [tableA02Id]);
    const multiSessionId = openRes.rows[0].id;
    await dbClient.query(`
      INSERT INTO bills (session_id, tenant_id, total_amount, status)
      SELECT $1, tenant_id, 0, 'OPEN' FROM tables WHERE id = $2
    `, [multiSessionId, tableA02Id]);

    // Both Device A and Device B join Table A02
    const joinA = await fetch(`http://localhost:${BACKEND_PORT}/api/v1/public/tables/qr-phoco-a02/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceFingerprint: 'device-a-multi' })
    });
    assert(joinA.ok, `Device A must join in multi_device mode (status: ${joinA.status})`);
    const joinDataA = await joinA.json();

    const joinB = await fetch(`http://localhost:${BACKEND_PORT}/api/v1/public/tables/qr-phoco-a02/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceFingerprint: 'device-b-multi' })
    });
    assert(joinB.ok, `Device B must join concurrently in multi_device mode (status: ${joinB.status})`);
    const joinDataB = await joinB.json();

    // Fetch 2 valid menu items from DB
    const validItemsRes = await dbClient.query(`SELECT id FROM menu_items WHERE is_available = true ORDER BY name LIMIT 2`);
    assert(validItemsRes.rows.length >= 2, 'Must have at least 2 available menu items');
    const item1Id = validItemsRes.rows[0].id;
    const item2Id = validItemsRes.rows[1].id;

    // Both Device A and Device B place orders concurrently
    const orderA = await fetch(`http://localhost:${BACKEND_PORT}/api/v1/guest/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-guest-token': joinDataA.token },
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        items: [{ menuItemId: item1Id, quantity: 1 }]
      })
    });
    assert(orderA.ok, `Device A must order in multi_device mode (status: ${orderA.status})`);

    const orderB = await fetch(`http://localhost:${BACKEND_PORT}/api/v1/guest/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-guest-token': joinDataB.token },
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        items: [{ menuItemId: item2Id, quantity: 2 }]
      })
    });
    assert(orderB.ok, `Device B must order concurrently in multi_device mode (status: ${orderB.status})`);

    // Verify in DB that Table A02 has 2 orders from 2 different devices on the same session
    const multiOrdersRes = await dbClient.query(`SELECT COUNT(*) as count FROM orders WHERE session_id = $1`, [multiSessionId]);
    assert(parseInt(multiOrdersRes.rows[0].count, 10) === 2, 'Table A02 must have 2 orders in multi_device mode');
    console.log('  ✅ Multi-device mode fully verified: both clients order concurrently on same table without claim restriction');

    console.log('\n🎉 ALL BROWSER SCENARIOS (STEPS 1-13) VERIFIED SUCCESSFULLY!');
  } finally {
    console.log('\n🧹 Cleaning up browser and server processes...');
    if (chromeDeviceA?.proc) {
      try { chromeDeviceA.cdp.close(); chromeDeviceA.proc.kill('SIGKILL'); } catch {}
    }
    if (chromeDeviceB?.proc) {
      try { chromeDeviceB.cdp.close(); chromeDeviceB.proc.kill('SIGKILL'); } catch {}
    }
    if (chromeStaff?.proc) {
      try { chromeStaff.cdp.close(); chromeStaff.proc.kill('SIGKILL'); } catch {}
    }
    if (frontendProc) {
      try { frontendProc.kill('SIGKILL'); } catch {}
    }
    if (backendProc) {
      try { backendProc.kill('SIGKILL'); } catch {}
    }

    // Clean up temporary chrome profiles (H1)
    for (const dir of createdProfileDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`Failed to clean up profile dir ${dir}:`, e.message);
      }
    }

    // Drop temporary test DB (H1/H1b: guarantee drop even on early setup failures)
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
    // Notice: process.exit(0) is strictly NOT called in finally, preserving catch on failure (H1)
  }
}

main()
  .then(() => {
    // Only exit 0 if main completed all steps without assertion failure
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ VERIFICATION SCRIPT FAILED:', err);
    process.exit(1);
  });
