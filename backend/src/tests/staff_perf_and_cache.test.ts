import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.js';
import { query } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { StaffService } from '../modules/staff/staff.service.js';
import { GuestService } from '../modules/guest/guest.service.js';
import { getCachedTenantCatalog, clearTenantMenuCatalogCache } from '../utils/menu-cache.js';
import { getCachedStaffAuth, setCachedStaffAuth, invalidateStaffAuth, setAuthCacheEnabledForTest } from '../utils/auth-cache.js';

describe('Staff Performance, Asset Caching, and Snapshot Parallelism (Issue #142)', () => {
    let server: any;
    let baseUrl: string;
    let tenantId: string;

    beforeAll(async () => {
        await seed(true);

        server = http.createServer(app);
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        const tenantRes = await query(`SELECT id FROM tenants LIMIT 1`);
        tenantId = tenantRes.rows[0].id;
    });

    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    describe('Cache-Control Policies', () => {
        it('serves SPA fallback and HTML routes with no-cache, must-revalidate', async () => {
            const res = await fetch(`${baseUrl}/staff`);
            expect(res.status).toBe(200);
            const cacheControl = res.headers.get('cache-control');
            expect(cacheControl).toContain('no-cache');
            expect(cacheControl).toContain('must-revalidate');
        });

        it('serves static assets under /assets/ with 1-year immutable cache', async () => {
            const assetsDir = path.resolve('dist/public/assets');
            const fallbackAssetsDir = path.resolve('../frontend/dist/assets');
            const targetDir = fs.existsSync(assetsDir) ? assetsDir : fallbackAssetsDir;

            if (fs.existsSync(targetDir)) {
                const files = fs.readdirSync(targetDir);
                const jsOrCss = files.find(f => f.endsWith('.js') || f.endsWith('.css'));
                if (jsOrCss) {
                    const res = await fetch(`${baseUrl}/assets/${jsOrCss}`);
                    expect(res.status).toBe(200);
                    const cacheControl = res.headers.get('cache-control');
                    expect(cacheControl).toBe('public, max-age=31536000, immutable');
                }
            }
        });

        it('ensures API routes protect data with no-store and private headers', async () => {
            const res = await fetch(`${baseUrl}/api/v1/auth/logout`, { method: 'POST' });
            const cacheControl = res.headers.get('cache-control');
            expect(cacheControl).toContain('no-store');
        });
    });

    describe('Staff Dashboard Snapshot', () => {
        it('returns dashboard snapshot with expected shape', async () => {
            const snapshot = await StaffService.getDashboardSnapshot(tenantId);
            expect(snapshot).toBeDefined();
            expect(snapshot.tables).toBeInstanceOf(Array);
            expect(snapshot.openRequests).toBeInstanceOf(Array);
            expect(snapshot.pendingRequests).toBeInstanceOf(Array);
            expect(snapshot.tables.length).toBeGreaterThan(0);

            // Verify table properties
            const firstTable = snapshot.tables[0];
            expect(firstTable).toHaveProperty('table_id');
            expect(firstTable).toHaveProperty('table_number');
            expect(firstTable).toHaveProperty('displayStatus');
            expect(firstTable).toHaveProperty('activeItems');
            expect(firstTable).toHaveProperty('counts');
            expect(firstTable.counts).toHaveProperty('pending');
            expect(firstTable.counts).toHaveProperty('accepted');
            expect(firstTable.counts).toHaveProperty('served');
        });

        it('caches tenant menu catalog in memory and invalidates on request', async () => {
            clearTenantMenuCatalogCache(tenantId);
            expect(getCachedTenantCatalog(tenantId)).toBeNull();

            // First call loads and caches
            const res1 = await GuestService.getPublicTableMenu('qr-phoco-a01');
            expect(res1).not.toBeNull();
            const cached = getCachedTenantCatalog(tenantId);
            expect(cached).not.toBeNull();
            expect(cached?.categories.length).toBeGreaterThan(0);

            // Second call reuses cache
            const res2 = await GuestService.getPublicTableMenu('qr-phoco-a01');
            expect(res2?.categories).toEqual(cached?.categories);

            // Invalidate clears cache
            clearTenantMenuCatalogCache(tenantId);
            expect(getCachedTenantCatalog(tenantId)).toBeNull();
        });

        it('caches staff auth row and purges on invalidation', () => {
            setAuthCacheEnabledForTest(true);
            try {
                const tokenHash = 'test-token-hash-123';
                const sampleRow = { id: 'u-1', tenant_id: tenantId, role: 'waiter' };

                setCachedStaffAuth(tokenHash, tenantId, sampleRow, 5000);
                expect(getCachedStaffAuth(tokenHash, tenantId)).toEqual(sampleRow);

                invalidateStaffAuth(tokenHash);
                expect(getCachedStaffAuth(tokenHash, tenantId)).toBeNull();
            } finally {
                setAuthCacheEnabledForTest(false);
            }
        });
    });

    describe('Code Splitting Chunks in Frontend Build', () => {
        it('keeps staff feature modules out of the initial dashboard chunk', () => {
            const distAssets = path.resolve('../frontend/dist/assets');
            expect(fs.existsSync(distAssets)).toBe(true);

            const files = fs.readdirSync(distAssets);
            const hasIndexChunk = files.some(f => f.startsWith('index-') && f.endsWith('.js'));
            const staffDashboardChunk = files.find(f => f.startsWith('StaffDashboard-') && f.endsWith('.js'));
            const hasGuestLandingChunk = files.some(f => f.startsWith('GuestLanding-') && f.endsWith('.js'));
            const hasAdminDashboardChunk = files.some(f => f.startsWith('AdminDashboard-') && f.endsWith('.js'));
            const hasStaffMenuChunk = files.some(f => f.startsWith('StaffMenuManage-') && f.endsWith('.js'));
            const hasStaffCmsChunk = files.some(f => f.startsWith('StaffCmsManage-') && f.endsWith('.js'));

            expect(hasIndexChunk).toBe(true);
            expect(staffDashboardChunk).toBeDefined();
            expect(hasGuestLandingChunk).toBe(true);
            expect(hasAdminDashboardChunk).toBe(true);
            expect(hasStaffMenuChunk).toBe(true);
            expect(hasStaffCmsChunk).toBe(true);
            expect(fs.statSync(path.join(distAssets, staffDashboardChunk!)).size).toBeLessThan(200 * 1024);
        });
    });
});
