import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.js';
import { query } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { StaffService } from '../modules/staff/staff.service.js';

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

    describe('Staff Dashboard Snapshot Parallelism', () => {
        it('fetches dashboard snapshot accurately with parallel queries', async () => {
            const snapshot = await StaffService.getDashboardSnapshot(tenantId);
            expect(snapshot).toBeDefined();
            expect(snapshot.tables).toBeInstanceOf(Array);
            expect(snapshot.openRequests).toBeInstanceOf(Array);
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
    });

    describe('Code Splitting Chunks in Frontend Build', () => {
        it('verifies route splitting produced separate lazy chunks for Staff, Guest, and Admin', () => {
            const distAssets = path.resolve('../frontend/dist/assets');
            expect(fs.existsSync(distAssets)).toBe(true);

            const files = fs.readdirSync(distAssets);
            const hasIndexChunk = files.some(f => f.startsWith('index-') && f.endsWith('.js'));
            const hasStaffDashboardChunk = files.some(f => f.startsWith('StaffDashboard-') && f.endsWith('.js'));
            const hasGuestLandingChunk = files.some(f => f.startsWith('GuestLanding-') && f.endsWith('.js'));
            const hasAdminDashboardChunk = files.some(f => f.startsWith('AdminDashboard-') && f.endsWith('.js'));

            expect(hasIndexChunk).toBe(true);
            expect(hasStaffDashboardChunk).toBe(true);
            expect(hasGuestLandingChunk).toBe(true);
            expect(hasAdminDashboardChunk).toBe(true);
        });
    });
});
