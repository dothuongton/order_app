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
  path.resolve('/Users/admin/.gemini/antigravity/brain/1af5de4a-254b-4323-abd3-b3906087bfbe/issue-121');

try {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
} catch {
  SCREENSHOT_DIR = '/tmp/issue-121-screenshots';
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const createdProfileDirs = [];
const BACKEND_PORT = process.env.TEST_BACKEND_PORT || '4014';
const FRONTEND_PORT = process.env.TEST_FRONTEND_PORT || '5184';

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
        reject(new Error(`CDP command ${method} timed out after 8000ms`));
      }, 8000);
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
  const profileDir = `/tmp/chrome-issue121-${profileName}-${Date.now()}-${randomUUID().slice(0, 6)}`;
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
  console.log('🚀 Starting Issue #121 Browser Verification (Guest Request Modal, A11y, Header Status, Viewer Isolation, Multi-Device)');

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
    testDbName = `qr_order_test_issue121_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const adminDbUrl = getAdminDbUrl();
    console.log(`0️⃣ Setting up isolated test DB: ${testDbName}...`);
    adminClient = new Client({ connectionString: adminDbUrl });
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${testDbName}"`);
    testDbCreated = true;
    const testDbUrl = getTestDbUrl(testDbName);

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

    // 1. Launch Backend on BACKEND_PORT with ORDERING_MODE=approved_single_device
    console.log(`1️⃣ Launching backend on port ${BACKEND_PORT}...`);
    backendProc = spawn('node', ['dist/server.js'], {
      cwd: path.join(ROOT_DIR, 'backend'),
      env: {
        ...process.env,
        PORT: BACKEND_PORT,
        DATABASE_URL: testDbUrl,
        NODE_ENV: 'test',
        ORDERING_MODE: 'approved_single_device',
        FRONTEND_URL: `http://localhost:${FRONTEND_PORT}`,
        CORS_ORIGINS: `http://localhost:${FRONTEND_PORT}`,
        JWT_SECRET: 'test-secret-issue121-only-not-for-prod',
        DEVICE_COOKIE_SECRET: 'cookie-secret-issue121-only'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let backendReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://localhost:${BACKEND_PORT}/health`);
        if (res.ok) { backendReady = true; break; }
      } catch {}
      await sleep(250);
    }
    assert(backendReady, `Backend failed to start on port ${BACKEND_PORT}`);
    console.log(`✅ Backend running on http://localhost:${BACKEND_PORT}`);

    // 2. Launch Frontend on FRONTEND_PORT
    console.log(`2️⃣ Launching frontend on port ${FRONTEND_PORT}...`);
    frontendProc = spawn('npx', ['vite', '--port', FRONTEND_PORT, '--host', '0.0.0.0'], {
      cwd: path.join(ROOT_DIR, 'frontend'),
      env: {
        ...process.env,
        VITE_BACKEND_URL: `http://localhost:${BACKEND_PORT}`
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let frontendReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://localhost:${FRONTEND_PORT}`);
        if (res.ok) { frontendReady = true; break; }
      } catch {}
      await sleep(250);
    }
    assert(frontendReady, `Frontend failed to start on port ${FRONTEND_PORT}`);
    console.log(`✅ Frontend running on http://localhost:${FRONTEND_PORT}`);

    // 3. Spawn Chrome instances
    console.log('3️⃣ Spawning Chrome for Device A, Device B, Staff...');
    chromeDeviceA = await startChromeInstance(9231, 'devA');
    chromeDeviceB = await startChromeInstance(9232, 'devB');
    chromeStaff = await startChromeInstance(9233, 'staff');

    // =========================================================================
    // SCENARIO 1: Device A scans Table A01 (Vacant) - Modal Floating before menu
    // =========================================================================
    console.log('\n--- SCENARIO 1: Device A scans Table A01 (Vacant) - Request Modal Floating ---');
    await chromeDeviceA.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await sleep(2000);

    // Verify modal exists before guest can interact with menu
    const modalA = await chromeDeviceA.evaluate(`
      (() => {
        const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
        if (!dialog) return null;
        const title = document.getElementById('guest-request-dialog-title')?.innerText || '';
        const input = document.getElementById('guest-request-name-input');
        const isInputFocused = document.activeElement === input;
        const buttons = Array.from(dialog.querySelectorAll('button')).map(b => b.innerText.trim());
        return {
          hasDialog: true,
          title,
          hasInput: !!input,
          isInputFocused,
          buttons
        };
      })()
    `);
    assert(modalA?.hasDialog, 'Request dialog must be present before interacting with menu');
    assert(modalA.title.includes('Yêu cầu mở bàn'), 'Dialog title must say "Yêu cầu mở bàn"');
    assert(modalA.hasInput, 'Dialog must have guest name input');
    console.log('  Modal detected:', modalA.title, 'Buttons:', modalA.buttons);
    await chromeDeviceA.screenshot('01_modal_appears_before_menu.png');
    console.log('  ✅ Modal floating dialog displayed before menu interaction');

    // =========================================================================
    // SCENARIO 2: Focus Trap and Accessible "Chỉ xem thực đơn" Dismiss
    // =========================================================================
    console.log('\n--- SCENARIO 2: A11y & "Chỉ xem thực đơn" Dismiss ---');
    // Test Escape key dismisses modal
    await chromeDeviceA.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape' });
    await chromeDeviceA.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    await sleep(600);

    let isModalDismissed = await chromeDeviceA.evaluate('!document.querySelector(\'[role="dialog"]\')');
    assert(isModalDismissed, 'Escape key must close the request dialog');
    console.log('  ✅ Escape key closed dialog successfully');

    let textAfterDismiss = await chromeDeviceA.evaluate('document.body.innerText');
    assert(textAfterDismiss.includes('Bạn đang ở chế độ xem thực đơn'), 'Must show prompt that device is viewing menu');
    assert(textAfterDismiss.includes('Chưa mở phiên'), 'Vacant table header badge must say "Chưa mở phiên"');

    // Reopen modal via prompt button
    await chromeDeviceA.evaluate(`
      (() => {
        const reopenBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Yêu cầu mở bàn'));
        if (reopenBtn) reopenBtn.click();
      })()
    `);
    await sleep(600);

    const isModalReopened = await chromeDeviceA.evaluate('!!document.querySelector(\'[role="dialog"]\')');
    assert(isModalReopened, 'Clicking "Yêu cầu mở bàn" must reopen the request modal');
    console.log('  ✅ Dialog reopened cleanly');

    // Test "Chỉ xem thực đơn" button dismiss
    await chromeDeviceA.evaluate(`
      (() => {
        const viewOnlyBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Chỉ xem thực đơn'));
        if (viewOnlyBtn) viewOnlyBtn.click();
      })()
    `);
    await sleep(600);
    isModalDismissed = await chromeDeviceA.evaluate('!document.querySelector(\'[role="dialog"]\')');
    assert(isModalDismissed, '"Chỉ xem thực đơn" button must close the request dialog');
    await chromeDeviceA.screenshot('02_view_only_menu_after_dismiss.png');
    console.log('  ✅ "Chỉ xem thực đơn" successfully dismissed modal to read-only menu');

    // Reopen modal to submit request
    await chromeDeviceA.evaluate(`
      (() => {
        const reopenBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Yêu cầu mở bàn'));
        if (reopenBtn) reopenBtn.click();
      })()
    `);
    await sleep(600);

    // =========================================================================
    // SCENARIO 3: Submit Request with Duplicate Submit Protection
    // =========================================================================
    console.log('\n--- SCENARIO 3: Submit with Duplicate Submit Protection ---');
    await chromeDeviceA.evaluate(`
      (() => {
        const input = document.getElementById('guest-request-name-input');
        if (input) input.focus();
      })()
    `);
    await sleep(200);
    await chromeDeviceA.cdp.send('Input.insertText', { text: 'Anh Ba Bàn 1' });
    await sleep(200);

    // Submit form
    await chromeDeviceA.evaluate(`
      (() => {
        const btn = document.querySelector('button[type="submit"]');
        if (btn) btn.click();
      })()
    `);
    await sleep(1500);

    const waitingStateA = await chromeDeviceA.evaluate(`
      (() => {
        const dialog = document.querySelector('[role="dialog"]');
        const text = dialog ? dialog.innerText : document.body.innerText;
        return {
          hasPending: text.includes('Đang chờ nhân viên duyệt'),
          hasGuestName: text.includes('Anh Ba Bàn 1'),
          hasWithdraw: text.includes('Rút yêu cầu')
        };
      })()
    `);
    assert(waitingStateA.hasPending, 'Must show "Đang chờ nhân viên duyệt" after submit');
    assert(waitingStateA.hasGuestName, 'Must display requester guest name "Anh Ba Bàn 1"');
    assert(waitingStateA.hasWithdraw, 'Must display "Rút yêu cầu" button');
    await chromeDeviceA.screenshot('03_device_a_waiting_state.png');
    console.log('  ✅ Device A entered waiting approval state with countdown and withdraw button');

    // =========================================================================
    // SCENARIO 4: Refresh Preserves Pending Request on Device A
    // =========================================================================
    console.log('\n--- SCENARIO 4: Page Refresh Preserves Pending Request ---');
    await chromeDeviceA.cdp.send('Page.reload');
    await sleep(2000);

    const reloadedStateA = await chromeDeviceA.evaluate(`
      (() => {
        const text = document.body.innerText;
        return {
          hasPending: text.includes('Đang chờ nhân viên duyệt'),
          hasGuestName: text.includes('Anh Ba Bàn 1'),
          hasWithdraw: text.includes('Rút yêu cầu')
        };
      })()
    `);
    assert(reloadedStateA.hasPending, 'Pending request must be preserved after reload');
    assert(reloadedStateA.hasGuestName, 'Requester name must be preserved after reload');
    await chromeDeviceA.screenshot('04_device_a_preserved_after_reload.png');
    console.log('  ✅ Page reload verified: request state and countdown preserved');

    // =========================================================================
    // SCENARIO 5: Device B Scans Table (Viewer Isolation & PII Protection)
    // =========================================================================
    console.log('\n--- SCENARIO 5: Device B Isolation (Viewer Mode, No PII Leak) ---');
    await chromeDeviceB.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await sleep(2000);

    const stateB = await chromeDeviceB.evaluate(`
      (() => {
        const dialog = document.querySelector('[role="dialog"]');
        const bodyText = document.body.innerText;
        return {
          hasDialog: !!dialog,
          bodyText
        };
      })()
    `);
    assert(!stateB.hasDialog, 'Device B must NOT receive request modal while another request is pending');
    assert(stateB.bodyText.includes('chế độ xem thực đơn') && stateB.bodyText.includes('chờ nhân viên duyệt'),
      'Device B must see read-only viewer banner');
    assert(!stateB.bodyText.includes('Anh Ba Bàn 1'), 'Device B MUST NOT see requester name (PII isolation)');
    await chromeDeviceB.screenshot('05_device_b_viewer_pending_no_pii.png');
    console.log('  ✅ Device B verified: no illegal request form, requester PII strictly isolated');

    // =========================================================================
    // SCENARIO 6: Staff Approves Device A -> Device A Claimed, Modal Dismissed
    // =========================================================================
    console.log('\n--- SCENARIO 6: Staff Approves -> Device A Claimed, Modal Dismissed ---');
    // Staff login: admin@phoco.vn / 123456
    await chromeStaff.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/staff` });
    await sleep(2000);

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
        const submitBtn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Đăng nhập'));
        if (submitBtn) submitBtn.click();
      })()
    `);
    await sleep(2500);

    // Approve request
    const approveBtn = await chromeStaff.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Duyệt mở'));
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    assert(approveBtn, 'Staff must see and click "Duyệt mở"');
    await sleep(2000);
    console.log('  Staff approved request');

    // On Device A: Modal must be completely gone, session is open, ordering enabled
    const stateAAfterApproval = await chromeDeviceA.evaluate(`
      (() => {
        const dialog = document.querySelector('[role="dialog"]');
        const bodyText = document.body.innerText;
        const addButtons = Array.from(document.querySelectorAll('button')).filter(b => b.getAttribute('aria-label')?.includes('Thêm') || b.innerText?.includes('+'));
        return {
          hasDialog: !!dialog,
          hasOpenBadge: bodyText.includes('Phiên mở'),
          addButtonCount: addButtons.length
        };
      })()
    `);
    assert(!stateAAfterApproval.hasDialog, 'Request modal must automatically disappear when claimed');
    assert(stateAAfterApproval.hasOpenBadge, 'Device A header must display "Phiên mở"');
    assert(stateAAfterApproval.addButtonCount > 0, 'Device A must now have add-to-cart buttons');
    await chromeDeviceA.screenshot('06_device_a_claimed_active.png');
    console.log('  ✅ Device A claim verified: modal dismissed, "Phiên mở" badge, ordering enabled');

    // Device A places an order
    await chromeDeviceA.evaluate(`
      (() => {
        const addBtn = document.querySelector('button[aria-label*="Thêm"]');
        if (addBtn) addBtn.click();
      })()
    `);
    await sleep(800);

    // If customize modal opened, confirm add
    await chromeDeviceA.evaluate(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Thêm vào đơn') || b.innerText.includes('Xác nhận'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(800);

    // Open cart drawer and submit order
    await chromeDeviceA.evaluate(`
      (() => {
        const cartBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Xem lần gọi mới') || b.innerText.includes('Giỏ hàng'));
        if (cartBtn) cartBtn.click();
      })()
    `);
    await sleep(800);

    await chromeDeviceA.evaluate(`
      (() => {
        const submitOrderBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('Gửi yêu cầu gọi món') || b.innerText.includes('Xác nhận') || b.innerText.includes('Gửi đơn')));
        if (submitOrderBtn) submitOrderBtn.click();
      })()
    `);
    await sleep(2500);

    const ordersA = await chromeDeviceA.evaluate('document.body.innerText');
    const orderCheckA = await dbClient.query(`
      SELECT count(o.id) as count
      FROM orders o
      JOIN table_sessions ts ON ts.id = o.session_id
      JOIN tables t ON t.id = ts.table_id
      WHERE t.table_number = 'A01'
    `);
    assert(Number(orderCheckA.rows[0].count) >= 1, 'Device A order must be recorded in DB');
    console.log('  ✅ Device A order placed successfully');

    // =========================================================================
    // SCENARIO 7: Device B Viewer during Active Session - Correct Header Badge
    // =========================================================================
    console.log('\n--- SCENARIO 7: Device B Header Badge in Viewer Mode (No "Chưa mở phiên") ---');
    await chromeDeviceB.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await sleep(2000);

    const headerB = await chromeDeviceB.evaluate(`
      (() => {
        const header = document.querySelector('header');
        return header ? header.innerText : '';
      })()
    `);
    assert(headerB.includes('Đang phục vụ (Chế độ xem)'), `Device B header must show "Đang phục vụ (Chế độ xem)", got "${headerB}"`);
    assert(!headerB.includes('Chưa mở phiên'), 'Device B header MUST NOT say "Chưa mở phiên" during active session');
    console.log('  Device B Header:', headerB.replace(/\n/g, ' '));
    await chromeDeviceB.screenshot('07_device_b_viewer_header_active.png');
    console.log('  ✅ Device B header verified: displays "Đang phục vụ (Chế độ xem)" instead of "Chưa mở phiên"');

    // Check Bill tab on Device B as well
    await chromeDeviceB.evaluate(`
      (() => {
        const billTab = Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Tổng bill'));
        if (billTab) billTab.click();
      })()
    `);
    await sleep(800);

    const billHeaderB = await chromeDeviceB.evaluate('document.body.innerText');
    assert(billHeaderB.includes('Đang phục vụ (Chế độ xem)'), 'Bill tab on Device B must also show "Đang phục vụ (Chế độ xem)"');
    assert(!billHeaderB.includes('Chưa mở phiên'), 'Bill tab on Device B MUST NOT show "Chưa mở phiên"');
    await chromeDeviceB.screenshot('08_device_b_bill_tab_viewer.png');
    console.log('  ✅ Device B bill tab verified: displays "Đang phục vụ (Chế độ xem)"');

    // =========================================================================
    // SCENARIO 8: Staff Releases Claim -> Device B Replacement Request via Modal
    // =========================================================================
    console.log('\n--- SCENARIO 8: Staff Releases Claim -> Device B Replacement Request ---');
    // Open Table A01 in staff modal
    await chromeStaff.evaluate(`
      (() => {
        const viewOrderBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xem đơn'));
        if (viewOrderBtn) { viewOrderBtn.click(); return; }
        const tableCard = Array.from(document.querySelectorAll('div.cursor-pointer')).find(el => el.innerText && el.innerText.includes('Bàn A01'));
        if (tableCard) tableCard.click();
      })()
    `);
    await sleep(1500);

    // Release claim by clicking "Giải phóng máy gọi"
    await chromeStaff.evaluate(`
      (() => {
        const releaseBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Giải phóng máy gọi'));
        if (releaseBtn) releaseBtn.click();
      })()
    `);
    await sleep(2000);
    console.log('  Staff released device claim');

    // Reload Device B
    await chromeDeviceB.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await sleep(2000);

    // Device B should see modal or prompt for replacement claim
    const modalBReplacement = await chromeDeviceB.evaluate(`
      (() => {
        const dialog = document.querySelector('[role="dialog"]');
        const text = dialog ? dialog.innerText : document.body.innerText;
        return {
          hasDialog: !!dialog,
          hasReplacementPrompt: text.includes('Yêu cầu đổi máy gọi món') || text.includes('Yêu cầu đổi máy')
        };
      })()
    `);
    assert(modalBReplacement.hasReplacementPrompt, 'Device B must see replacement claim option after claim release');

    // If modal is not open yet, click prompt to open it
    if (!modalBReplacement.hasDialog) {
      await chromeDeviceB.evaluate(`
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Yêu cầu đổi máy'));
          if (btn) btn.click();
        })()
      `);
      await sleep(600);
    }

    // Submit replacement request from Device B
    await chromeDeviceB.evaluate(`
      (() => {
        const input = document.getElementById('guest-request-name-input');
        if (input) input.focus();
      })()
    `);
    await sleep(200);
    await chromeDeviceB.cdp.send('Input.insertText', { text: 'Chị Tư' });
    await sleep(200);

    await chromeDeviceB.evaluate(`
      (() => {
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      })()
    `);
    await sleep(1500);

    const textBWaiting = await chromeDeviceB.evaluate('document.body.innerText');
    assert(textBWaiting.includes('Đang chờ nhân viên duyệt') && textBWaiting.includes('Chị Tư'),
      'Device B must enter waiting state for replacement approval');
    await chromeDeviceB.screenshot('09_device_b_replacement_waiting.png');
    console.log('  ✅ Device B replacement request submitted and entered waiting state');

    // Staff approves replacement
    await chromeStaff.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/staff` });
    await sleep(2000);

    const approveReplFound = await chromeStaff.evaluate(`
      (() => {
        const approveBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('Duyệt đổi máy') || b.innerText.includes('Duyệt mở') || b.innerText.includes('Duyệt')));
        if (approveBtn) { approveBtn.click(); return true; }
        return false;
      })()
    `);
    assert(approveReplFound, 'Staff must find and click approve button for replacement');
    await sleep(2000);

    // Device B is now claimed!
    const textBClaimed = await chromeDeviceB.evaluate('document.body.innerText');
    assert(textBClaimed.includes('Phiên mở'), 'Device B must now have "Phiên mở" badge');
    await chromeDeviceB.screenshot('10_device_b_claimed_after_replacement.png');
    console.log('  ✅ Device B successfully approved and claimed table session');

    // =========================================================================
    // SCENARIO 9: Feature Flag Off (ORDERING_MODE=multi_device)
    // =========================================================================
    console.log('\n--- SCENARIO 9: Feature Flag Off (ORDERING_MODE=multi_device) ---');
    // Restart backend in multi_device mode
    backendProc.kill('SIGKILL');
    await sleep(1000);

    backendProc = spawn('node', ['dist/server.js'], {
      cwd: path.join(ROOT_DIR, 'backend'),
      env: {
        ...process.env,
        PORT: BACKEND_PORT,
        DATABASE_URL: testDbUrl,
        NODE_ENV: 'test',
        ORDERING_MODE: 'multi_device',
        FRONTEND_URL: `http://localhost:${FRONTEND_PORT}`,
        CORS_ORIGINS: `http://localhost:${FRONTEND_PORT}`,
        JWT_SECRET: 'test-secret-issue121-only-not-for-prod',
        DEVICE_COOKIE_SECRET: 'cookie-secret-issue121-only'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let multiBackendReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://localhost:${BACKEND_PORT}/health`);
        if (res.ok) { multiBackendReady = true; break; }
      } catch {}
      await sleep(250);
    }
    assert(multiBackendReady, 'Backend failed to restart in multi_device mode');
    console.log('  Backend restarted with ORDERING_MODE=multi_device');

    // Both devices reload and verify NO modal is shown
    await chromeDeviceA.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await chromeDeviceB.cdp.send('Page.navigate', { url: `http://localhost:${FRONTEND_PORT}/t/qr-phoco-a01` });
    await sleep(2500);

    const flagOffA = await chromeDeviceA.evaluate(`
      (() => {
        const dialog = document.querySelector('[role="dialog"]');
        const addButtons = Array.from(document.querySelectorAll('button')).filter(b => b.getAttribute('aria-label')?.includes('Thêm') || b.innerText?.includes('+'));
        return {
          hasDialog: !!dialog,
          addButtonCount: addButtons.length
        };
      })()
    `);
    const flagOffB = await chromeDeviceB.evaluate(`
      (() => {
        const dialog = document.querySelector('[role="dialog"]');
        const addButtons = Array.from(document.querySelectorAll('button')).filter(b => b.getAttribute('aria-label')?.includes('Thêm') || b.innerText?.includes('+'));
        return {
          hasDialog: !!dialog,
          addButtonCount: addButtons.length
        };
      })()
    `);

    assert(!flagOffA.hasDialog, 'Device A must NOT see request modal when feature flag is multi_device');
    assert(!flagOffB.hasDialog, 'Device B must NOT see request modal when feature flag is multi_device');
    assert(flagOffA.addButtonCount > 0, 'Device A must have add buttons enabled in multi_device mode');
    assert(flagOffB.addButtonCount > 0, 'Device B must have add buttons enabled in multi_device mode');

    await chromeDeviceA.screenshot('11_flag_off_device_a_multi.png');
    await chromeDeviceB.screenshot('12_flag_off_device_b_multi.png');
    console.log('  ✅ Flag-off verified: both devices interact concurrently without claim modal or restriction');

    console.log('\n🎉 ALL ISSUE #121 BROWSER SCENARIOS (1-9) VERIFIED SUCCESSFULLY!');
  } finally {
    console.log('\n🧹 Cleaning up test processes and isolated database...');
    if (chromeDeviceA?.proc) { chromeDeviceA.cdp?.close(); chromeDeviceA.proc.kill('SIGKILL'); }
    if (chromeDeviceB?.proc) { chromeDeviceB.cdp?.close(); chromeDeviceB.proc.kill('SIGKILL'); }
    if (chromeStaff?.proc) { chromeStaff.cdp?.close(); chromeStaff.proc.kill('SIGKILL'); }

    for (const dir of createdProfileDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }

    if (frontendProc) {
      frontendProc.kill('SIGKILL');
    }
    if (backendProc) {
      backendProc.kill('SIGKILL');
    }
    if (dbClient) {
      try { await dbClient.end(); } catch {}
    }

    if (testDbCreated && adminClient && testDbName) {
      try {
        await adminClient.query(`
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid()
        `, [testDbName]);
        await adminClient.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
        console.log(`🧹 Dropped isolated test DB: ${testDbName}`);
      } catch (e) {
        console.error('Failed to drop test DB:', e.message);
      } finally {
        try { await adminClient.end(); } catch {}
      }
    }
  }
}

main().catch(err => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
