import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import { Client } from 'pg';

const repoRoot = path.resolve(__dirname, '../../../');
const harnessScript = path.join(repoRoot, 'scripts/verify-ux-gaeru-flow-browser.mjs');
const adminDbUrl = process.env.TEST_ADMIN_DATABASE_URL || 'postgres://admin:@localhost:5432/postgres';

describe('H1b: Gaeru Browser Harness Setup Fault-Injection & Lifecycle Cleanup', () => {
    const runHarnessWithFault = async (faultType: string) => {
        const adminClient = new Client({ connectionString: adminDbUrl });
        await adminClient.connect();

        try {
            const res = spawnSync('node', [harnessScript], {
                cwd: repoRoot,
                env: {
                    ...process.env,
                    FAULT_INJECT_SETUP: faultType
                },
                encoding: 'utf8',
                timeout: 15000
            });

            // 1. Must exit with non-zero exit code (1)
            expect(res.status).toBe(1);

            // 2. Extract generated testDbName from output
            const combinedOutput = `${res.stdout}\n${res.stderr}`;
            const match = combinedOutput.match(/qr_order_test_harness_[a-z0-9]+/);
            expect(match).not.toBeNull();
            const createdDbName = match![0];

            // 3. Must have logged the drop cleanup message
            expect(combinedOutput).toContain(`Dropped isolated test DB: ${createdDbName}`);

            // 4. Query PostgreSQL pg_database directly to prove DB was dropped and not leaked
            const dbCheck = await adminClient.query(
                'SELECT 1 FROM pg_database WHERE datname = $1',
                [createdDbName]
            );
            expect(dbCheck.rows.length).toBe(0);
        } finally {
            await adminClient.end();
        }
    };

    it('cleans up test DB and exits 1 when migration fails (FAULT_INJECT_SETUP=migrate)', async () => {
        await runHarnessWithFault('migrate');
    });

    it('cleans up test DB and exits 1 when seed fails (FAULT_INJECT_SETUP=seed)', async () => {
        await runHarnessWithFault('seed');
    });

    it('cleans up test DB and exits 1 when dbClient connect fails (FAULT_INJECT_SETUP=connect)', async () => {
        await runHarnessWithFault('connect');
    });

    it('cleans up test DB and exits 1 on failure right before migration (FAULT_INJECT_SETUP=pre-migrate)', async () => {
        await runHarnessWithFault('pre-migrate');
    });
});
