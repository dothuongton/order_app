import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../../app.js';
import { query } from '../../db/pool.js';
import { seed } from '../../db/seed.js';

describe('DATA-01: Protect Table History & Accounting Ledger (Issue #7)', () => {
    let server: http.Server;
    let baseUrl: string;
    let tenantId: string;
    let managerToken: string;
    let tableA01Id: string;

    beforeAll(async () => {
        await seed();

        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        const tenantRes = await query(`SELECT id FROM tenants WHERE slug = 'pho-co'`);
        tenantId = tenantRes.rows[0].id;

        const tableRes = await query(`SELECT id FROM tables WHERE tenant_id = $1 AND table_number = 'A01'`, [tenantId]);
        tableA01Id = tableRes.rows[0].id;

        // Login as manager
        const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@phoco.vn', password: '123456' })
        });
        const loginData: any = await loginRes.json();
        managerToken = loginData.token;
    });

    afterAll(async () => {
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    it('allows deleting a brand new table that has never had any session history', async () => {
        // Create an empty table
        const createRes = await fetch(`${baseUrl}/api/v1/staff/tables`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ table_number: 'EMPTY-99', capacity: 4 })
        });
        expect(createRes.status).toBe(201);
        const createData: any = await createRes.json();
        const emptyTableId = createData.table.id;

        // Delete empty table
        const delRes = await fetch(`${baseUrl}/api/v1/staff/tables/${emptyTableId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(delRes.status).toBe(200);

        const checkRes = await query(`SELECT id FROM tables WHERE id = $1`, [emptyTableId]);
        expect(checkRes.rows).toHaveLength(0);
    });

    it('blocks deleting a table that has past closed sessions and preserves bills and ledger', async () => {
        // Create a past session and bill for Table A01
        const sessRes = await query(`
            INSERT INTO table_sessions (tenant_id, table_id, status, close_reason, closed_at)
            VALUES ($1, $2, 'CLOSED', 'CONFIRMED_SETTLED', NOW())
            RETURNING id
        `, [tenantId, tableA01Id]);
        const sessionId = sessRes.rows[0].id;

        const billRes = await query(`
            INSERT INTO bills (tenant_id, session_id, status, total_amount, confirmed_at)
            VALUES ($1, $2, 'CONFIRMED', 350000, NOW())
            RETURNING id
        `, [tenantId, sessionId]);
        const billId = billRes.rows[0].id;

        // Count bills before delete attempt
        const beforeCount = await query(`SELECT COUNT(*) FROM bills WHERE tenant_id = $1`, [tenantId]);

        // Attempt DELETE via staff API
        const delRes = await fetch(`${baseUrl}/api/v1/staff/tables/${tableA01Id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${managerToken}`,
                'x-tenant-id': tenantId
            }
        });
        expect(delRes.status).toBe(400);
        const delData: any = await delRes.json();
        expect(delData.error).toBe('TABLE_HAS_HISTORY');

        // Verify bill still exists and total bills count is unchanged
        const afterCount = await query(`SELECT COUNT(*) FROM bills WHERE tenant_id = $1`, [tenantId]);
        expect(afterCount.rows[0].count).toBe(beforeCount.rows[0].count);

        const billCheck = await query(`SELECT total_amount, status FROM bills WHERE id = $1`, [billId]);
        expect(billCheck.rows[0].total_amount).toBe('350000');
        expect(billCheck.rows[0].status).toBe('CONFIRMED');

        // Verify that raw SQL deletion is also blocked by database RESTRICT foreign key
        await expect(query(`DELETE FROM tables WHERE id = $1`, [tableA01Id])).rejects.toThrow();
    });
});
