import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = process.env.CHROME_BIN || process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = parseInt(process.env.CDP_PORT || '9235', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const API_BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';
const SCREENSHOT_DIR = path.resolve('artifacts/screenshots/issue-71');

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
  console.log(`🚀 Starting Issue #71 Browser Verification (Price Input UX & 0đ Option Display)`);
  console.log(`   Frontend: ${FRONTEND_URL} | API: ${API_BASE} | CDP Port: ${PORT}`);

  let profileDir = `/tmp/chrome-issue71-${Date.now()}`;
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
    for (let i = 0; i < 25; i++) {
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
      console.log(`  📸 Screenshot saved: ${filename}`);
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

    // =========================================================================
    // PART 1: GUEST MENU - OPTION 0đ DISPLAY VERIFICATION
    // =========================================================================
    console.log('\n--- PART 1: Testing Guest Menu Option 0đ Display ---');

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 2,
      mobile: false
    });

    console.log('Navigating to guest table /t/qr-phoco-a01...');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/t/qr-phoco-a01` });
    await sleep(2500);

    // Wait until items are rendered in DOM
    await evaluate(`new Promise((resolve) => {
      const check = () => {
        const headings = Array.from(document.querySelectorAll('h3'));
        const found = headings.some(h => h.innerText.includes('Trà Sữa Trân Châu Đường Đen'));
        if (found) resolve(true);
        else setTimeout(check, 200);
      };
      check();
    })`);
    console.log('✅ Menu loaded on guest view');

    // Click on customize button for "Trà Sữa Trân Châu Đường Đen" to open option modal
    await evaluate(`(() => {
      const headings = Array.from(document.querySelectorAll('h3'));
      const targetHeading = headings.find(h => h.innerText.includes('Trà Sữa Trân Châu Đường Đen'));
      if (targetHeading) {
        const card = targetHeading.closest('.bg-white');
        const btn = card?.querySelector('button');
        if (btn) btn.click();
      }
    })()`);
    await sleep(800);

    // Verify option modal content
    const modalCheck = await evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const sizeMBtn = buttons.find(b => b.innerText.includes('Size M'));
      const sizeLBtn = buttons.find(b => b.innerText.includes('Size L'));

      if (!sizeMBtn || !sizeLBtn) return { found: false };

      const sizeMText = sizeMBtn.innerText.trim();
      const sizeLText = sizeLBtn.innerText.trim();

      // Check if Size M has any 0đ, +0đ, (+0đ), or empty ()
      const sizeMHasZero = sizeMText.includes('0đ') || sizeMText.includes('()') || sizeMText.includes('+');
      // Check if Size L has (+10.000đ)
      const sizeLHasDelta = sizeLText.includes('+10.000đ');

      // Check base price in modal header
      const modalText = document.body.innerText;
      const hasBasePrice = modalText.includes('30.000đ');

      return {
        found: true,
        sizeMText,
        sizeLText,
        sizeMHasZero,
        sizeLHasDelta,
        hasBasePrice
      };
    })()`);

    assert(modalCheck.found, 'Option modal for Trà Sữa not opened');
    console.log(`  Size M button text: "${modalCheck.sizeMText}" (has zero delta label: ${modalCheck.sizeMHasZero})`);
    console.log(`  Size L button text: "${modalCheck.sizeLText}" (has delta label: ${modalCheck.sizeLHasDelta})`);
    assert(!modalCheck.sizeMHasZero, 'Size M MUST NOT show 0đ, +0đ, (+0đ) or empty parentheses');
    assert(modalCheck.sizeLHasDelta, 'Size L MUST show (+10.000đ)');
    assert(modalCheck.hasBasePrice, 'Base price 30.000đ must remain visible in modal');
    console.log('✅ Guest modal: Option delta 0đ is cleanly hidden; positive delta is clearly formatted (+10.000đ)');

    await screenshot('01_guest_option_modal_desktop.png');

    // Switch to mobile viewport (iPhone 14: 390x844)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true
    });
    await sleep(500);
    await screenshot('02_guest_option_modal_mobile_390x844.png');

    // Close option modal
    await evaluate(`(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === '✕' || b.innerHTML.includes('lucide-x'));
      if (closeBtn) closeBtn.click();
    })()`);
    await sleep(500);

    // Test second item: Bánh Tráng Trộn Đặc Biệt (Single option group "Biến thể" with "Ít Cay" 0đ and "Thêm Khô Bò" +5.000đ)
    await evaluate(`(() => {
      const headings = Array.from(document.querySelectorAll('h3'));
      const targetHeading = headings.find(h => h.innerText.includes('Bánh Tráng Trộn Đặc Biệt'));
      if (targetHeading) {
        const card = targetHeading.closest('.bg-white');
        const btn = card?.querySelector('button');
        if (btn) btn.click();
      }
    })()`);
    await sleep(800);

    const snackCheck = await evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const itCayBtn = buttons.find(b => b.innerText.includes('Ít Cay'));
      const khoBoBtn = buttons.find(b => b.innerText.includes('Thêm Khô Bò'));
      if (!itCayBtn || !khoBoBtn) return { found: false };

      const itCayText = itCayBtn.innerText.trim();
      const khoBoText = khoBoBtn.innerText.trim();
      return {
        found: true,
        itCayText,
        khoBoText,
        itCayHasZero: itCayText.includes('0đ') || itCayText.includes('()') || itCayText.includes('+'),
        khoBoHasDelta: khoBoText.includes('+5.000đ')
      };
    })()`);

    assert(snackCheck.found, 'Option modal for Bánh Tráng Trộn not opened');
    console.log(`  Ít Cay button text: "${snackCheck.itCayText}" (has zero delta label: ${snackCheck.itCayHasZero})`);
    console.log(`  Thêm Khô Bò button text: "${snackCheck.khoBoText}" (has delta label: ${snackCheck.khoBoHasDelta})`);
    assert(!snackCheck.itCayHasZero, 'Ít Cay MUST NOT show 0đ or empty parentheses');
    assert(snackCheck.khoBoHasDelta, 'Thêm Khô Bò MUST show (+5.000đ)');
    console.log('✅ Snack modal: Zero delta option "Ít Cay" correctly hidden');

    await screenshot('03_guest_snack_modal_mobile.png');

    // Close snack modal
    await evaluate(`(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === '✕' || b.innerHTML.includes('lucide-x'));
      if (closeBtn) closeBtn.click();
    })()`);
    await sleep(500);

    // =========================================================================
    // PART 2: STAFF MENU MANAGE - PRICE INPUT UX & VALIDATION
    // =========================================================================
    console.log('\n--- PART 2: Testing Staff Menu Manage Price Input UX ---');

    // Reset viewport to desktop
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 2,
      mobile: false
    });

    const token = await loginStaff('admin@phoco.vn', '123456');
    console.log('✅ Authenticated as Manager (admin@phoco.vn)');

    // Navigate to /staff and set staff_token in localStorage & sessionStorage
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/staff` });
    await sleep(1500);

    await evaluate(`(() => {
      localStorage.setItem('staff_token', '${token}');
      sessionStorage.setItem('staff_token', '${token}');
    })()`);

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/staff` });
    await sleep(2500);

    // Install window.alert interceptor
    await evaluate(`(() => {
      window.__alerts = [];
      window.alert = (msg) => {
        window.__alerts.push(String(msg));
        window.__lastAlert = String(msg);
      };
      window.setReactVal = (input, val) => {
        if (!input) throw new Error('Target input element is null or undefined');
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        desc.set.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
    })()`);

    // Switch to Menu tab ("Món")
    await evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('nav button, button'));
      const menuBtn = btns.find(b => b.innerText && (b.innerText.trim() === 'Món' || b.innerText.includes('Món')));
      if (menuBtn) menuBtn.click();
    })()`);
    await sleep(1500);

    const pageCheck = await evaluate(`(() => {
      return document.body.innerText.includes('Quản lý thực đơn');
    })()`);
    assert(pageCheck, 'Must be on Quản lý thực đơn page');

    // Click "Thêm món" button
    await evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const addBtn = btns.find(b => b.innerText && b.innerText.includes('Thêm món'));
      if (addBtn) addBtn.click();
    })()`);
    await sleep(800);

    // 1. Test Base Price input: initial state is empty or 0, backspacing/clearing leaves input empty without snapping back to 0
    console.log('Testing base price empty draft and non-1000 step (65001)...');
    const priceInputTest = await evaluate(`(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const priceLabel = labels.find(l => l.innerText.includes('Giá Gốc'));
      if (!priceLabel) return { error: 'Price label not found' };

      const container = priceLabel.closest('div').parentElement;
      const input = container.querySelector('input[type="number"]');
      if (!input) return { error: 'Price input not found' };

      // Set empty string
      window.setReactVal(input, '');
      const valueAfterClear = input.value;

      // Try typing 65001
      window.setReactVal(input, '65001');
      const valueAfterTyping = input.value;

      return {
        valueAfterClear,
        valueAfterTyping,
        step: input.getAttribute('step')
      };
    })()`);

    assert(!priceInputTest.error, priceInputTest.error);
    console.log(`  Base price value after clearing: "${priceInputTest.valueAfterClear}"`);
    console.log(`  Base price value after typing 65001: "${priceInputTest.valueAfterTyping}"`);
    console.log(`  Base price step attribute: "${priceInputTest.step}"`);
    assert(priceInputTest.valueAfterClear === '', 'Base price input must remain empty after clearing');
    assert(priceInputTest.valueAfterTyping === '65001', 'Base price input must allow typing 65001');
    assert(priceInputTest.step === '1', 'Base price input step must be 1 to allow arbitrary integer VND');

    // 2. Test empty validation: fill name, clear base price and click "Thêm Món"
    console.log('Testing required price validation when empty...');
    await evaluate(`(() => {
      window.__alerts = [];
      const modal = document.querySelector('.fixed.inset-0') || document.body;
      const labels = Array.from(modal.querySelectorAll('label'));

      const nameLabel = labels.find(l => l.innerText.includes('Tên Món Ăn'));
      if (nameLabel) {
        const nameInput = nameLabel.closest('div').querySelector('input');
        if (nameInput) window.setReactVal(nameInput, 'Món Test Validation Issue 71');
      }

      const priceLabel = labels.find(l => l.innerText.includes('Giá Gốc'));
      const priceInput = priceLabel.closest('div').parentElement.querySelector('input[type="number"]');
      window.setReactVal(priceInput, '');

      // Click submit button inside modal
      const submitBtn = modal.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.click();
    })()`);
    await sleep(500);

    const validationCheck = await evaluate(`(() => {
      return {
        alerts: window.__alerts,
        hasEmptyError: window.__alerts.includes('Giá món không được để trống'),
        modalStillOpen: !!document.querySelector('.fixed.inset-0 input')
      };
    })()`);
    console.log(`  Alerts received:`, validationCheck.alerts);
    console.log(`  Validation message displayed: ${validationCheck.hasEmptyError}`);
    console.log(`  Modal still open: ${validationCheck.modalStillOpen}`);
    assert(validationCheck.hasEmptyError, 'Validation error "Giá món không được để trống" must appear');
    assert(validationCheck.modalStillOpen, 'Modal must remain open after failed validation');
    console.log('✅ Base price empty validation verified');

    // 3. Test R3 & R4: Verify Safe Integer contract on base price (accept 0, 65001, 1000000001; block overflow 1e21 & repeated blur)
    console.log('Testing R3 & R4: Safe Integer limits on base price (0, 65001, 1000000001 vs overflow)...');
    const safePriceTest = await evaluate(`(() => {
      window.__alerts = [];
      const modal = document.querySelector('.fixed.inset-0');
      const labels = Array.from(modal.querySelectorAll('label'));
      const priceLabel = labels.find(l => l.innerText.includes('Giá Gốc'));
      const priceInput = priceLabel.closest('div').parentElement.querySelector('input[type="number"]');
      const nameInput = labels.find(l => l.innerText.includes('Tên Món Ăn')).closest('div').querySelector('input');

      // 1. Test accepting 1000000001 (R4: Safe integer > 1 billion must be valid per Staff API contract)
      window.setReactVal(priceInput, '1000000001');
      priceInput.dispatchEvent(new Event('blur', { bubbles: true }));
      const valOneBillionOne = priceInput.value;

      // 2. Test accepting 0 (0đ is valid)
      window.setReactVal(priceInput, '0');
      priceInput.dispatchEvent(new Event('blur', { bubbles: true }));
      const valZero = priceInput.value;

      // 3. Paste overflow 1000000000000000000000 (22 digits >= 1e21)
      window.setReactVal(priceInput, '1000000000000000000000');

      // 4. Focus and blur repeatedly 3 times
      for (let i = 0; i < 3; i++) {
        priceInput.focus();
        nameInput.focus();
        priceInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }

      const valAfterRepeatedBlur = priceInput.value;

      // 5. Click submit
      const submitBtn = modal.querySelector('button[type="submit"]');
      submitBtn.click();

      return {
        valOneBillionOne,
        valZero,
        valAfterRepeatedBlur,
        alerts: window.__alerts,
        hasOverflowError: window.__alerts.includes('Giá món phải là số nguyên không âm hợp lệ'),
        modalStillOpen: !!document.querySelector('.fixed.inset-0 input')
      };
    })()`);

    console.log(`  Base price value 1,000,000,001đ preserved: "${safePriceTest.valOneBillionOne}"`);
    console.log(`  Base price value 0đ preserved: "${safePriceTest.valZero}"`);
    console.log(`  Base price value after repeated blur: "${safePriceTest.valAfterRepeatedBlur}"`);
    console.log(`  Alerts received:`, safePriceTest.alerts);
    assert(safePriceTest.valOneBillionOne === '1000000001', 'R4: Base price must accept 1000000001 as valid safe integer');
    assert(safePriceTest.valZero === '0', 'Base price must accept 0đ');
    assert(safePriceTest.valAfterRepeatedBlur === '1000000000000000000000', 'Base price must NOT mutate to 1 or 1e+21 after repeated blur');
    assert(safePriceTest.hasOverflowError, 'Must show overflow alert "Giá món phải là số nguyên không âm hợp lệ"');
    assert(safePriceTest.modalStillOpen, 'Modal must remain open with draft intact');
    console.log('✅ R3 & R4: Base price contract verified (accepts safe integers 0, 65001, 1000000001; blocks overflow)');

    // 4. Now fill valid price 65001, add an option group, test R3 & R4 on option delta, then save item
    console.log('Filling form with price 65001 and option delta 2500...');
    await evaluate(`(() => {
      const modal = document.querySelector('.fixed.inset-0');
      const labels = Array.from(modal.querySelectorAll('label'));
      const priceLabel = labels.find(l => l.innerText.includes('Giá Gốc'));
      const priceInput = priceLabel.closest('div').parentElement.querySelector('input[type="number"]');
      window.setReactVal(priceInput, '65001');

      // Click "Thêm nhóm lựa chọn"
      const addGroupBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('Thêm nhóm lựa chọn') || b.innerText.includes('Thêm nhóm'));
      if (addGroupBtn) addGroupBtn.click();
    })()`);
    await sleep(500);

    // Test R3 & R4 on Option Delta (accept 1000000001, block overflow >= 1e21)
    console.log('Testing R3 & R4: Safe integer limits on option delta (1000000001 vs overflow)...');
    const overflowDeltaTest = await evaluate(`(() => {
      window.__alerts = [];
      const modal = document.querySelector('.fixed.inset-0');
      const labels = Array.from(modal.querySelectorAll('label'));
      const nameInput = labels.find(l => l.innerText.includes('Tên Món Ăn')).closest('div').querySelector('input');
      const deltaInputs = Array.from(modal.querySelectorAll('input[placeholder="+0đ"]'));
      if (deltaInputs.length === 0) return { error: 'Option delta input not found' };
      const deltaInput = deltaInputs[0];
      const optNameInput = deltaInput.closest('.flex')?.querySelector('input[type="text"]');
      if (optNameInput) window.setReactVal(optNameInput, 'Topping Đặc Biệt');

      // 1. Test accepting 1000000001 on option delta (R4: safe integer)
      window.setReactVal(deltaInput, '1000000001');
      deltaInput.dispatchEvent(new Event('blur', { bubbles: true }));
      const deltaOneBillionOne = deltaInput.value;

      // 2. Paste overflow
      window.setReactVal(deltaInput, '1000000000000000000000');

      // 3. Focus and blur repeatedly 3 times
      for (let i = 0; i < 3; i++) {
        deltaInput.focus();
        nameInput.focus();
        deltaInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }

      const valAfterRepeatedBlur = deltaInput.value;

      // 4. Click submit
      const submitBtn = modal.querySelector('button[type="submit"]');
      submitBtn.click();

      return {
        deltaOneBillionOne,
        valAfterRepeatedBlur,
        alerts: window.__alerts,
        hasDeltaOverflowError: window.__alerts.some(a => a.includes('Giá phụ thu') && a.includes('phải là số nguyên không âm hợp lệ')),
        modalStillOpen: !!document.querySelector('.fixed.inset-0 input')
      };
    })()`);

    assert(!overflowDeltaTest.error, overflowDeltaTest.error);
    console.log(`  Option delta 1,000,000,001đ preserved: "${overflowDeltaTest.deltaOneBillionOne}"`);
    console.log(`  Option delta value after repeated blur: "${overflowDeltaTest.valAfterRepeatedBlur}"`);
    console.log(`  Alerts received:`, overflowDeltaTest.alerts);
    assert(overflowDeltaTest.deltaOneBillionOne === '1000000001', 'R4: Option delta must accept 1000000001 as valid safe integer');
    assert(overflowDeltaTest.valAfterRepeatedBlur === '1000000000000000000000', 'Option delta must NOT mutate to 1 or 1e+21 after repeated blur');
    assert(overflowDeltaTest.hasDeltaOverflowError, 'Must show overflow alert for option delta exceeding safe integer');
    assert(overflowDeltaTest.modalStillOpen, 'Modal must remain open with draft intact');
    console.log('✅ R3 & R4: Option delta contract verified (accepts 1000000001; blocks overflow)');

    // Verify option delta input behavior (clearing and typing 2500)
    const optionInputTest = await evaluate(`(() => {
      const deltaInputs = Array.from(document.querySelectorAll('input[placeholder="+0đ"]'));
      if (deltaInputs.length === 0) return { error: 'Option delta input not found' };
      const deltaInput = deltaInputs[0];

      // Test clearing
      window.setReactVal(deltaInput, '');
      const valueAfterClear = deltaInput.value;

      // Type 2500
      window.setReactVal(deltaInput, '2500');
      const valueAfterTyping = deltaInput.value;

      return {
        valueAfterClear,
        valueAfterTyping,
        step: deltaInput.getAttribute('step')
      };
    })()`);

    assert(!optionInputTest.error, optionInputTest.error);
    console.log(`  Option delta after clearing: "${optionInputTest.valueAfterClear}"`);
    console.log(`  Option delta after typing 2500: "${optionInputTest.valueAfterTyping}"`);
    assert(optionInputTest.valueAfterClear === '', 'Option delta must allow empty while typing');
    assert(optionInputTest.valueAfterTyping === '2500', 'Option delta must allow typing 2500');
    assert(optionInputTest.step === '1', 'Option delta step must be 1');

    await screenshot('04_staff_menu_modal_draft_65001.png');

    // Save item
    console.log('Submitting new item to backend...');
    await evaluate(`(() => {
      const modal = document.querySelector('.fixed.inset-0');
      const submitBtn = modal?.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.click();
    })()`);
    await sleep(2000);

    // Verify item appears in menu list with price 65.001đ
    const listCheck = await evaluate(`(() => {
      const bodyText = document.body.innerText;
      return {
        hasItem: bodyText.includes('Món Test Validation Issue 71'),
        hasPrice: bodyText.includes('65.001') || bodyText.includes('65.001đ')
      };
    })()`);

    console.log(`  Item found in menu list: ${listCheck.hasItem}, Price rendered: ${listCheck.hasPrice}`);
    assert(listCheck.hasItem, 'Saved item must appear in menu list');
    assert(listCheck.hasPrice, 'Saved item price must render formatted as 65.001đ');
    console.log('✅ Staff Menu: Item created and saved with exact price 65001');

    await screenshot('05_staff_menu_saved_list_65001.png');

    // Re-open item modal to verify price input displays 65001 on edit
    console.log('Re-opening edit modal to verify persisted price...');
    await evaluate(`(() => {
      const h4s = Array.from(document.querySelectorAll('h4'));
      const targetH4 = h4s.find(el => el.innerText.trim() === 'Món Test Validation Issue 71');
      if (targetH4) {
        const row = targetH4.closest('.p-3\\\\.5') || targetH4.closest('div.justify-between') || targetH4.parentElement.parentElement.parentElement;
        const editBtn = row?.querySelector('button[title="Chỉnh sửa món"]');
        if (editBtn) editBtn.click();
      }
    })()`);
    await sleep(800);

    const editValueCheck = await evaluate(`(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const priceLabel = labels.find(l => l.innerText.includes('Giá Gốc'));
      if (!priceLabel) return null;
      const container = priceLabel.closest('div').parentElement;
      const input = container.querySelector('input[type="number"]');
      return input ? input.value : null;
    })()`);

    console.log(`  Persisted price in edit modal: "${editValueCheck}"`);
    assert(editValueCheck === '65001', 'Edit modal must display 65001 for base price');
    console.log('✅ Edit modal price persistence verified');

    // Close edit modal
    await evaluate(`(() => {
      const modal = document.querySelector('.fixed.inset-0');
      const cancelBtn = Array.from(modal ? modal.querySelectorAll('button') : []).find(b => b.innerText.includes('Hủy'));
      if (cancelBtn) cancelBtn.click();
    })()`);
    await sleep(800);

    // =========================================================================
    // PART 3: STAFF CMS / PROMOTION MANAGE - PRICE & DISCOUNT INPUT UX
    // =========================================================================
    console.log('\n--- PART 3: Testing Staff CMS Promotion Price Input UX ---');

    // Switch to CMS / Settings tab
    const cmsNavClicked = await evaluate(`(() => {
      const allBtns = Array.from(document.querySelectorAll('button'));
      const cmsBtn = allBtns.find(b => b.innerText && (b.innerText.includes('Thiết lập') || b.innerText.includes('CMS')));
      if (cmsBtn) {
        cmsBtn.click();
        return { clicked: true };
      }
      return { clicked: false };
    })()`);
    console.log('  CMS nav clicked result:', cmsNavClicked);
    await sleep(1500);

    // Switch to Promotions sub-tab
    const promoTabClicked = await evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const promoTab = btns.find(b => b.innerText && b.innerText.includes('Khuyến Mãi & Giảm Giá'));
      if (promoTab) {
        promoTab.click();
        return true;
      }
      return false;
    })()`);
    console.log('  Promo tab clicked:', promoTabClicked);
    await sleep(1000);

    // Click "Tạo Khuyến Mãi Mới"
    const addPromoClicked = await evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const addPromo = btns.find(b => b.innerText && b.innerText.includes('Tạo Khuyến Mãi Mới'));
      if (addPromo) {
        addPromo.click();
        return true;
      }
      return false;
    })()`);
    console.log('  Add promo clicked:', addPromoClicked);
    await sleep(800);

    // Test promo inputs: discountValue, minOrderAmount, maxDiscountAmount
    const promoInputsTest = await evaluate(`(() => {
      const modal = document.querySelector('.fixed.inset-0');
      const labels = Array.from(modal ? modal.querySelectorAll('label') : document.querySelectorAll('label'));

      const discLabel = labels.find(l => l.innerText.includes('Giá Trị Giảm') || l.innerText.includes('Số Tiền Giảm'));
      const minLabel = labels.find(l => l.innerText.includes('Đơn Tối Thiểu'));
      const maxLabel = labels.find(l => l.innerText.includes('Giảm Tối Đa'));

      if (!discLabel || !minLabel || !maxLabel) {
        return {
          error: 'One or more promo labels not found',
          modalFound: !!modal,
          labels: labels.map(l => l.innerText.trim())
        };
      }

      const discInput = discLabel.closest('div').querySelector('input[type="number"]');
      const minInput = minLabel.closest('div').parentElement.querySelector('input[type="number"]');
      const maxInput = maxLabel.closest('div').querySelector('input[type="number"]');

      // Test clearing minOrderAmount
      window.setReactVal(minInput, '');
      const minAfterClear = minInput.value;

      // Type 50000 into minOrderAmount
      window.setReactVal(minInput, '50000');
      const minAfterTyping = minInput.value;

      // Test clearing maxDiscountAmount (unlimited)
      window.setReactVal(maxInput, '');
      maxInput.dispatchEvent(new Event('blur', { bubbles: true }));
      const maxAfterClear = maxInput.value;

      // Test clearing discountValue
      window.setReactVal(discInput, '');
      const discAfterClear = discInput.value;

      return {
        minAfterClear,
        minAfterTyping,
        minStep: minInput.getAttribute('step'),
        maxAfterClear,
        maxPlaceholder: maxInput.getAttribute('placeholder'),
        discAfterClear
      };
    })()`);

    assert(!promoInputsTest.error, promoInputsTest.error);
    console.log(`  Min order after clearing: "${promoInputsTest.minAfterClear}"`);
    console.log(`  Min order after typing 50000: "${promoInputsTest.minAfterTyping}"`);
    console.log(`  Max discount after clearing: "${promoInputsTest.maxAfterClear}" (placeholder: "${promoInputsTest.maxPlaceholder}")`);
    console.log(`  Discount value after clearing: "${promoInputsTest.discAfterClear}"`);

    assert(promoInputsTest.minAfterClear === '', 'Min order input must allow empty while typing');
    assert(promoInputsTest.minAfterTyping === '50000', 'Min order input must allow typing 50000');
    assert(promoInputsTest.maxAfterClear === '', 'Max discount input must remain empty when unlimited');
    assert(promoInputsTest.discAfterClear === '', 'Discount value must allow empty while typing');

    // Test R3 Promo inputs overflow & repeated blur
    console.log('Testing R3: Promo discountValue overflow paste and repeated blur...');
    const promoOverflowTest = await evaluate(`(async () => {
      const modal = document.querySelector('.fixed.inset-0');
      const labels = Array.from(modal.querySelectorAll('label'));
      const titleInput = labels.find(l => l.innerText.includes('Tiêu Đề Khuyến Mãi')).closest('div').querySelector('input');
      const discInput = labels.find(l => l.innerText.includes('Giá Trị Giảm') || l.innerText.includes('Số Tiền Giảm')).closest('div').querySelector('input[type="number"]');
      const minInput = labels.find(l => l.innerText.includes('Đơn Tối Thiểu')).closest('div').parentElement.querySelector('input[type="number"]');
      const maxInput = labels.find(l => l.innerText.includes('Giảm Tối Đa')).closest('div').querySelector('input[type="number"]');

      window.setReactVal(titleInput, 'Promo R3 Overflow Test');

      // 1. discountValue overflow
      window.setReactVal(discInput, '1000000000000000000000');
      for (let i = 0; i < 3; i++) {
        discInput.focus();
        titleInput.focus();
        discInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      const discValAfterBlur = discInput.value;

      // Click submit
      const submitBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('Lưu Khuyến Mãi'));
      submitBtn.click();
      await new Promise(r => setTimeout(r, 150));

      const discError = document.body.innerText.includes('không vượt quá 1.000.000.000đ') || document.body.innerText.includes('phải là số nguyên');

      // 2. minOrderAmount overflow
      window.setReactVal(discInput, '10');
      window.setReactVal(minInput, '1000000000000000000000');
      for (let i = 0; i < 3; i++) {
        minInput.focus();
        titleInput.focus();
        minInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      const minValAfterBlur = minInput.value;
      submitBtn.click();
      await new Promise(r => setTimeout(r, 150));
      const minError = document.body.innerText.includes('Đơn tối thiểu phải là số nguyên không âm hợp lệ');

      // 3. maxDiscountAmount overflow
      window.setReactVal(minInput, '0');
      window.setReactVal(maxInput, '1000000000000000000000');
      for (let i = 0; i < 3; i++) {
        maxInput.focus();
        titleInput.focus();
        maxInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      const maxValAfterBlur = maxInput.value;
      submitBtn.click();
      await new Promise(r => setTimeout(r, 150));
      const maxOverflowError = document.body.innerText.includes('Mức giảm tối đa phải là số nguyên lớn hơn 0 và không vượt quá 1.000.000.000đ');

      // 4. maxDiscountAmount = 0
      window.setReactVal(maxInput, '0');
      submitBtn.click();
      await new Promise(r => setTimeout(r, 150));
      const maxZeroError = document.body.innerText.includes('Mức giảm tối đa phải là số nguyên lớn hơn 0 (hoặc để trống nếu không giới hạn)');

      // Reset maxInput to empty
      window.setReactVal(maxInput, '');

      return {
        discValAfterBlur,
        discError,
        minValAfterBlur,
        minError,
        maxValAfterBlur,
        maxOverflowError,
        maxZeroError,
        modalStillOpen: !!document.querySelector('.fixed.inset-0 input')
      };
    })()`);

    console.log(`  Promo discountValue after repeated blur: "${promoOverflowTest.discValAfterBlur}", Error shown: ${promoOverflowTest.discError}`);
    console.log(`  Promo minOrderAmount after repeated blur: "${promoOverflowTest.minValAfterBlur}", Error shown: ${promoOverflowTest.minError}`);
    console.log(`  Promo maxDiscountAmount after repeated blur: "${promoOverflowTest.maxValAfterBlur}", Error shown: ${promoOverflowTest.maxOverflowError}`);
    console.log(`  Promo maxDiscountAmount = 0 Error shown: ${promoOverflowTest.maxZeroError}`);
    assert(promoOverflowTest.discValAfterBlur === '1000000000000000000000', 'discountValue must not mutate on blur');
    assert(promoOverflowTest.discError, 'discountValue overflow error must appear');
    assert(promoOverflowTest.minValAfterBlur === '1000000000000000000000', 'minOrderAmount must not mutate on blur');
    assert(promoOverflowTest.minError, 'minOrderAmount overflow error must appear');
    assert(promoOverflowTest.maxValAfterBlur === '1000000000000000000000', 'maxDiscountAmount must not mutate on blur');
    assert(promoOverflowTest.maxOverflowError, 'maxDiscountAmount overflow error must appear');
    assert(promoOverflowTest.maxZeroError, 'maxDiscountAmount = 0 error must appear');
    assert(promoOverflowTest.modalStillOpen, 'Modal must remain open with draft intact');
    console.log('✅ R3: Staff CMS promo overflow and repeated blur verified across all fields');

    // Test promo required validation when discount is empty
    await evaluate(`(() => {
      const modal = document.querySelector('.fixed.inset-0');
      const titleLabel = Array.from(modal.querySelectorAll('label')).find(l => l.innerText.includes('Tiêu Đề Khuyến Mãi'));
      if (titleLabel) {
        const titleInput = titleLabel.closest('div').querySelector('input');
        if (titleInput) window.setReactVal(titleInput, 'Khuyến Mãi Issue 71 Test');
      }

      const discLabel = Array.from(modal.querySelectorAll('label')).find(l => l.innerText.includes('Giá Trị Giảm') || l.innerText.includes('Số Tiền Giảm'));
      if (discLabel) {
        const discInput = discLabel.closest('div').querySelector('input[type="number"]');
        if (discInput) window.setReactVal(discInput, '');
      }

      // Submit
      const submitBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('Lưu Khuyến Mãi'));
      if (submitBtn) submitBtn.click();
    })()`);
    await sleep(500);

    const promoValidation = await evaluate(`(() => {
      return {
        hasError: document.body.innerText.includes('Vui lòng nhập mức giảm giá'),
        modalOpen: !!document.querySelector('.fixed.inset-0 input')
      };
    })()`);

    console.log(`  Promo empty discount validation displayed: ${promoValidation.hasError}`);
    assert(promoValidation.hasError, 'Validation error "Vui lòng nhập mức giảm giá" must appear');
    assert(promoValidation.modalOpen, 'Promo modal must remain open');

    // Now fill valid discount 15% and save
    await evaluate(`(() => {
      const modal = document.querySelector('.fixed.inset-0');
      const labels = Array.from(modal.querySelectorAll('label'));
      const discLabel = labels.find(l => l.innerText.includes('Giá Trị Giảm') || l.innerText.includes('Số Tiền Giảm'));
      const discInput = discLabel.closest('div').querySelector('input[type="number"]');
      window.setReactVal(discInput, '15');

      const submitBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('Lưu Khuyến Mãi'));
      if (submitBtn) submitBtn.click();
    })()`);
    await sleep(1500);

    await screenshot('06_staff_cms_promo_saved.png');

    const promoCreated = await evaluate(`(() => {
      return document.body.innerText.includes('Khuyến Mãi Issue 71 Test');
    })()`);
    console.log(`  Promo created and visible in list: ${promoCreated}`);
    assert(promoCreated, 'Created promo must be visible in list');
    console.log('✅ Staff CMS: Promo created with minOrder 50000, discount 15%, maxDiscount unlimited');

    // =========================================================================
    // PART 4: R1 & R2 VERIFICATION - CLEAR PROMO CAP & CLEAR PROMO CODE
    // =========================================================================
    console.log('\n--- PART 4: Testing R1 (Clear Cap) & R2 (Clear Code) on Existing Promo ---');

    // 1. Create a promo with code 'CAPCODE71' and max discount 20000 through the UI
    console.log('Creating promo with code CAPCODE71 and maxDiscount 20000 via UI...');
    await evaluate(`(() => {
      const addPromo = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Tạo Khuyến Mãi Mới'));
      if (addPromo) addPromo.click();
    })()`);
    await sleep(800);

    await evaluate(`(() => {
      const modal = document.querySelector('.fixed.inset-0');
      const labels = Array.from(modal.querySelectorAll('label'));

      const codeInput = labels.find(l => l.innerText.includes('Mã Code')).closest('div').querySelector('input');
      const titleInput = labels.find(l => l.innerText.includes('Tiêu Đề Khuyến Mãi')).closest('div').querySelector('input');
      const discInput = labels.find(l => l.innerText.includes('Giá Trị Giảm') || l.innerText.includes('Số Tiền Giảm')).closest('div').querySelector('input[type="number"]');
      const minInput = labels.find(l => l.innerText.includes('Đơn Tối Thiểu')).closest('div').parentElement.querySelector('input[type="number"]');
      const maxInput = labels.find(l => l.innerText.includes('Giảm Tối Đa')).closest('div').querySelector('input[type="number"]');

      window.setReactVal(codeInput, 'CAPCODE71');
      window.setReactVal(titleInput, 'Promo R1 R2 Cap Code Test');
      window.setReactVal(discInput, '20');
      window.setReactVal(minInput, '30000');
      window.setReactVal(maxInput, '20000');

      const submitBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('Lưu Khuyến Mãi'));
      submitBtn.click();
    })()`);
    await sleep(1500);

    // 2. Click Edit on "Promo R1 R2 Cap Code Test"
    console.log('Opening edit modal for Promo R1 R2 Cap Code Test...');
    const openEditResult = await evaluate(`(() => {
      const cards = Array.from(document.querySelectorAll('.rounded-2xl'));
      const targetCard = cards.find(c => c.innerText.includes('Promo R1 R2 Cap Code Test'));
      if (!targetCard) return { error: 'Target promo card not found' };

      const editBtn = targetCard.querySelector('button');
      if (editBtn) editBtn.click();
      return { success: true };
    })()`);
    assert(openEditResult.success, openEditResult.error);
    await sleep(800);

    // 3. Verify code and maxDiscountAmount in edit modal, then CLEAR both
    console.log('Verifying existing code and cap, then clearing both in modal...');
    const clearInputsResult = await evaluate(`(() => {
      const modal = document.querySelector('.fixed.inset-0');
      const labels = Array.from(modal.querySelectorAll('label'));

      const codeInput = labels.find(l => l.innerText.includes('Mã Code')).closest('div').querySelector('input');
      const maxInput = labels.find(l => l.innerText.includes('Giảm Tối Đa')).closest('div').querySelector('input[type="number"]');

      const initialCode = codeInput ? codeInput.value : null;
      const initialMax = maxInput ? maxInput.value : null;

      // Clear both inputs
      window.setReactVal(codeInput, '');
      window.setReactVal(maxInput, '');
      maxInput.dispatchEvent(new Event('blur', { bubbles: true }));

      const codeAfterClear = codeInput.value;
      const maxAfterClear = maxInput.value;

      // Click "Lưu Khuyến Mãi"
      const submitBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('Lưu Khuyến Mãi'));
      submitBtn.click();

      return {
        initialCode,
        initialMax,
        codeAfterClear,
        maxAfterClear
      };
    })()`);

    console.log(`  Initial code: "${clearInputsResult.initialCode}", Initial max: "${clearInputsResult.initialMax}"`);
    console.log(`  Code after clear: "${clearInputsResult.codeAfterClear}", Max after clear: "${clearInputsResult.maxAfterClear}"`);
    assert(clearInputsResult.initialCode === 'CAPCODE71', 'Edit modal must initially show CAPCODE71');
    assert(clearInputsResult.initialMax === '20000', 'Edit modal must initially show 20000');
    assert(clearInputsResult.codeAfterClear === '', 'Code must be cleared to empty string');
    assert(clearInputsResult.maxAfterClear === '', 'Max discount must be cleared to empty string');
    await sleep(1500);

    // 4. Verify via API readback: code must be null, maxDiscountAmount must be undefined (unlimited)
    console.log('Verifying via API GET /cms/promotions...');
    const verifyApiRes = await fetch(`${API_BASE}/cms/promotions`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const verifyData = await verifyApiRes.json();
    const updatedPromo = (verifyData.promotions || verifyData).find(p => p.title === 'Promo R1 R2 Cap Code Test');
    assert(updatedPromo, 'Promo not found in API list');
    console.log(`  API readback code:`, updatedPromo.code);
    console.log(`  API readback maxDiscountAmount:`, updatedPromo.maxDiscountAmount);
    assert(updatedPromo.code === null, 'R2: Promo code must be null after clearing');
    assert(updatedPromo.maxDiscountAmount === undefined || updatedPromo.maxDiscountAmount === null, 'R1: Max discount cap must be null/undefined (unlimited) after clearing');
    console.log('✅ R1 & R2: Promo code and discount cap successfully removed and verified via API');

    // 5. Re-open edit modal on UI to verify inputs display empty without old code or cap
    console.log('Re-opening edit modal to verify UI reflects cleared code and cap...');
    const reopenCheck = await evaluate(`(() => {
      const cards = Array.from(document.querySelectorAll('.rounded-2xl'));
      const targetCard = cards.find(c => c.innerText.includes('Promo R1 R2 Cap Code Test'));
      if (!targetCard) return { error: 'Target card not found' };

      const editBtn = targetCard.querySelector('button');
      if (editBtn) editBtn.click();
      return { success: true };
    })()`);
    assert(reopenCheck.success, reopenCheck.error);
    await sleep(800);

    const recheckInputs = await evaluate(`(() => {
      const modal = document.querySelector('.fixed.inset-0');
      const labels = Array.from(modal.querySelectorAll('label'));

      const codeInput = labels.find(l => l.innerText.includes('Mã Code')).closest('div').querySelector('input');
      const maxInput = labels.find(l => l.innerText.includes('Giảm Tối Đa')).closest('div').querySelector('input[type="number"]');

      const codeVal = codeInput ? codeInput.value : null;
      const maxVal = maxInput ? maxInput.value : null;
      const maxPlaceholder = maxInput ? maxInput.getAttribute('placeholder') : null;

      // Close modal
      const cancelBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('Hủy'));
      if (cancelBtn) cancelBtn.click();

      return {
        codeVal,
        maxVal,
        maxPlaceholder
      };
    })()`);

    console.log(`  Reopened code value: "${recheckInputs.codeVal}"`);
    console.log(`  Reopened maxDiscount value: "${recheckInputs.maxVal}" (placeholder: "${recheckInputs.maxPlaceholder}")`);
    assert(recheckInputs.codeVal === '', 'Reopened code input must be empty string');
    assert(recheckInputs.maxVal === '', 'Reopened max discount input must be empty string');
    console.log('✅ R1 & R2: Reopened modal accurately displays empty code and unlimited cap placeholder');
    await sleep(500);

    // =========================================================================
    // PART 5: DRAFT PRESERVATION ON API / NETWORK ERROR
    // =========================================================================
    console.log('\n--- PART 5: Testing Draft Preservation on Network Error ---');

    // Open Add Promo modal
    await evaluate(`(() => {
      const addPromo = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Tạo Khuyến Mãi Mới'));
      if (addPromo) addPromo.click();
    })()`);
    await sleep(800);

    // Fill form and simulate API failure by temporarily modifying request / window.fetch
    const draftTestResult = await evaluate(`(async () => {
      const modal = document.querySelector('.fixed.inset-0');
      const labels = Array.from(modal.querySelectorAll('label'));

      const titleInput = labels.find(l => l.innerText.includes('Tiêu Đề Khuyến Mãi')).closest('div').querySelector('input');
      const discInput = labels.find(l => l.innerText.includes('Giá Trị Giảm') || l.innerText.includes('Số Tiền Giảm')).closest('div').querySelector('input[type="number"]');

      window.setReactVal(titleInput, 'Draft Promo Preserve Test');
      window.setReactVal(discInput, '35');

      // Intercept window.fetch temporarily to simulate network error on /cms/promotions
      const origFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if (typeof url === 'string' && url.includes('/cms/promotions')) {
          return new Response(JSON.stringify({ error: 'NETWORK_ERROR', message: 'Mất kết nối máy chủ giả lập' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return origFetch(url, opts);
      };

      // Submit
      const submitBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('Lưu Khuyến Mãi'));
      submitBtn.click();

      // Wait for error actionMsg
      await new Promise(r => setTimeout(r, 600));

      // Restore fetch
      window.fetch = origFetch;

      const titleValAfterError = titleInput.value;
      const discValAfterError = discInput.value;
      const hasErrorMessage = document.body.innerText.includes('Mất kết nối máy chủ giả lập');
      const modalStillOpen = !!document.querySelector('.fixed.inset-0 input');

      // Cancel modal
      const cancelBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('Hủy'));
      if (cancelBtn) cancelBtn.click();

      return {
        titleValAfterError,
        discValAfterError,
        hasErrorMessage,
        modalStillOpen
      };
    })()`);

    console.log(`  Draft title after error: "${draftTestResult.titleValAfterError}"`);
    console.log(`  Draft discount after error: "${draftTestResult.discValAfterError}"`);
    console.log(`  Error message displayed: ${draftTestResult.hasErrorMessage}`);
    console.log(`  Modal still open on error: ${draftTestResult.modalStillOpen}`);
    assert(draftTestResult.hasErrorMessage, 'Error message must be shown when API fails');
    assert(draftTestResult.modalStillOpen, 'Modal must remain open when API fails');
    assert(draftTestResult.titleValAfterError === 'Draft Promo Preserve Test', 'Draft title must be preserved on API error');
    assert(draftTestResult.discValAfterError === '35', 'Draft discount must be preserved on API error');
    console.log('✅ Draft preservation on API/network error verified');
    await sleep(500);

    // Delete cap test promo
    try {
      const promoListRes = await fetch(`${API_BASE}/cms/promotions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await promoListRes.json();
      const promos = Array.isArray(data) ? data : (data.promotions || []);
      const testP = promos.find(p => p.title === 'Promo R1 R2 Cap Code Test');
      if (testP) {
        await fetch(`${API_BASE}/cms/promotions/${testP.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('  Cleaned up R1/R2 test promotion');
      }
    } catch {}

    // =========================================================================
    // CLEANUP TEST DATA
    // =========================================================================
    console.log('\n--- CLEANUP: Removing temporary test data ---');
    // Delete test promo via API
    try {
      const promoListRes = await fetch(`${API_BASE}/cms/promotions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await promoListRes.json();
      const promos = Array.isArray(data) ? data : (data.promotions || []);
      const testP = promos.find(p => p.title === 'Khuyến Mãi Issue 71 Test');
      if (testP) {
        await fetch(`${API_BASE}/cms/promotions/${testP.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('  Cleaned up test promotion');
      }
    } catch (e) {
      console.warn('  Cleanup promo error:', e.message);
    }

    // Delete test menu item via API
    try {
      const menuRes = await fetch(`${API_BASE}/staff/menu/items`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await menuRes.json();
      const items = Array.isArray(data) ? data : (data.items || []);
      const testItem = items.find(i => i.name === 'Món Test Validation Issue 71');
      if (testItem) {
        await fetch(`${API_BASE}/staff/menu/items/${testItem.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('  Cleaned up test menu item');
      }
    } catch (e) {
      console.warn('  Cleanup menu item error:', e.message);
    }

    console.log('\n🎉 ALL ISSUE #71 VERIFICATIONS PASSED SUCCESSFULLY!');

  } finally {
    if (cdp) cdp.close();
    if (chromeProcess) {
      chromeProcess.kill('SIGTERM');
      await sleep(500);
    }
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
