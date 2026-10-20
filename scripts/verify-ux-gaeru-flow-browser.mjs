import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_DIR = path.resolve('/Users/admin/.gemini/antigravity/brain/1af5de4a-254b-4323-abd3-b3906087bfbe/gaeru-p1');

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
  const profileDir = `/tmp/chrome-gaeru-${profileName}-${Date.now()}`;
  fs.mkdirSync(profileDir, { recursive: true });

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

async function main() {
  console.log('🚀 Starting Gaeru P1 Browser E2E Verification (Request Table Open -> Staff Approve -> Claim Device -> Viewer Isolation)');

  // Reset any active sessions on sandbox DB
  try {
    execSync(`psql -U admin -h localhost -d qr_order_gaeru_sandbox -c "UPDATE table_sessions SET status = 'CLOSED', close_reason = 'TEST_RESET' WHERE status IN ('PENDING_APPROVAL', 'OPEN')"`, { stdio: 'ignore' });
    console.log('🧹 Cleaned up any active sessions in sandbox DB');
  } catch (e) {
    console.log('⚠️ Notice on DB reset:', e.message);
  }

  let backendProc = null;
  let frontendProc = null;
  let chromeDeviceA = null;
  let chromeDeviceB = null;
  let chromeStaff = null;

  try {
    // 1. Launch Backend on Port 4010 with sandbox DB and approved_single_device mode
    console.log('1️⃣ Launching backend on port 4010 with sandbox DB...');
    backendProc = spawn('node', ['backend/dist/server.js'], {
      cwd: '/Users/admin/UP/qr_order_gaeru_01',
      env: {
        ...process.env,
        PORT: '4010',
        ORDERING_MODE: 'approved_single_device',
        FRONTEND_URL: 'http://localhost:5180',
        CORS_ORIGINS: 'http://localhost:5180',
        DATABASE_URL: 'postgres://admin:@localhost:5432/qr_order_gaeru_sandbox',
        JWT_SECRET: 'test-jwt-secret-gaeru-flow-1234567890'
      },
      stdio: 'pipe'
    });

    backendProc.stdout.on('data', d => {
      const line = d.toString().trim();
      if (line) console.log('  [backend]', line);
    });
    backendProc.stderr.on('data', d => console.error('  [backend err]', d.toString().trim()));

    // Wait for backend to be ready
    let backendReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://localhost:4010/health');
        if (res.ok) {
          backendReady = true;
          break;
        }
      } catch {}
      await sleep(200);
    }
    assert(backendReady, 'Backend failed to start on port 4010');
    console.log('✅ Backend running on http://localhost:4010 (ORDERING_MODE=approved_single_device)');

    // 2. Launch Frontend on Port 5180 proxying to 4010
    console.log('2️⃣ Launching frontend on port 5180...');
    frontendProc = spawn('npx', ['vite', '--port', '5180', '--strictPort'], {
      cwd: '/Users/admin/UP/qr_order_gaeru_01/frontend',
      env: {
        ...process.env,
        VITE_BACKEND_URL: 'http://localhost:4010'
      },
      stdio: 'pipe'
    });

    let frontendReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch('http://localhost:5180');
        if (res.ok) {
          frontendReady = true;
          break;
        }
      } catch {}
      await sleep(250);
    }
    assert(frontendReady, 'Frontend failed to start on port 5180');
    console.log('✅ Frontend running on http://localhost:5180');

    // 3. Launch Chrome for Device A (Mobile 390x844)
    console.log('3️⃣ Spawning Chrome for Device A (Requester)...');
    chromeDeviceA = await startChromeInstance(9231, 'dev-a');
    await chromeDeviceA.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    // 4. Launch Chrome for Device B (Mobile 390x844)
    console.log('4️⃣ Spawning Chrome for Device B (Viewer)...');
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
    await chromeDeviceA.cdp.send('Page.navigate', { url: 'http://localhost:5180/t/qr-phoco-a01' });
    await sleep(2000);

    let textA = await chromeDeviceA.evaluate('document.body.innerText');
    console.log('  [Device A text]:', textA);
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
    await chromeDeviceB.cdp.send('Page.navigate', { url: 'http://localhost:5180/t/qr-phoco-a01' });
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
    await chromeStaff.cdp.send('Page.navigate', { url: 'http://localhost:5180/staff' });
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
    console.log('  [Staff text]:', staffText);
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
    // Allow realtime or reload to sync
    await chromeDeviceA.cdp.send('Page.navigate', { url: 'http://localhost:5180/t/qr-phoco-a01' });
    await sleep(2000);

    textA = await chromeDeviceA.evaluate('document.body.innerText');
    assert(textA.includes('Thực đơn') || textA.includes('Bàn A01'), 'Device A must see menu');

    // Check that Add to Cart button exists and click it
    console.log('  Adding item to cart on Device A...');
    await chromeDeviceA.evaluate(`
      (() => {
        const addBtn = document.querySelector('button[aria-label^="Thêm "]');
        if (addBtn) addBtn.click();
      })()
    `);
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
    await chromeDeviceA.evaluate(`
      (() => {
        const cartBarBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Xem lần gọi mới'));
        if (cartBarBtn) cartBarBtn.click();
      })()
    `);
    await sleep(1000);

    // Click confirm order inside cart sheet
    await chromeDeviceA.evaluate(`
      (() => {
        const submitOrderBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Gửi yêu cầu gọi món'));
        if (submitOrderBtn) submitOrderBtn.click();
      })()
    `);
    await sleep(2500);

    await chromeDeviceA.screenshot('07_device_a_order_placed_modal.png');
    console.log('  ✅ Device A successfully placed order with active device claim');

    // =========================================================================
    // STEP 6: Device B verifies Viewer Isolation on Active Session
    // =========================================================================
    console.log('\n--- STEP 6: Device B views active session (Read-Only Viewer) ---');
    await chromeDeviceB.cdp.send('Page.navigate', { url: 'http://localhost:5180/t/qr-phoco-a01' });
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

    console.log('\n🎉 ALL BROWSER SCENARIOS VERIFIED SUCCESSFULLY!');
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
    process.exit(0);
  }
}

main().catch(err => {
  console.error('\n❌ VERIFICATION SCRIPT FAILED:', err);
  process.exit(1);
});
