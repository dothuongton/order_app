import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import {
    validateAuthorFiles,
    validateDiffForSecretsAndDebug,
    resolveLane,
    parseChangedFilesFromDiffStatus
} from '../../../../scripts/check-file-boundaries.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../../');
const scriptPath = path.join(repoRoot, 'scripts/check-file-boundaries.mjs');

describe('SEC-05: CI File Boundary & Hygiene Gate (Issue #5, Issue #29)', () => {
    it('allows valid CMS Super Admin files for SangVuxx lane (including components, tests, docs, and exact admin.ts files)', () => {
        const allowedFiles = [
            'backend/src/modules/admin/shops.controller.ts',
            'frontend/src/pages/admin/AdminDashboard.tsx',
            'frontend/src/pages/admin/AdminShops.tsx',
            'frontend/src/components/admin/ShopCard.tsx',
            'frontend/src/api/admin.ts',
            'frontend/src/types/admin.ts',
            'backend/src/tests/admin-cms/shops.test.ts',
            'docs/admin-cms/contract.md'
        ];
        const res = validateAuthorFiles('SangVuxx', allowedFiles);
        expect(res.valid).toBe(true);
        expect(res.violations).toHaveLength(0);
    });

    it('blocks Sang exact files (frontend/src/api/admin.ts, frontend/src/types/admin.ts) for Core authors', () => {
        const coreWithSangApi = [
            'backend/src/modules/guest/guest.service.ts',
            'frontend/src/api/admin.ts'
        ];
        const res1 = validateAuthorFiles('dothuongton', coreWithSangApi);
        expect(res1.valid).toBe(false);
        expect(res1.violations.some(v => v.includes('Core cannot touch Super Admin lane file'))).toBe(true);

        const coreWithSangTypes = [
            'frontend/src/types/admin.ts'
        ];
        const res2 = validateAuthorFiles('codex', coreWithSangTypes);
        expect(res2.valid).toBe(false);
        expect(res2.violations.some(v => v.includes('Core cannot touch Super Admin lane file'))).toBe(true);
    });

    it('blocks Sang components, tests, and docs for Core authors', () => {
        const coreWithSangComponents = [
            'backend/src/modules/guest/guest.service.ts',
            'frontend/src/components/admin/ShopCard.tsx'
        ];
        const res1 = validateAuthorFiles('Antigravity', coreWithSangComponents);
        expect(res1.valid).toBe(false);
        expect(res1.violations.some(v => v.includes('Core cannot touch Super Admin lane file'))).toBe(true);

        const coreWithSangTests = [
            'backend/src/tests/admin-cms/shops.test.ts'
        ];
        const res2 = validateAuthorFiles('dothuongton', coreWithSangTests);
        expect(res2.valid).toBe(false);

        const coreWithSangDocs = [
            'docs/admin-cms/contract.md'
        ];
        const res3 = validateAuthorFiles('dothuongton', coreWithSangDocs);
        expect(res3.valid).toBe(false);
    });

    it('fails closed when author or lane is missing or empty', () => {
        const res1 = validateAuthorFiles('', ['backend/src/modules/guest/guest.service.ts']);
        expect(res1.valid).toBe(false);
        expect(res1.violations.some(v => v.includes('Lane detection error'))).toBe(true);

        const res2 = validateAuthorFiles(undefined, ['backend/src/modules/guest/guest.service.ts']);
        expect(res2.valid).toBe(false);
    });

    it('fails closed when author or lane is unknown or attempted bypass via branch substring', () => {
        const res1 = validateAuthorFiles('random-bot', ['backend/src/modules/guest/guest.service.ts']);
        expect(res1.valid).toBe(false);
        expect(res1.violations.some(v => v.includes('Unknown or unauthorized lane'))).toBe(true);

        // Branch substring bypass attempt must not grant permissions
        const res2 = validateAuthorFiles('feature/cms-super-admin-bypass', ['backend/src/modules/admin/shops.ts']);
        expect(res2.valid).toBe(false);
        expect(res2.violations.some(v => v.includes('Unknown or unauthorized lane'))).toBe(true);
    });

    it('fails closed when lane metadata is conflicting', () => {
        const res = validateAuthorFiles('SangVuxx dothuongton', ['backend/src/modules/guest/guest.service.ts']);
        expect(res.valid).toBe(false);
        expect(res.violations.some(v => v.includes('Conflicting lane metadata'))).toBe(true);

        const resLabelConflict = validateAuthorFiles('lane:cms-super-admin lane:core', ['backend/src/modules/guest/guest.service.ts']);
        expect(resLabelConflict.valid).toBe(false);
        expect(resLabelConflict.violations.some(v => v.includes('Conflicting lane metadata'))).toBe(true);
    });

    it('blocks AdminLogin.tsx for SangVuxx lane', () => {
        const filesWithAdminLogin = [
            'backend/src/modules/admin/shops.controller.ts',
            'frontend/src/pages/admin/AdminLogin.tsx'
        ];
        const res = validateAuthorFiles('SangVuxx', filesWithAdminLogin);
        expect(res.valid).toBe(false);
        expect(res.violations.some(v => v.includes('AdminLogin.tsx'))).toBe(true);
    });

    it('blocks shared files (auth, schema, core routes) for SangVuxx lane', () => {
        const filesWithShared = [
            'backend/src/modules/admin/shops.controller.ts',
            'backend/src/db/schema.sql',
            'backend/src/middleware/auth.ts'
        ];
        const res = validateAuthorFiles('SangVuxx', filesWithShared);
        expect(res.valid).toBe(false);
        expect(res.violations.length).toBe(2);
    });

    it('detects debugger statements and leaked secrets in diff text', () => {
        const badDiff = `
+ const a = 1;
+ debugger;
+ const leaked = "-WvfchB2Y7C_HM1-9_Ym1gXJEBqfy0zeZr5da3PVDiY";
        `;
        const res = validateDiffForSecretsAndDebug(badDiff);
        expect(res.valid).toBe(false);
        expect(res.violations.length).toBe(2);
    });

    it('passes clean diff text without debug statements or leaked keys', () => {
        const cleanDiff = `
+ const isValid = true;
+ console.log('Information message');
        `;
        const res = validateDiffForSecretsAndDebug(cleanDiff);
        expect(res.valid).toBe(true);
        expect(res.violations).toHaveLength(0);
    });

    it('blocks Sang lane files for Core authors', () => {
        const coreFilesWithSangLane = [
            'backend/src/modules/guest/guest.service.ts',
            'backend/src/modules/admin/shops.controller.ts'
        ];
        const res = validateAuthorFiles('Antigravity', coreFilesWithSangLane);
        expect(res.valid).toBe(false);
        expect(res.violations.some(v => v.includes('Core cannot touch Super Admin lane file'))).toBe(true);
    });

    it('allows Core authors to touch AdminLogin.tsx and core files', () => {
        const coreAllowedFiles = [
            'backend/src/modules/guest/guest.service.ts',
            'frontend/src/pages/admin/AdminLogin.tsx',
            'backend/src/middleware/auth.ts'
        ];
        const res = validateAuthorFiles('Antigravity', coreAllowedFiles);
        expect(res.valid).toBe(true);
        expect(res.violations).toHaveLength(0);
    });

    it('parses both source and destination on renamed files and handles deleted files in diff status', () => {
        const statusOutput = `
M\tbackend/src/modules/guest/guest.service.ts
R100\tfrontend/src/old/path.ts\tfrontend/src/new/path.ts
D\tfrontend/src/deprecated/file.ts
A\tbackend/src/modules/admin/new.ts
`;
        const parsed = parseChangedFilesFromDiffStatus(statusOutput);
        expect(parsed).toContain('backend/src/modules/guest/guest.service.ts');
        expect(parsed).toContain('frontend/src/old/path.ts');
        expect(parsed).toContain('frontend/src/new/path.ts');
        expect(parsed).toContain('frontend/src/deprecated/file.ts');
        expect(parsed).toContain('backend/src/modules/admin/new.ts');
    });

    it('handles author and PR labels independently, ignoring ordinary labels and rejecting conflicting ones', () => {
        const coreFiles = ['backend/src/modules/guest/guest.service.ts'];

        // 1. Author dothuongton with ordinary label priority:P1 should SUCCEED
        const res1 = validateAuthorFiles('dothuongton', coreFiles, 'priority:P1 bug');
        expect(res1.valid).toBe(true);
        expect(res1.violations).toHaveLength(0);

        // 2. Author SangVuxx claiming lane:core via label must FAIL CLOSED
        const res2 = validateAuthorFiles('SangVuxx', coreFiles, 'lane:core');
        expect(res2.valid).toBe(false);
        expect(res2.violations.some(v => v.includes('conflicting label "lane:core"'))).toBe(true);

        // 3. Author dothuongton with Sang lane label must FAIL CLOSED
        const res3 = validateAuthorFiles('dothuongton', coreFiles, 'lane:cms-super-admin');
        expect(res3.valid).toBe(false);
        expect(res3.violations.some(v => v.includes('conflicting Sang lane label'))).toBe(true);

        // 4. Unknown author with valid lane label must FAIL CLOSED
        const res4 = validateAuthorFiles('unknown-contributor', coreFiles, 'lane:core');
        expect(res4.valid).toBe(false);
        expect(res4.violations.some(v => v.includes('Unknown or unauthorized author'))).toBe(true);
    });

    describe('Git CLI Execution & Fixture Suite (Issue #29)', () => {
        let fixtureDir: string;

        beforeAll(() => {
            fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-boundary-fixture-'));
            execSync('git init -b main', { cwd: fixtureDir });
            execSync('git config user.name "Tester"', { cwd: fixtureDir });
            execSync('git config user.email "test@example.com"', { cwd: fixtureDir });

            // Create initial baseline on main
            fs.writeFileSync(path.join(fixtureDir, 'README.md'), '# Initial');
            fs.mkdirSync(path.join(fixtureDir, 'backend/src/modules/admin'), { recursive: true });
            fs.mkdirSync(path.join(fixtureDir, 'backend/src/modules/guest'), { recursive: true });
            fs.writeFileSync(path.join(fixtureDir, 'backend/src/modules/admin/admin.service.ts'), '// admin');
            fs.writeFileSync(path.join(fixtureDir, 'backend/src/modules/guest/guest.service.ts'), '// guest');
            execSync('git add . && git commit -m "Baseline commit"', { cwd: fixtureDir });
        });

        afterAll(() => {
            if (fixtureDir && fs.existsSync(fixtureDir)) {
                fs.rmSync(fixtureDir, { recursive: true, force: true });
            }
        });

        it('fails closed when trusted base reference cannot be resolved in git (no silent fallback to HEAD~1 or HEAD)', () => {
            try {
                execSync(`node "${scriptPath}" non-existent-base-ref`, {
                    cwd: fixtureDir,
                    env: { ...process.env, PR_AUTHOR: 'dothuongton' },
                    stdio: 'pipe'
                });
                expect.unreachable('Should fail on unresolvable base ref');
            } catch (err: any) {
                expect(err.status).toBe(1);
                const stderr = err.stderr.toString();
                expect(stderr).toContain('Base reference "non-existent-base-ref" cannot be resolved');
                expect(stderr).toContain('git fetch origin <base_branch>');
            }
        });

        it('inspects full multi-commit diff against base and catches violations in earlier commits (not masked by later clean commits)', () => {
            // Checkout feature branch
            execSync('git checkout -b feature-multi-commit', { cwd: fixtureDir });

            // Commit 1: Core author touches Sang\'s lane file (VIOLATION)
            fs.appendFileSync(path.join(fixtureDir, 'backend/src/modules/admin/admin.service.ts'), '\n// core edited this');
            execSync('git commit -am "Core touched Sang admin file"', { cwd: fixtureDir });

            // Commit 2: Core author edits clean doc file
            fs.appendFileSync(path.join(fixtureDir, 'README.md'), '\n// doc update');
            execSync('git commit -am "Core updated doc only"', { cwd: fixtureDir });

            // Running against base "main" must catch the violation from commit 1!
            try {
                execSync(`node "${scriptPath}" main`, {
                    cwd: fixtureDir,
                    env: { ...process.env, PR_AUTHOR: 'dothuongton' },
                    stdio: 'pipe'
                });
                expect.unreachable('Should fail because commit 1 touched Sang file');
            } catch (err: any) {
                expect(err.status).toBe(1);
                expect(err.stderr.toString()).toContain('Core cannot touch Super Admin lane file');
            }
        });

        it('detects violations on renamed files in multi-commit branch', () => {
            execSync('git checkout -b feature-rename', { cwd: fixtureDir });

            // Core author renames guest file to admin file
            fs.renameSync(
                path.join(fixtureDir, 'backend/src/modules/guest/guest.service.ts'),
                path.join(fixtureDir, 'backend/src/modules/admin/renamed.service.ts')
            );
            execSync('git add -A && git commit -m "Rename to admin path"', { cwd: fixtureDir });

            try {
                execSync(`node "${scriptPath}" main`, {
                    cwd: fixtureDir,
                    env: { ...process.env, PR_AUTHOR: 'dothuongton' },
                    stdio: 'pipe'
                });
                expect.unreachable('Should fail because destination is in Sang lane');
            } catch (err: any) {
                expect(err.status).toBe(1);
                expect(err.stderr.toString()).toContain('Core cannot touch Super Admin lane file');
            }
        });

        it('enforces author vs label separation via CLI (fails closed on conflicting labels, ignores ordinary labels)', () => {
            execSync('git checkout main', { cwd: fixtureDir });
            execSync('git checkout -b feature-clean-core', { cwd: fixtureDir });
            fs.appendFileSync(path.join(fixtureDir, 'backend/src/modules/guest/guest.service.ts'), '\n// clean guest edit');
            execSync('git commit -am "Clean core change"', { cwd: fixtureDir });

            // 1. Sang author claiming lane:core on core diff -> FAIL CLOSED
            try {
                execSync(`node "${scriptPath}" main`, {
                    cwd: fixtureDir,
                    env: { ...process.env, PR_AUTHOR: 'SangVuxx', PR_LABELS: 'lane:core' },
                    stdio: 'pipe'
                });
                expect.unreachable('Sang author with lane:core must fail closed');
            } catch (err: any) {
                expect(err.status).toBe(1);
                expect(err.stderr.toString()).toContain('conflicting label "lane:core"');
            }

            // 2. Core author with ordinary labels priority:P1 bug -> PASS
            const out = execSync(`node "${scriptPath}" main`, {
                cwd: fixtureDir,
                env: { ...process.env, PR_AUTHOR: 'dothuongton', PR_LABELS: 'priority:P1 bug' },
                encoding: 'utf-8'
            });
            expect(out).toContain('passed successfully');

            // 3. Unknown author -> FAIL CLOSED
            try {
                execSync(`node "${scriptPath}" main`, {
                    cwd: fixtureDir,
                    env: { ...process.env, PR_AUTHOR: 'random-unauthorized-user' },
                    stdio: 'pipe'
                });
                expect.unreachable('Unknown author must fail closed');
            } catch (err: any) {
                expect(err.status).toBe(1);
                expect(err.stderr.toString()).toContain('Unknown or unauthorized lane identifier');
            }
        });
    });
});
