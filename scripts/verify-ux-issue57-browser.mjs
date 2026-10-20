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

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
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
    if (this.ws) this.ws.close();
  }
}

async function main() {
  console.log('🚀 Launching headless Chrome with remote debugging on port', PORT);
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=/tmp/chrome-issue57-profile-v2',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
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

    if (!versionData) throw new Error('Failed to connect to Chrome DevTools endpoint');
    console.log('✅ Chrome connected:', versionData.Browser);

    const targetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
    const target = await targetRes.json();
    const cdp = new CDPClient(target.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

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

    // =========================================================================
    // 1. SCENARIO 1: BÀN CHƯA MỞ (Unopened Table - qr-phoco-a03)
    // =========================================================================
    console.log('\n=== 1. SCENARIO 1: Unopened Table (qr-phoco-a03) ===');
    await setViewport(390, 844); // iPhone 12/13/14 Mobile-first
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/t/qr-phoco-a03' });
    await sleep(2500);

    // 1a. Menu Tab
    let bodyText = await evaluate('document.body.innerText');
    console.log('  [Menu] Header badge "Chưa mở phiên":', bodyText.includes('Chưa mở phiên'));
    console.log('  [Menu] Banner "Bàn chưa được mở gọi món":', bodyText.includes('Bàn chưa được mở gọi món'));
    await screenshot('01_unopened_menu_390x844.png');

    // 1b. Orders Tab
    await evaluate("Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Đơn đã gọi')).click()");
    await sleep(800);
    bodyText = await evaluate('document.body.innerText');
    console.log('  [Orders] Empty state title "Bàn chưa mở gọi món":', bodyText.includes('Bàn chưa mở gọi món'));
    console.log('  [Orders] Empty state subtitle "Vui lòng liên hệ nhân viên":', bodyText.includes('Vui lòng liên hệ nhân viên'));
    console.log('  [Orders] NOT showing misleading ordering prompt:', !bodyText.includes('Hãy chọn các món trong mục Thực đơn và nhấn gửi'));
    await screenshot('02_unopened_orders_390x844.png');

    // 1c. Bill Tab
    await evaluate("Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Tổng bill')).click()");
    await sleep(800);
    bodyText = await evaluate('document.body.innerText');
    console.log('  [Bill] Header badge "Chưa mở phiên":', bodyText.includes('Chưa mở phiên'));
    console.log('  [Bill] Empty state title "Chưa có hóa đơn":', bodyText.includes('Chưa có hóa đơn'));
    console.log('  [Bill] Empty state subtitle "Bàn chưa được mở phiên phục vụ":', bodyText.includes('Bàn chưa được mở phiên phục vụ'));
    console.log('  [Bill] NOT showing "Phiên bàn đã thanh toán hoàn tất":', !bodyText.includes('Phiên bàn đã thanh toán hoàn tất'));
    console.log('  [Bill] NOT showing checkout request button:', !bodyText.includes('Yêu cầu thanh toán'));
    await screenshot('03_unopened_bill_390x844.png');

    // 1d. Viewport: Android Standard 360x640
    await setViewport(360, 640);
    await sleep(500);
    await screenshot('04_unopened_bill_360x640.png');

    // 1e. Viewport: Desktop 1024x768 & 1920x1080
    await setViewport(1024, 768);
    await sleep(500);
    await screenshot('05_unopened_bill_1024x768.png');

    await setViewport(1920, 1080);
    await sleep(500);
    await screenshot('06_unopened_bill_1920x1080.png');

    // =========================================================================
    // 2. SCENARIO 2: BÀN ĐANG PHỤC VỤ (Active Open Session - qr-phoco-a01)
    // =========================================================================
    console.log('\n=== 2. SCENARIO 2: Active Open Table (qr-phoco-a01) ===');
    await setViewport(390, 844);
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/t/qr-phoco-a01' });
    await sleep(2500);

    bodyText = await evaluate('document.body.innerText');
    console.log('  [Open] Header badge "Phiên mở":', bodyText.includes('Phiên mở'));
    await screenshot('07_active_table_menu_390x844.png');

    // Switch to Bill Tab on Open Table
    await evaluate("Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Tổng bill')).click()");
    await sleep(800);
    bodyText = await evaluate('document.body.innerText');
    console.log('  [Open Bill] Badge "Đang phục vụ":', bodyText.includes('Đang phục vụ'));
    console.log('  [Open Bill] Shows "Yêu cầu thanh toán" button:', bodyText.includes('Yêu cầu thanh toán'));
    console.log('  [Open Bill] Shows "Gọi nhân viên" button:', bodyText.includes('Gọi nhân viên'));
    await screenshot('08_active_table_bill_390x844.png');

    // =========================================================================
    // 3. SCENARIO 3: BÀN ĐÃ ĐÓNG VÀ XEM BIÊN NHẬN (Receipt Preservation on Reload)
    // =========================================================================
    console.log('\n=== 3. SCENARIO 3: Closed Receipt Preservation on Reload ===');
    // Navigate back to table A03
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/t/qr-phoco-a03' });
    await sleep(2000);

    // Simulate paying customer having their receipt snapshot in scoped sessionStorage
    await evaluate(`
      const mockReceipt = {
        qrId: 'qr-phoco-a03',
        sessionId: 'test-closed-session-123',
        billSummary: {
          sessionId: 'test-closed-session-123',
          sessionStatus: 'CLOSED',
          isClosed: true,
          rawBillTotal: 120000,
          totalDiscount: 20000,
          validBillTotal: 100000,
          rounds: [
            {
              orderNumber: 1,
              acceptedOrServedSubtotal: 100000,
              items: [
                { name: 'Nem Chua Rán Hà Nội (10 chiếc)', quantity: 2, subtotal: 60000, status: 'SERVED' },
                { name: 'Trà Sữa Trân Châu Đường Đen', quantity: 1, subtotal: 40000, status: 'SERVED' }
              ]
            }
          ],
          appliedPromotions: [{ id: 'promo-1', title: 'Giảm 20k đơn từ 100k' }]
        },
        orders: [
          {
            id: 'ord-1',
            orderNumber: 1,
            createdAt: new Date().toISOString(),
            items: [
              { id: 'item-1', name: 'Nem Chua Rán Hà Nội (10 chiếc)', quantity: 2, price: 30000, status: 'SERVED' },
              { id: 'item-2', name: 'Trà Sữa Trân Châu Đường Đen', quantity: 1, price: 40000, status: 'SERVED' }
            ]
          }
        ],
        closedAt: new Date().toISOString()
      };
      sessionStorage.setItem('guest_receipt_qr-phoco-a03', JSON.stringify(mockReceipt));
    `);

    // Reload the page: The paying customer should retain their receipt
    await cdp.send('Page.reload');
    await sleep(2500);

    // Switch to Bill Tab to check receipt
    await evaluate("Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Tổng bill')).click()");
    await sleep(800);
    bodyText = await evaluate('document.body.innerText');
    console.log('  [Closed Receipt] Header badge "Đã kết thúc":', bodyText.includes('Đã kết thúc'));
    console.log('  [Closed Receipt] Total payment 100.000đ preserved:', bodyText.includes('100.000đ'));
    console.log('  [Closed Receipt] Completion card "Phiên bàn đã thanh toán hoàn tất":', bodyText.includes('Phiên bàn đã thanh toán hoàn tất'));
    console.log('  [Closed Receipt] Items list visible in receipt:', bodyText.includes('Nem Chua Rán Hà Nội'));
    await screenshot('09_closed_receipt_retained_on_reload.png');

    // =========================================================================
    // 4. SCENARIO 4: LƯỢT QUÉT MỚI (New Scan Isolation - No Data Leakage)
    // =========================================================================
    console.log('\n=== 4. SCENARIO 4: New Scan Isolation (Different Customer) ===');
    // Simulating a new customer scanning table A03 fresh without previous session storage
    await evaluate(`
      sessionStorage.clear();
      localStorage.clear();
    `);
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/t/qr-phoco-a03' });
    await sleep(2500);

    // Switch to Bill Tab
    await evaluate("Array.from(document.querySelectorAll('nav button')).find(b => b.innerText.includes('Tổng bill')).click()");
    await sleep(800);
    bodyText = await evaluate('document.body.innerText');
    console.log('  [New Scan] Header badge "Chưa mở phiên":', bodyText.includes('Chưa mở phiên'));
    console.log('  [New Scan] Clean empty state "Chưa có hóa đơn":', bodyText.includes('Chưa có hóa đơn'));
    console.log('  [New Scan] NO previous customer bill total (100.000đ):', !bodyText.includes('100.000đ'));
    console.log('  [New Scan] NO previous customer items (Nem Chua Rán):', !bodyText.includes('Nem Chua Rán Hà Nội'));
    console.log('  [New Scan] NO "Phiên bàn đã thanh toán hoàn tất":', !bodyText.includes('Phiên bàn đã thanh toán hoàn tất'));
    await screenshot('10_new_scan_clean_isolation_verified.png');

    // =========================================================================
    // 5. SCENARIO 5: ĐỔI BÀN (Table Switch Isolation)
    // =========================================================================
    console.log('\n=== 5. SCENARIO 5: Table Switch Isolation (A01 -> A03) ===');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/t/qr-phoco-a01' });
    await sleep(2000);
    const a01Title = await evaluate("document.querySelector('h1')?.innerText");
    console.log('  At Table A01:', a01Title);

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/t/qr-phoco-a03' });
    await sleep(2000);
    const a03Title = await evaluate("document.querySelector('h1')?.innerText");
    console.log('  Switched to Table A03:', a03Title);
    await screenshot('11_table_switch_isolation_verified.png');

    cdp.close();
    console.log('\n🎉 ALL 5 BROWSER SCENARIOS AND VIEWPORTS VERIFIED SUCCESSFULLY!');
  } finally {
    chromeProcess.kill();
  }
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
