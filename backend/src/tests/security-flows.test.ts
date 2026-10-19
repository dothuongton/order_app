import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import http from 'node:http';
import { io as connect, Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { app } from '../app.js';
import { pool, query, withTransaction } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { StaffService } from '../modules/staff/staff.service.js';
import { GuestService } from '../modules/guest/guest.service.js';
import { CmsService } from '../modules/cms/cms.service.js';
import { PushService } from '../modules/push/push.service.js';
import { initSocketIO, broadcastToStaff } from '../realtime/socket.js';
import { deferUntilCommit } from '../utils/transaction-effects.js';
import { decodeImage } from '../utils/images.js';
import { assertPushEndpoint } from '../utils/push-endpoint.js';
import { PricingService } from '../modules/pricing/pricing.service.js';
import { config } from '../config/index.js';

const tenant = '11111111-1111-1111-1111-111111111111';
const otherTenant = '22222222-2222-2222-2222-222222222222';
const manager = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const table = '10000000-0000-0000-0000-000000000003';
let base: string;
let server: http.Server;
let realtime: ReturnType<typeof initSocketIO>;
let managerToken: string;
let waiterToken: string;
let cashierToken: string;
let sessionId: string;
let guestToken: string;
let itemId: string;
const clients: Socket[] = [];

async function api(path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
    return fetch(`${base}/api/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
}
async function socketClient() {
    const client = connect(base, { transports: ['websocket'], forceNew: true, reconnection: false });
    clients.push(client);
    await new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    return client;
}
async function join(client: Socket, event: string, data: unknown) {
    return client.timeout(2000).emitWithAck(event, data);
}

describe('Security and critical flow regression', () => {
    beforeAll(async () => {
        await seed();
        await query('UPDATE promotions SET is_active = false');
        server = http.createServer(app);
        realtime = initSocketIO(server);
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${(server.address() as any).port}`;
        const login = async (email: string) => (await (await api('/auth/login', undefined, { email, password: '123456' })).json() as any).token;
        managerToken = await login('admin@phoco.vn');
        waiterToken = await login('phucvu@phoco.vn');
        cashierToken = await login('thungan@phoco.vn');
        sessionId = (await StaffService.openSession(tenant, table, manager)).sessionId;
        guestToken = (await GuestService.joinSession('qr-phoco-a03')).token;
        itemId = (await query('SELECT id FROM menu_items WHERE tenant_id = $1 ORDER BY id LIMIT 1', [tenant])).rows[0].id;
    });
    afterAll(async () => {
        clients.forEach(client => client.disconnect());
        if (realtime) await new Promise<void>(resolve => realtime.close(() => resolve()));
        if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
        await pool.end();
    });

    it('rejects anonymous access and cross-tenant staff access', async () => {
        expect((await api('/staff/dashboard/snapshot')).status).toBe(401);
        expect((await api('/staff/dashboard/snapshot', managerToken, undefined, { 'x-tenant-id': otherTenant })).status).toBe(403);
    });
    it('enforces waiter and cashier grants through real HTTP routes', async () => {
        expect((await api('/staff/reports/summary', waiterToken)).status).toBe(403);
        expect((await api(`/staff/sessions/${sessionId}/confirm-payment-and-close`, waiterToken, { settlementVersion: 1 })).status).toBe(403);
        expect((await api(`/staff/tables/${table}/open`, cashierToken, {})).status).toBe(403);
        expect((await api('/staff/reports/summary', cashierToken)).status).toBe(200);
        expect((await api('/cms/profile', waiterToken)).status).toBe(403);
    });
    it('rejects SQL injection-shaped IDs before database access', async () => {
        expect((await api("/staff/sessions/1%27%20OR%201%3D1/bill-summary", managerToken)).status).toBe(400);
    });
    it('blocks malicious browser origins including cookie-authenticated writes', async () => {
        const response = await api('/auth/logout', undefined, {}, { Origin: 'https://evil.invalid', Cookie: `staff_token=${managerToken}` });
        expect(response.status).toBe(403);
        expect(response.headers.get('access-control-allow-origin')).toBeNull();
        expect((await api('/auth/me', managerToken, undefined, { Origin: 'https://evil.invalid' })).status).toBe(403);
        const allowed = await api('/auth/me', managerToken, undefined, { Origin: new URL(config.frontendUrl).origin });
        expect(allowed.headers.get('access-control-allow-origin')).toBe(new URL(config.frontendUrl).origin);
        expect(allowed.headers.get('x-content-type-options')).toBe('nosniff');
    });
    it('allows the frontend cache-control headers in CORS preflight', async () => {
        const response = await fetch(`${base}/api/v1/auth/me`, { method: 'OPTIONS', headers: {
            Origin: new URL(config.frontendUrl).origin, 'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'authorization,cache-control,pragma,expires,x-tenant-id'
        } });
        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('cache-control');
    });
    it('prefers per-tab guest header over a cookie belonging to another table', async () => {
        const response = await api('/guest/session', undefined, undefined, { 'x-guest-token': guestToken, Cookie: 'guest_token=stale-other-table' });
        expect(response.status).toBe(200);
        expect((await response.json() as any).sessionId).toBe(sessionId);
    });
    it.each([0, -1, 0.5, '2', null, 1000])('rejects malformed order quantity %s', async quantity => {
        const response = await api('/guest/orders', undefined, { idempotencyKey: randomUUID(), items: [{ menuItemId: itemId, quantity }] }, { 'x-guest-token': guestToken });
        expect(response.status).toBe(400);
    });
    it('serializes concurrent retries and rejects reuse with a different payload', async () => {
        const input = { idempotencyKey: randomUUID(), items: [{ menuItemId: itemId, quantity: 3 }] };
        const results = await Promise.all(Array.from({ length: 6 }, () => GuestService.createOrder(tenant, sessionId, table, input)));
        expect(new Set(results.map(r => r.orderId)).size).toBe(1);
        expect(Number((await query('SELECT COUNT(*) FROM orders WHERE session_id = $1 AND idempotency_key = $2', [sessionId, input.idempotencyKey])).rows[0].count)).toBe(1);
        await expect(GuestService.createOrder(tenant, sessionId, table, { ...input, items: [{ menuItemId: itemId, quantity: 1 }] })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    });
    it('rejects zero, negative, fractional and excessive staff quantities', async () => {
        const order = (await GuestService.getSessionOrders(tenant, sessionId))[0];
        for (const quantity of [0, -1, 0.5, 10]) {
            await expect(StaffService.acceptOrderItem(tenant, order.items[0].id, quantity, manager)).rejects.toMatchObject({ status: 400 });
        }
        await StaffService.acceptOrderItem(tenant, order.items[0].id, 1, manager);
        await StaffService.acceptOrderItem(tenant, order.items[0].id, 2, manager);
        // Both ACCEPTED parts must be served, preserving the full quantity.
        expect((await StaffService.serveOrderItem(tenant, order.items[0].id, 3, manager)).servedQuantity).toBe(3);
        expect((await GuestService.getBillSummary(tenant, sessionId)).unresolvedCount).toBe(0);
    });
    it('requires a nonzero current settlement version', async () => {
        for (const version of [undefined, null, 0, -1, '1']) {
            await expect(StaffService.confirmPaymentAndCloseSession(tenant, sessionId, version as any, manager)).rejects.toMatchObject({ status: 400 });
        }
        await expect(StaffService.confirmPaymentAndCloseSession(tenant, sessionId, 1, manager)).rejects.toMatchObject({ code: 'SUMMARY_CHANGED' });
    });
    it('serializes simultaneous assistance requests into one request row', async () => {
        const requests = await Promise.all(Array.from({ length: 5 }, () => GuestService.createServiceRequest(tenant, sessionId, table, 'ASSISTANCE')));
        expect(new Set(requests.map(r => r.request.id)).size).toBe(1);
        expect(Number((await query("SELECT count(*) FROM service_requests WHERE session_id = $1 AND type = 'ASSISTANCE'", [sessionId])).rows[0].count)).toBe(1);
    });
    it('authorizes realtime rooms using tokens and refuses guessed IDs', async () => {
        const client = await socketClient();
        expect((await join(client, 'join_staff_room', tenant)).ok).toBe(false);
        expect((await join(client, 'join_staff_room', { tenantId: otherTenant, token: managerToken })).ok).toBe(false);
        expect((await join(client, 'join_staff_room', { tenantId: tenant, token: managerToken })).ok).toBe(true);
        expect((await join(client, 'join_session_room', { sessionId, token: 'guessed' })).ok).toBe(false);
        expect((await join(client, 'join_session_room', { sessionId, token: guestToken })).ok).toBe(true);
        expect(realtime.sockets.adapter.rooms.get(`session:${sessionId}:guest`)?.has(client.id!)).toBe(true);
    });
    it('removes realtime access after staff membership revocation', async () => {
        const client = await socketClient();
        expect((await join(client, 'join_staff_room', { tenantId: tenant, token: waiterToken })).ok).toBe(true);
        await query('UPDATE memberships SET is_active = false WHERE tenant_id = $1 AND user_id = $2', [tenant, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']);
        broadcastToStaff(tenant, 'test.revoked', {});
        await expect.poll(() => realtime.sockets.adapter.rooms.get(`tenant:${tenant}:staff`)?.has(client.id!) ?? false).toBe(false);
        await query('UPDATE memberships SET is_active = true WHERE tenant_id = $1 AND user_id = $2', [tenant, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']);
    });
    it.each(['http://localhost:4000/health', 'https://127.0.0.1/', 'https://169.254.169.254/', 'https://fcm.googleapis.com.evil.invalid/', 'https://fcm.googleapis.com@evil.invalid/', 'https://fcm.googleapis.com:444/'])('blocks push SSRF destination %s', endpoint => {
        expect(() => assertPushEndpoint(endpoint)).toThrow();
    });
    it('prevents another user taking over an existing push subscription', async () => {
        const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/security-test', keys: { p256dh: 'test', auth: 'test' } };
        await PushService.subscribe(tenant, manager, subscription);
        await expect(PushService.subscribe(tenant, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', subscription)).rejects.toMatchObject({ code: 'SUBSCRIPTION_OWNED' });
    });
    it('rejects SVG/script uploads and MIME spoofing', async () => {
        for (const data of ['data:image/svg+xml;base64,' + Buffer.from('<svg onload="alert(1)"/>').toString('base64'), 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64')]) {
            expect(() => decodeImage(data)).toThrow();
            expect((await api('/cms/upload', managerToken, { data })).status).toBe(400);
        }
        expect(decodeImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=')).toMatchObject({ mimeType: 'image/png' });
    });
    it('rejects active CMS URLs and unapproved theme fields', async () => {
        await expect(CmsService.createBanner(tenant, { title: 'XSS', imageUrl: '/safe.png', ctaLink: 'javascript:alert(1)' })).rejects.toMatchObject({ status: 400 });
        const draft = await CmsService.getDraft(tenant);
        await expect(CmsService.saveDraft(tenant, { ...draft, themeConfig: { ...draft.themeConfig, customJs: 'alert(1)' } }, manager)).rejects.toMatchObject({ status: 400 });
        await expect(CmsService.createPromotion(tenant, { title: 'Invalid', discountType: 'PERCENT', discountValue: 101 })).rejects.toThrow();
    });
    it('only emits side effects after commit, discarding rolled-back effects', async () => {
        let emitted = 0;
        await expect(withTransaction(async () => { deferUntilCommit(() => { emitted++; }); throw new Error('rollback'); })).rejects.toThrow('rollback');
        expect(emitted).toBe(0);
        await withTransaction(async () => { deferUntilCommit(() => { emitted++; }); });
        expect(emitted).toBe(1);
    });
    it('settles discounts consistently after partial cancellation and revokes guest access', async () => {
        await StaffService.closeWithoutCharge(tenant, (await StaffService.openSession(tenant, '10000000-0000-0000-0000-000000000004', manager)).sessionId, manager, 'empty');
        const discountTable = '10000000-0000-0000-0000-000000000005';
        const discountedSession = (await StaffService.openSession(tenant, discountTable, manager)).sessionId;
        const access = await GuestService.joinSession('qr-phoco-b02');
        const price = Number((await query('SELECT price FROM menu_items WHERE id = $1', [itemId])).rows[0].price);
        await CmsService.createPromotion(tenant, { title: 'Regression 101 VND', discountType: 'FIXED_AMOUNT', discountValue: 101 });
        const order = await GuestService.createOrder(tenant, discountedSession, discountTable, { idempotencyKey: randomUUID(), items: [{ menuItemId: itemId, quantity: 3 }] });
        expect(order.finalTotal).toBe(price * 3 - 101);
        const line = order.items[0].id;
        await StaffService.acceptOrderItem(tenant, line, 3, manager);
        await StaffService.serveOrderItem(tenant, line, 1, manager);
        await StaffService.serveOrderItem(tenant, line, 1, manager);
        await StaffService.cancelOrderItem(tenant, line, 1, 'out of stock', manager);
        const summary = await GuestService.getBillSummary(tenant, discountedSession);
        const expected = price * 2 - 67;
        expect(summary.validBillTotal).toBe(expected);
        expect(summary.rounds[0].items.filter((item: any) => item.status === 'CANCELLED')[0].subtotal).toBe(0);
        const payments = await Promise.allSettled([
            StaffService.confirmPaymentAndCloseSession(tenant, discountedSession, summary.settlementVersion, manager),
            StaffService.confirmPaymentAndCloseSession(tenant, discountedSession, summary.settlementVersion, manager)
        ]);
        expect(payments.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect((payments.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>).value.totalAmount).toBe(expected);
        const bill = await query('SELECT total_amount FROM bills WHERE session_id = $1', [discountedSession]);
        expect(Number(bill.rows[0].total_amount)).toBe(expected);
        expect((await api('/guest/orders', undefined, undefined, { 'x-guest-token': access.token })).status).toBe(401);
        await expect(GuestService.createServiceRequest(tenant, discountedSession, discountTable, 'CHECKOUT')).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
        await expect(StaffService.serveAllAccepted(tenant, discountedSession, manager)).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
        await query('UPDATE promotions SET is_active = false');
    });
    it('allocates a large discount across tiny lines without negative prices or lost VND', async () => {
        const tiny = (await query(`INSERT INTO menu_items (tenant_id, category_id, name, price) VALUES ($1, (SELECT id FROM menu_categories WHERE tenant_id = $1 LIMIT 1), 'Tiny line', 1) RETURNING id`, [tenant])).rows[0].id;
        const promo = await CmsService.createPromotion(tenant, { title: '99 VND discount', discountType: 'FIXED_AMOUNT', discountValue: 99 });
        const result = await withTransaction(client => PricingService.calculateOrderPricing(client, tenant, Array.from({ length: 100 }, () => ({ menuItemId: tiny, quantity: 1 }))));
        expect(result.finalTotal).toBe(1);
        expect(result.items.reduce((sum, item) => sum + item.finalPrice, 0)).toBe(1);
        expect(result.items.every(item => item.finalPrice >= 0 && item.discountAmount <= item.subtotal)).toBe(true);
        await query('UPDATE promotions SET is_active = false WHERE id = $1', [promo.id]);
    });
    it('publishes after rollback and serializes simultaneous publishes without version collisions', async () => {
        const first = await CmsService.publishDraft(tenant, 'first', manager);
        await CmsService.rollbackVersion(tenant, 1, manager);
        const next = await CmsService.publishDraft(tenant, 'after rollback', manager);
        expect(next.publishedVersion).toBeGreaterThan(first.publishedVersion);
        const parallel = await Promise.all([CmsService.publishDraft(tenant, 'parallel A', manager), CmsService.publishDraft(tenant, 'parallel B', manager)]);
        expect(new Set(parallel.map(result => result.publishedVersion)).size).toBe(2);
        const versions = await CmsService.getVersions(tenant);
        expect(versions[0].templateId).toBeDefined();
        expect(versions[0].publishedAt).toBeTruthy();
    });
    it('returns CMS fields that match the editor and mobile preview contracts', async () => {
        await CmsService.createBanner(tenant, { title: 'Preview banner', imageUrl: '/preview.png', isActive: true });
        const banners = await CmsService.listBanners(tenant);
        expect(banners.some(row => row.imageUrl === '/preview.png' && row.isActive)).toBe(true);
        const menu = await api('/staff/menu/items', managerToken);
        const categories = await api('/staff/menu/categories', managerToken);
        expect((await menu.json() as any).items.length).toBeGreaterThan(0);
        expect((await categories.json() as any).categories.length).toBeGreaterThan(0);
        const promotions = await CmsService.listPromotions(tenant);
        expect(typeof promotions[0].discountValue).toBe('number');
    });
    it('does not create shops using a missing/default owner password', async () => {
        const { AdminService } = await import('../modules/admin/admin.service.js');
        await expect(AdminService.createShop({ name: 'Unsafe', slug: 'unsafe', ownerEmail: 'owner@example.com', ownerFullName: 'Owner' }, manager)).rejects.toMatchObject({ status: 400 });
    });
    it('rejects access for suspended shops with an already issued token', async () => {
        await query("UPDATE tenants SET status = 'suspended' WHERE id = $1", [tenant]);
        expect((await api('/guest/session', undefined, undefined, { 'x-guest-token': guestToken })).status).toBe(403);
        await expect(StaffService.openSession(tenant, table, manager)).rejects.toMatchObject({ code: 'SHOP_SUSPENDED' });
        await query("UPDATE tenants SET status = 'active' WHERE id = $1", [tenant]);
    });
    it('clears both authentication cookies on logout', async () => {
        const response = await api('/auth/logout', undefined, {});
        expect(response.headers.get('set-cookie')).toContain('staff_token=;');
        expect(response.headers.get('set-cookie')).toContain('admin_token=;');
    });
    it('rejects known/default production signing secrets before serving traffic', async () => {
        const { execFileSync } = await import('node:child_process');
        expect(() => execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', "await import('./src/config/index.ts')"], {
            env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'super-secret-jwt-key-for-qr-order-v12', GUEST_COOKIE_SECRET: 'super-secret-guest-cookie-token' }, stdio: 'pipe'
        })).toThrow();
    });
    it('invalidates logged-out bearer tokens for HTTP and realtime access', async () => {
        const response = await api('/auth/login', undefined, { email: 'admin@phoco.vn', password: '123456' });
        const token = (await response.json() as any).token;
        expect((await api('/auth/me', token)).status).toBe(200);
        expect((await api('/auth/logout', token, {})).status).toBe(200);
        expect((await api('/auth/me', token)).status).toBe(401);
        const client = await socketClient();
        expect((await join(client, 'join_staff_room', { tenantId: tenant, token })).ok).toBe(false);
        // A new login within the same second must receive a distinct, usable token.
        const next = await api('/auth/login', undefined, { email: 'admin@phoco.vn', password: '123456' });
        const nextToken = (await next.json() as any).token;
        expect(nextToken).not.toBe(token);
        expect((await api('/auth/me', nextToken)).status).toBe(200);
    });
    it('limits login brute force attempts', async () => {
        let response: Response | undefined;
        for (let i = 0; i < 21; i++) response = await api('/auth/login', undefined, { email: 'nobody@example.com', password: 'wrong' });
        expect(response!.status).toBe(429);
    });
});
