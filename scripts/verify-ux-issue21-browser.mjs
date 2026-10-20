import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import webpush from '../backend/node_modules/web-push/src/index.js';

const keyPair1 = webpush.generateVAPIDKeys();
const keyPair2 = webpush.generateVAPIDKeys();

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_DIR = path.resolve('artifacts/screenshots/issue-21');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => a.value || a.description).join(' ');
        console.log('[Browser Console]', text);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('[Browser Exception]', msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
      }
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

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`Evaluation failed: ${desc}`);
    }
    return res.result?.value;
  }

  async captureScreenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }
}

async function main() {
  console.log('🚀 Running Issue #21 Browser Regression Harness (Real PushProvider & Recovery Lifecycles)...');

  // Step 1: Bundle test harness React bundle using esbuild
  console.log('📦 Bundling scripts/harness-issue21.tsx...');
  const bundlePath = path.resolve('scripts/harness-issue21.bundle.js');
  execSync(
    'NODE_PATH=frontend/node_modules ./frontend/node_modules/.bin/esbuild --bundle scripts/harness-issue21.tsx --outfile=scripts/harness-issue21.bundle.js --format=esm --jsx=automatic --loader:.ts=ts --loader:.tsx=tsx',
    { stdio: 'pipe' }
  );
  assert(fs.existsSync(bundlePath), 'Bundle file was not generated');

  // Step 2: Start local HTTP server to serve harness HTML & JS
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Push Harness</title>
</head>
<body>
  <div id="root"></div>
  <script>
    // Controlled browser environment setup before React bundle loads
    window.__mockState = {
      notificationPermission: 'granted',
      publicKeyResponse: { available: true, enabled: true, publicKey: '${keyPair1.publicKey}' },
      publicKeyStatus: 200,
      publicKeyDelayMs: 0,
      subscribeStatus: 200,
      testPushStatus: 200,
      testPushDelayMs: 0,
      testPushResponse: { success: true, acceptedByProvider: true },
      endpointsGeneratedCount: 0,
      unsubscribedEndpoints: [],
      syncedSubscriptions: [],
      activeSubscription: null,
      unsubscribeBehavior: 'succeed',
      subscribeReturnsExpiredEndpoint: null
    };

    window.Notification = {
      get permission() {
        return window.__mockState.notificationPermission;
      },
      requestPermission: async () => {
        return window.__mockState.notificationPermission;
      }
    };

    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray.buffer;
    }

    function createMockSubscription(endpoint, pubKey) {
      return {
        endpoint: endpoint,
        options: {
          applicationServerKey: pubKey ? urlBase64ToUint8Array(pubKey) : null
        },
        toJSON: () => ({
          endpoint: endpoint,
          keys: {
            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0AgtGoKE',
            auth: 'tBHItJI5svbpez7KI4CCXg'
          }
        }),
        unsubscribe: async () => {
          if (window.__mockState.unsubscribeBehavior === 'reject') {
            throw new Error('Browser failed to unsubscribe');
          }
          if (window.__mockState.unsubscribeBehavior === 'return_false') {
            return false;
          }
          window.__mockState.unsubscribedEndpoints.push(endpoint);
          if (window.__mockState.activeSubscription?.endpoint === endpoint) {
            window.__mockState.activeSubscription = null;
          }
          return true;
        }
      };
    }

    const mockPushManager = {
      getSubscription: async () => {
        return window.__mockState.activeSubscription;
      },
      subscribe: async (opts) => {
        if (window.__mockState.subscribeReturnsExpiredEndpoint) {
          const sub = createMockSubscription(window.__mockState.subscribeReturnsExpiredEndpoint, window.__mockState.publicKeyResponse.publicKey);
          window.__mockState.activeSubscription = sub;
          return sub;
        }
        window.__mockState.endpointsGeneratedCount++;
        const newEndpoint = 'https://fcm.googleapis.com/fcm/send/device-endpoint-' + window.__mockState.endpointsGeneratedCount;
        const sub = createMockSubscription(newEndpoint, window.__mockState.publicKeyResponse.publicKey);
        window.__mockState.activeSubscription = sub;
        return sub;
      }
    };

    const mockRegistration = {
      pushManager: mockPushManager,
      active: true
    };

    try {
      Object.defineProperty(navigator.serviceWorker, 'ready', {
        get: () => Promise.resolve(mockRegistration),
        configurable: true
      });
    } catch {}

    navigator.serviceWorker.register = async () => mockRegistration;
    navigator.serviceWorker.getRegistration = async () => mockRegistration;

    const originalFetch = window.fetch;
    window.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('/staff/push/public-key')) {
        if (window.__mockState.publicKeyDelayMs > 0) {
          await new Promise(r => setTimeout(r, window.__mockState.publicKeyDelayMs));
        }
        if (window.__mockState.publicKeyStatus === 'network_error') {
          throw new TypeError('Failed to fetch (offline)');
        }
        return new Response(JSON.stringify(window.__mockState.publicKeyResponse), {
          status: window.__mockState.publicKeyStatus,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (urlStr.includes('/staff/push/subscribe')) {
        const body = options.body ? JSON.parse(options.body) : {};
        window.__mockState.syncedSubscriptions.push(body);
        if (window.__mockState.subscribeStatus !== 200) {
          return new Response(JSON.stringify({ error: 'SERVER_ERROR', message: 'Lỗi máy chủ' }), {
            status: window.__mockState.subscribeStatus,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (urlStr.includes('/staff/push/unsubscribe')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (urlStr.includes('/staff/push/test')) {
        if (window.__mockState.testPushDelayMs > 0) {
          await new Promise(r => setTimeout(r, window.__mockState.testPushDelayMs));
        }
        if (window.__mockState.testPushStatus !== 200) {
          return new Response(JSON.stringify({
            error: window.__mockState.testPushStatus === 410 ? 'SUBSCRIPTION_EXPIRED' : 'DEVICE_NOT_REGISTERED',
            message: 'Push test error'
          }), {
            status: window.__mockState.testPushStatus,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(window.__mockState.testPushResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return originalFetch(url, options);
    };
  </script>
  <script type="module" src="/bundle.js"></script>
</body>
</html>`;

  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlContent);
    } else if (req.url === '/sw.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end('// ServiceWorker\n');
    } else if (req.url === '/bundle.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      fs.createReadStream(bundlePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  // Step 3: Launch Chrome in headless mode
  const chromePort = 9227;
  const profileDir = `/tmp/chrome-issue21-${Date.now()}`;
  fs.mkdirSync(profileDir, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--disable-gpu',
    'about:blank'
  ]);

  let cdp = null;

  try {
    // Wait for Chrome remote debugging endpoint
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      try {
        const resp = await fetch(`http://127.0.0.1:${chromePort}/json`);
        const targets = await resp.json();
        const pageTarget = targets && targets.find(t => t.type === 'page');
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch {}
      await sleep(100);
    }
    assert(wsUrl, 'Failed to connect to Chrome debugging endpoint');

    cdp = new CDPClient(wsUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: baseUrl });

    // Wait for harness root to mount
    let mounted = false;
    for (let i = 0; i < 40; i++) {
      const exists = await cdp.evaluate('Boolean(window.__push)');
      if (exists) {
        mounted = true;
        break;
      }
      await sleep(100);
    }
    assert(mounted, 'Harness React component failed to mount');

    // -------------------------------------------------------------
    // Test 1: Happy path subscribe
    // -------------------------------------------------------------
    console.log('▶ Test 1: Normal subscribe flow...');
    await cdp.evaluate('window.__push.subscribe()');
    let state = await cdp.evaluate('window.__push.state');
    let isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    assert(state === 'granted', `Expected state granted, got: ${state}`);
    assert(isSubscribed === true, `Expected isSubscribed true, got: ${isSubscribed}`);
    let endpointsCount = await cdp.evaluate('window.__mockState.endpointsGeneratedCount');
    assert(endpointsCount === 1, `Expected 1 endpoint generated, got: ${endpointsCount}`);
    await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, '01_subscribed_active.png'));
    console.log('  ✓ Test 1 passed: State is granted and subscribed.');

    // -------------------------------------------------------------
    // Test 2 (R1): 410 SUBSCRIPTION_EXPIRED recovery & no recovery loop
    // -------------------------------------------------------------
    console.log('▶ Test 2 (R1): 410 SUBSCRIPTION_EXPIRED recovery...');
    await cdp.evaluate('window.__mockState.testPushStatus = 410');

    let sendErrorThrown = false;
    try {
      await cdp.evaluate('window.__push.sendTestPush()');
    } catch {
      sendErrorThrown = true;
    }
    assert(sendErrorThrown, 'Expected sendTestPush to throw on 410');

    state = await cdp.evaluate('window.__push.state');
    isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    assert(state === 'sync_error', `Expected state sync_error, got: ${state}`);
    assert(isSubscribed === false, `Expected isSubscribed false, got: ${isSubscribed}`);

    // Verify browser subscription was unsubscribed
    let unsubscribedCount = await cdp.evaluate('window.__mockState.unsubscribedEndpoints.length');
    assert(unsubscribedCount >= 1, 'Expected expired endpoint to be unsubscribed from browser pushManager');

    await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, '02_subscription_expired_sync_error.png'));

    // Now re-subscribe: verify a NEW endpoint is created (recovery loop broken!)
    await cdp.evaluate('window.__mockState.testPushStatus = 200');
    await cdp.evaluate('window.__push.subscribe()');

    state = await cdp.evaluate('window.__push.state');
    isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    assert(state === 'granted', `Expected state granted after reconnect, got: ${state}`);
    assert(isSubscribed === true, `Expected isSubscribed true after reconnect, got: ${isSubscribed}`);

    endpointsCount = await cdp.evaluate('window.__mockState.endpointsGeneratedCount');
    assert(endpointsCount === 2, `Expected fresh endpoint generated (count=2), got: ${endpointsCount}`);

    const lastSynced = await cdp.evaluate('window.__mockState.syncedSubscriptions.slice(-1)[0]');
    assert(lastSynced.endpoint.includes('device-endpoint-2'), `Expected new endpoint synced, got: ${lastSynced.endpoint}`);
    await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, '03_reconnected_new_endpoint.png'));
    console.log('  ✓ Test 2 passed: 410 subscription expired cleanly unregisters and reconnects with new endpoint.');

    // -------------------------------------------------------------
    // Test 3 (R1): 404 DEVICE_NOT_REGISTERED distinction
    // -------------------------------------------------------------
    console.log('▶ Test 3 (R1): 404 DEVICE_NOT_REGISTERED distinction...');
    await cdp.evaluate('window.__mockState.testPushStatus = 404');
    let unsubsBefore404 = await cdp.evaluate('window.__mockState.unsubscribedEndpoints.length');

    let error404Thrown = false;
    try {
      await cdp.evaluate('window.__push.sendTestPush()');
    } catch {
      error404Thrown = true;
    }
    assert(error404Thrown, 'Expected sendTestPush to throw on 404');

    state = await cdp.evaluate('window.__push.state');
    isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    assert(state === 'sync_error', `Expected state sync_error, got: ${state}`);
    assert(isSubscribed === false, `Expected isSubscribed false, got: ${isSubscribed}`);

    // Endpoint should NOT be destroyed in browser when DB simply lost the mapping
    let unsubsAfter404 = await cdp.evaluate('window.__mockState.unsubscribedEndpoints.length');
    assert(unsubsAfter404 === unsubsBefore404, 'Browser endpoint should not be unsubscribed for 404 DEVICE_NOT_REGISTERED');
    console.log('  ✓ Test 3 passed: 404 DEVICE_NOT_REGISTERED distinguishes DB desync from expired endpoint.');

    // -------------------------------------------------------------
    // Test 4 (R2): Permission Denied closure safety
    // -------------------------------------------------------------
    console.log('▶ Test 4 (R2): Permission Denied closure safety...');
    await cdp.evaluate('window.__mockState.notificationPermission = "denied"');

    let deniedThrown = false;
    try {
      await cdp.evaluate('window.__push.subscribe()');
    } catch {
      deniedThrown = true;
    }
    assert(deniedThrown, 'Expected subscribe to throw when permission denied');

    state = await cdp.evaluate('window.__push.state');
    assert(state === 'denied', `Expected state denied (not overwritten by sync_error), got: ${state}`);
    console.log('  ✓ Test 4 passed: Denied state preserved without sync_error overwrite.');

    // -------------------------------------------------------------
    // Test 5 (R2): Server Disabled closure safety
    // -------------------------------------------------------------
    console.log('▶ Test 5 (R2): Server Disabled closure safety...');
    await cdp.evaluate('window.__mockState.notificationPermission = "granted"');
    await cdp.evaluate('window.__mockState.publicKeyResponse = { available: false, enabled: false, reason: "NOT_CONFIGURED" }');

    let disabledThrown = false;
    try {
      await cdp.evaluate('window.__push.subscribe()');
    } catch {
      disabledThrown = true;
    }
    assert(disabledThrown, 'Expected subscribe to throw when server disabled');

    state = await cdp.evaluate('window.__push.state');
    assert(state === 'server_disabled', `Expected state server_disabled, got: ${state}`);
    await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, '05_server_disabled_banner.png'));
    console.log('  ✓ Test 5 passed: Server disabled state preserved without sync_error overwrite.');

    // -------------------------------------------------------------
    // Test 6 (R3): Network / 5xx error distinction from server_disabled
    // -------------------------------------------------------------
    console.log('▶ Test 6 (R3): Network error vs server_disabled distinction...');
    await cdp.evaluate('window.__mockState.publicKeyStatus = "network_error"');
    await cdp.evaluate('window.__push.refreshStatus()');

    state = await cdp.evaluate('window.__push.state');
    let errMessage = await cdp.evaluate('window.__push.errorMessage');
    assert(state === 'sync_error', `Expected state sync_error on network error, got: ${state}`);
    assert(state !== 'server_disabled', 'Network error must NOT be classified as server_disabled');
    assert(errMessage && errMessage.includes('mạng'), `Expected network error message, got: ${errMessage}`);

    // When network recovers
    await cdp.evaluate('window.__mockState.publicKeyStatus = 200');
    await cdp.evaluate(`window.__mockState.publicKeyResponse = { available: true, enabled: true, publicKey: "${keyPair1.publicKey}" }`);
    await cdp.evaluate('window.__push.refreshStatus()');

    errMessage = await cdp.evaluate('window.__push.errorMessage');
    assert(errMessage === null, `Expected error message to be cleared after recovery, got: ${errMessage}`);
    console.log('  ✓ Test 6 passed: Network error sets sync_error and clears on recovery.');

    // -------------------------------------------------------------
    // Test 7: VAPID Key Rotation detection & re-subscribe
    // -------------------------------------------------------------
    console.log('▶ Test 7: VAPID Key Rotation...');
    // Rotate server key to K2
    await cdp.evaluate(`window.__mockState.publicKeyResponse.publicKey = "${keyPair2.publicKey}"`);
    await cdp.evaluate('window.__push.refreshStatus()');

    state = await cdp.evaluate('window.__push.state');
    isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    assert(state === 'key_mismatch', `Expected state key_mismatch, got: ${state}`);
    assert(isSubscribed === false, `Expected isSubscribed false on key rotation, got: ${isSubscribed}`);
    await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, '04_key_mismatch_detected.png'));

    // Re-subscribe under rotated key
    await cdp.evaluate('window.__push.subscribe()');
    state = await cdp.evaluate('window.__push.state');
    isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    assert(state === 'granted', `Expected state granted after key rotation re-subscribe, got: ${state}`);
    assert(isSubscribed === true, `Expected isSubscribed true, got: ${isSubscribed}`);
    console.log('  ✓ Test 7 passed: Key rotation detected and re-subscribed cleanly.');

    // -------------------------------------------------------------
    // Test 8: Safe Subscription Reuse (no recreation when keys match)
    // -------------------------------------------------------------
    console.log('▶ Test 8: Safe Subscription Reuse...');
    const countBeforeReuse = await cdp.evaluate('window.__mockState.endpointsGeneratedCount');
    await cdp.evaluate('window.__push.subscribe()');
    const countAfterReuse = await cdp.evaluate('window.__mockState.endpointsGeneratedCount');
    assert(countBeforeReuse === countAfterReuse, 'Expected existing subscription to be reused when keys match');
    console.log('  ✓ Test 8 passed: Subscription reused without redundant creation.');

    // -------------------------------------------------------------
    // Test 9: Concurrency & Tenant Switch / Logout during in-flight
    // -------------------------------------------------------------
    console.log('▶ Test 9: Concurrency & Tenant Switch during in-flight request...');
    await cdp.evaluate('window.__mockState.publicKeyDelayMs = 150');
    // Start refreshStatus in-flight
    cdp.evaluate('window.__push.refreshStatus()');
    // Immediately switch tenant / logout
    await sleep(20);
    await cdp.evaluate('window.__setAuthUser(null); window.__setAuthTenant(null)');
    // Wait for in-flight fetch to complete
    await sleep(200);

    isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    assert(isSubscribed === false, 'Stale in-flight request should NOT set isSubscribed true for logged out user');
    await cdp.evaluate('window.__mockState.publicKeyDelayMs = 0');
    console.log('  ✓ Test 9 passed: In-flight response discarded on tenant switch / logout.');

    // -------------------------------------------------------------
    // Test 10: Backend sync gate (Never report granted before backend sync)
    // -------------------------------------------------------------
    console.log('▶ Test 10: Strict backend sync gate...');
    await cdp.evaluate('window.__setAuthUser({ id: "user-1", email: "admin@phoco.vn" }); window.__setAuthTenant({ id: "tenant-1" })');
    await cdp.evaluate('window.__mockState.subscribeStatus = 500');

    let syncFailThrown = false;
    try {
      await cdp.evaluate('window.__push.subscribe()');
    } catch {
      syncFailThrown = true;
    }
    assert(syncFailThrown, 'Expected subscribe to throw when backend sync fails');

    state = await cdp.evaluate('window.__push.state');
    isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    assert(isSubscribed === false, 'isSubscribed must be false when backend sync fails');
    assert(state === 'sync_error', `Expected state sync_error, got: ${state}`);
    console.log('  ✓ Test 10 passed: Never reports granted before backend sync.');

    // -------------------------------------------------------------
    // Test 11 (R4): Late /test 410 response does NOT unsubscribe new tenant subscription
    // -------------------------------------------------------------
    console.log('▶ Test 11 (R4): Late 410 test push across tenant switch...');
    await cdp.evaluate('window.__mockState.subscribeStatus = 200');
    await cdp.evaluate('window.__push.subscribe()');
    state = await cdp.evaluate('window.__push.state');
    assert(state === 'granted', `Expected granted on tenant-1, got: ${state}`);
    const tenant1Sub = await cdp.evaluate('window.__mockState.activeSubscription?.endpoint');
    assert(tenant1Sub, 'Expected active subscription on tenant-1');

    // Trigger test push on tenant-1 with delay and 410 response
    await cdp.evaluate('window.__mockState.testPushStatus = 410');
    await cdp.evaluate('window.__mockState.testPushDelayMs = 200');
    cdp.evaluate('window.__push.sendTestPush().catch(() => {})');

    // Switch tenant while request is in-flight
    await sleep(30);
    await cdp.evaluate('window.__setAuthUser({ id: "user-2", email: "manager@phoco2.vn" }); window.__setAuthTenant({ id: "tenant-2", name: "Phố Cổ 2" })');

    // On tenant-2, attach new device subscription (independent browser device / profile)
    await cdp.evaluate(`
      window.__mockState.activeSubscription = createMockSubscription(
        'https://fcm.googleapis.com/fcm/send/tenant2-device-endpoint',
        window.__mockState.publicKeyResponse.publicKey
      );
    `);
    await cdp.evaluate('window.__push.refreshStatus()');
    const tenant2Sub = await cdp.evaluate('window.__mockState.activeSubscription?.endpoint');
    assert(tenant2Sub && tenant2Sub !== tenant1Sub, 'Expected fresh active subscription on tenant-2');

    // Wait for the delayed 410 response from tenant-1 to arrive
    await sleep(250);

    // Verify tenant-2 subscription was NOT unsubscribed
    const unsubsAfterLate410 = await cdp.evaluate('window.__mockState.unsubscribedEndpoints');
    assert(!unsubsAfterLate410.includes(tenant2Sub), 'Stale 410 must NOT unsubscribe tenant-2 subscription');

    state = await cdp.evaluate('window.__push.state');
    isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    assert(state === 'granted', `Expected tenant-2 state to remain granted, got: ${state}`);
    assert(isSubscribed === true, `Expected tenant-2 isSubscribed to remain true, got: ${isSubscribed}`);
    await cdp.evaluate('window.__mockState.testPushDelayMs = 0');
    await cdp.evaluate('window.__mockState.testPushStatus = 200');
    console.log('  ✓ Test 11 passed: Stale 410 response across tenant switch does not touch new tenant subscription.');

    // -------------------------------------------------------------
    // Test 12 (R4): Late /test 410 response does NOT unsubscribe reconnected endpoint
    // -------------------------------------------------------------
    console.log('▶ Test 12 (R4): Late 410 test push across reconnect...');
    const currentEndpointBeforeTest = await cdp.evaluate('window.__mockState.activeSubscription?.endpoint');
    await cdp.evaluate('window.__mockState.testPushStatus = 410');
    await cdp.evaluate('window.__mockState.testPushDelayMs = 200');
    cdp.evaluate('window.__push.sendTestPush().catch(() => {})');

    // While test is in-flight, reconnect creating new endpoint
    await sleep(30);
    await cdp.evaluate('window.__mockState.activeSubscription = null');
    await cdp.evaluate('window.__push.subscribe()');
    const reconnectedEndpoint = await cdp.evaluate('window.__mockState.activeSubscription?.endpoint');
    assert(reconnectedEndpoint && reconnectedEndpoint !== currentEndpointBeforeTest, 'Expected fresh reconnected endpoint');

    // Wait for stale test push to resolve with 410
    await sleep(250);

    const allUnsubscribed = await cdp.evaluate('window.__mockState.unsubscribedEndpoints');
    assert(!allUnsubscribed.includes(reconnectedEndpoint), 'Stale 410 must NOT unsubscribe reconnected endpoint');
    state = await cdp.evaluate('window.__push.state');
    isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    assert(state === 'granted', `Expected state granted after reconnect, got: ${state}`);
    assert(isSubscribed === true, `Expected isSubscribed true after reconnect, got: ${isSubscribed}`);
    await cdp.evaluate('window.__mockState.testPushDelayMs = 0');
    await cdp.evaluate('window.__mockState.testPushStatus = 200');
    console.log('  ✓ Test 12 passed: Stale 410 response does not destroy reconnected subscription.');

    // -------------------------------------------------------------
    // Test 13 (R5): Browser unsubscribe rejection / false does not report success
    // -------------------------------------------------------------
    console.log('▶ Test 13 (R5): Browser unsubscribe rejection handling...');
    // Setup browser to reject unsubscribe while 410 test push is processed
    await cdp.evaluate('window.__mockState.unsubscribeBehavior = "reject"');
    await cdp.evaluate('window.__mockState.testPushStatus = 410');
    let test410Failed = false;
    try {
      await cdp.evaluate('window.__push.sendTestPush()');
    } catch {
      test410Failed = true;
    }
    assert(test410Failed, 'Expected sendTestPush to fail on 410');
    await cdp.evaluate('window.__mockState.testPushStatus = 200');

    // Ensure the expired subscription is still attached to the browser
    const remainingExpiredSub = await cdp.evaluate('window.__mockState.activeSubscription?.endpoint');
    assert(remainingExpiredSub, 'Expected browser to still hold subscription because unsubscribe rejected');

    let unsubRejectCaught = false;
    try {
      await cdp.evaluate('window.__push.subscribe()');
    } catch {
      unsubRejectCaught = true;
    }
    assert(unsubRejectCaught, 'Expected subscribe to fail when browser fails to unsubscribe');

    state = await cdp.evaluate('window.__push.state');
    isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    let errorMsg = await cdp.evaluate('window.__push.errorMessage');
    assert(state === 'sync_error', `Expected sync_error on unsubscribe failure, got: ${state}`);
    assert(isSubscribed === false, 'isSubscribed must be false when unsubscribe fails');
    assert(errorMsg && errorMsg.includes('hủy'), `Expected actionable error message, got: ${errorMsg}`);
    await cdp.evaluate('window.__mockState.unsubscribeBehavior = "succeed"');
    console.log('  ✓ Test 13 passed: Unsubscribe rejection halts reconnect and preserves sync_error.');

    // -------------------------------------------------------------
    // Test 14 (R5): Browser returns confirmed-expired endpoint on subscribe
    // -------------------------------------------------------------
    console.log('▶ Test 14 (R5): Browser returns same expired endpoint on subscribe...');
    // Keep active endpoint in expired set, and configure mock to return that same endpoint
    const expiredEp = await cdp.evaluate('window.__mockState.activeSubscription?.endpoint');
    await cdp.evaluate(`window.__mockState.subscribeReturnsExpiredEndpoint = "${expiredEp}"`);
    const syncCountBefore = await cdp.evaluate('window.__mockState.syncedSubscriptions.length');

    let expiredReturnedCaught = false;
    try {
      await cdp.evaluate('window.__push.subscribe()');
    } catch {
      expiredReturnedCaught = true;
    }
    assert(expiredReturnedCaught, 'Expected subscribe to fail when browser returns expired endpoint');

    state = await cdp.evaluate('window.__push.state');
    isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    errorMsg = await cdp.evaluate('window.__push.errorMessage');
    assert(state === 'sync_error', `Expected sync_error when browser returns expired endpoint, got: ${state}`);
    assert(isSubscribed === false, 'isSubscribed must be false when expired endpoint returned');
    assert(errorMsg && errorMsg.includes('hết hạn'), `Expected expired endpoint message, got: ${errorMsg}`);

    const syncCountAfter = await cdp.evaluate('window.__mockState.syncedSubscriptions.length');
    assert(syncCountBefore === syncCountAfter, 'Expired endpoint must NEVER be synced to backend');
    console.log('  ✓ Test 14 passed: Expired endpoint returned by browser is rejected before backend sync.');

    // -------------------------------------------------------------
    // Test 15 (R5): Clean recovery when browser generates genuine new endpoint
    // -------------------------------------------------------------
    console.log('▶ Test 15 (R5): Genuine new endpoint recovery...');
    await cdp.evaluate('window.__mockState.subscribeReturnsExpiredEndpoint = null');
    await cdp.evaluate('window.__push.subscribe()');

    state = await cdp.evaluate('window.__push.state');
    isSubscribed = await cdp.evaluate('window.__push.isSubscribed');
    const freshEndpoint = await cdp.evaluate('window.__mockState.activeSubscription?.endpoint');
    assert(state === 'granted', `Expected state granted on genuine recovery, got: ${state}`);
    assert(isSubscribed === true, `Expected isSubscribed true on genuine recovery, got: ${isSubscribed}`);
    assert(freshEndpoint && freshEndpoint !== expiredEp, 'Expected fresh non-expired endpoint');
    console.log('  ✓ Test 15 passed: Genuine new endpoint cleanly transitions to granted and subscribed.');

    console.log('\n🎉 ALL 15 BROWSER REGRESSION TESTS PASSED SUCCESSFULLY!');
  } finally {
    if (cdp) cdp.close();
    chromeProc.kill('SIGTERM');
    server.close();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
      fs.rmSync(bundlePath, { force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('\n❌ Browser Regression Harness Failed:', err.message);
  process.exit(1);
});
