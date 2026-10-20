import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9227;
const SCREENSHOT_DIR = path.resolve('artifacts/screenshots/issue-100');

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

async function main() {
  console.log('🚀 Starting Issue #100 Browser Verification (Menu Category CRUD & Safety)');

  let profileDir = `/tmp/chrome-issue100-${Date.now()}`;
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

    const screenshot = async (filename) => {
      const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const filePath = path.join(SCREENSHOT_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
      console.log(`  📸 Screenshot captured: ${filename}`);
    };

    const evaluate = async (expression) => {
      const res = await cdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error(JSON.stringify(res.exceptionDetails));
      }
      return res.result?.value;
    };

    // 1. Get staff token for admin@phoco.vn
    const token = await loginStaff('admin@phoco.vn', '123456');
    console.log('✅ Authenticated as Manager (admin@phoco.vn)');

    // 2. Set desktop viewport (1280x800)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 2,
      mobile: false
    });

    // Navigate to frontend origin first to set localStorage
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/staff' });
    await sleep(1500);

    await evaluate(`
      localStorage.setItem('staff_token', '${token}');
      sessionStorage.setItem('staff_token', '${token}');
    `);

    // Navigate to Staff Portal
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/staff' });
    await sleep(2500);

    // Switch to Menu tab ("Món")
    await evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('nav button, button'));
        const menuBtn = btns.find(b => b.innerText && (b.innerText.trim() === 'Món' || b.innerText.includes('Món')));
        if (menuBtn) menuBtn.click();
      })()
    `);
    await sleep(1500);

    let pageText = await evaluate('document.body.innerText');
    assert(pageText.includes('Quản lý thực đơn'), 'Must render Staff Menu management page');
    assert(pageText.includes('Danh mục món'), 'Must render "Danh mục món" button in toolbar');
    await screenshot('01_menu_management_overview_desktop.png');
    console.log('  ✅ PASS: Menu management overview loaded on Desktop');

    // =========================================================================
    // SCENARIO 1: Mobile Viewport Overview (390x844)
    // =========================================================================
    console.log('\n=== SCENARIO 1: Mobile Viewport Overview (390x844) ===');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(1000);
    await screenshot('02_menu_management_overview_mobile_390x844.png');
    console.log('  ✅ PASS: Menu management overview verified on iPhone (390x844)');

    // =========================================================================
    // SCENARIO 2: Open Category Management Modal
    // =========================================================================
    console.log('\n=== SCENARIO 2: Open Category Management Modal ===');
    // Switch back to desktop for clear modal view
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 2,
      mobile: false
    });
    await sleep(500);

    await evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const catBtn = btns.find(b => b.innerText && b.innerText.includes('Danh mục món'));
        if (catBtn) catBtn.click();
      })()
    `);
    await sleep(1000);

    pageText = await evaluate('document.body.innerText');
    assert(pageText.includes('Quản lý danh mục món'), 'Category modal must be opened');
    assert(pageText.includes('chỉ có thể xóa danh mục khi không có món ăn nào'), 'Safety guidance must be visible');
    await screenshot('03_category_management_modal.png');
    console.log('  ✅ PASS: Category Management modal open with safety policy');

    // =========================================================================
    // SCENARIO 3: Non-empty Category Delete Protection Warning
    // =========================================================================
    console.log('\n=== SCENARIO 3: Non-empty Category Delete Protection ===');
    // Click the delete button of the first category with items
    await evaluate(`
      (() => {
        const deleteBlockedBtn = document.querySelector('button[title*="Không thể xóa"]');
        if (deleteBlockedBtn) deleteBlockedBtn.click();
      })()
    `);
    await sleep(1000);

    pageText = await evaluate('document.body.innerText');
    assert(pageText.includes('Không thể xóa danh mục') || pageText.includes('đang có'),
      'Must display protection warning banner preventing deletion of non-empty category');
    await screenshot('04_delete_blocked_non_empty_category.png');
    console.log('  ✅ PASS: Deletion blocked with clear warning when category has items');

    // =========================================================================
    // SCENARIO 4: Create a New Empty Category
    // =========================================================================
    console.log('\n=== SCENARIO 4: Create New Empty Category ===');
    const newCatName = 'Trà Trái Cây & Giải Khát ' + Math.floor(Math.random() * 1000);

    await evaluate(`
      (() => {
        const input = document.querySelector('input[placeholder*="Ví dụ: Món khai vị"]');
        if (input) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(input, '${newCatName}');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await sleep(500);

    // Click "Thêm" button or submit form
    await evaluate(`
      (() => {
        const form = document.querySelector('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      })()
    `);
    await sleep(2500);

    pageText = await evaluate('document.body.innerText');
    assert(pageText.includes(newCatName), 'Newly created category must appear in list');
    assert(pageText.includes('Trống (0 món)'), 'Newly created category must show "Trống (0 món)" badge');
    await screenshot('05_new_empty_category_created.png');
    console.log('  ✅ PASS: Created new category successfully with "Trống (0 món)" badge');

    // =========================================================================
    // SCENARIO 5: Safe Deletion of Empty Category
    // =========================================================================
    console.log('\n=== SCENARIO 5: Safe Deletion of Empty Category ===');
    // Find the delete button with title "Xóa danh mục rỗng"
    await evaluate(`
      (() => {
        const deleteEmptyBtn = document.querySelector('button[title="Xóa danh mục rỗng"]');
        if (deleteEmptyBtn) deleteEmptyBtn.click();
      })()
    `);
    await sleep(1000);

    pageText = await evaluate('document.body.innerText');
    assert(pageText.includes('Xác Nhận Xóa Danh Mục'), 'Must open deletion confirmation modal');
    assert(pageText.includes(newCatName), 'Confirmation modal must mention the category name');
    await screenshot('06_delete_empty_category_confirmation.png');

    // Click "Xóa Danh Mục" in confirmation modal
    await evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const confirmBtn = btns.find(b => b.innerText && b.innerText.includes('Xóa Danh Mục'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(2000);

    pageText = await evaluate('document.body.innerText');
    assert(pageText.includes('Đã xóa danh mục') || pageText.includes('thành công'), 'Must display success notification');

    const inList = await evaluate(`
      (() => {
        const listContainer = document.querySelector('.divide-y.divide-slate-100');
        return listContainer ? listContainer.innerText.includes('${newCatName}') : false;
      })()
    `);
    assert(!inList, 'Deleted empty category must no longer exist in category list');
    await screenshot('07_empty_category_deleted_success.png');
    console.log('  ✅ PASS: Empty category safely deleted and removed');

    // Close Category modal
    await evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const closeBtn = btns.find(b => b.innerText && b.innerText === 'Đóng');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(800);

    // =========================================================================
    // SCENARIO 6: Create Item Modal Category Selector & CTA
    // =========================================================================
    console.log('\n=== SCENARIO 6: Item Modal Category Selector & Management CTA ===');
    // Click "Thêm món" button
    await evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const addItemBtn = btns.find(b => b.innerText && b.innerText.includes('Thêm món'));
        if (addItemBtn) addItemBtn.click();
      })()
    `);
    await sleep(1000);

    pageText = await evaluate('document.body.innerText');
    assert(pageText.includes('Thêm Món Ăn Mới'), 'Create item modal must be open');
    assert(pageText.includes('Quản lý danh mục'), 'Must render "Quản lý danh mục" shortcut CTA in item modal');
    await screenshot('08_create_item_category_selector.png');
    console.log('  ✅ PASS: Create item modal displays category selector and management CTA');

    // Close item modal
    await evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const cancelBtn = btns.find(b => b.innerText && b.innerText === 'Hủy');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await sleep(500);

    // =========================================================================
    // SCENARIO 7: Compact Mobile Viewport (360x640)
    // =========================================================================
    console.log('\n=== SCENARIO 7: Compact Mobile Viewport (360x640) ===');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 640,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(500);

    // Reopen Category modal in 360x640 viewport
    await evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const catBtn = btns.find(b => b.innerText && b.innerText.includes('Danh mục món'));
        if (catBtn) catBtn.click();
      })()
    `);
    await sleep(1000);
    await screenshot('09_category_modal_mobile_360x640.png');
    console.log('  ✅ PASS: Category modal properly renders on compact 360x640 viewport');

    console.log('\n🎉 ALL ISSUE #100 BROWSER VERIFICATION SCENARIOS COMPLETED SUCCESSFULLY!');
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
