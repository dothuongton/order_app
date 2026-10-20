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

    describe('Git CLI Execution & CI Workflow Trusted Guard Suite (Issue #29)', () => {
        let fixtureDir: string;

        // Helper executing the exact CI workflow step logic
        function runWorkflowCheck(baseRef: string, env: Record<string, string>) {
            const runnerTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-runner-temp-'));
            try {
                const script = `
                    if git cat-file -e "${baseRef}:scripts/check-file-boundaries.mjs" 2>/dev/null; then
                        TMP_GUARD="${runnerTemp}/trusted-boundary-$$.mjs"
                        git show "${baseRef}:scripts/check-file-boundaries.mjs" > "$TMP_GUARD"
                        node "$TMP_GUARD" "${baseRef}"
                        EXIT_CODE=$?
                        rm -f "$TMP_GUARD"
                        exit $EXIT_CODE
                    else
                        node scripts/check-file-boundaries.mjs "${baseRef}"
                    fi
                `;
                return execSync(script, {
                    cwd: fixtureDir,
                    env: { ...process.env, RUNNER_TEMP: runnerTemp, ...env },
                    encoding: 'utf-8',
                    stdio: 'pipe'
                });
            } finally {
                fs.rmSync(runnerTemp, { recursive: true, force: true });
            }
        }

        beforeAll(() => {
            fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-boundary-fixture-'));
            execSync('git init -b main', { cwd: fixtureDir });
            execSync('git config user.name "Tester"', { cwd: fixtureDir });
            execSync('git config user.email "test@example.com"', { cwd: fixtureDir });

            // Create baseline on main WITH scripts/check-file-boundaries.mjs committed
            fs.writeFileSync(path.join(fixtureDir, 'README.md'), '# Initial');
            fs.mkdirSync(path.join(fixtureDir, 'scripts'), { recursive: true });
            fs.copyFileSync(scriptPath, path.join(fixtureDir, 'scripts/check-file-boundaries.mjs'));
            fs.mkdirSync(path.join(fixtureDir, 'backend/src/modules/admin'), { recursive: true });
            fs.mkdirSync(path.join(fixtureDir, 'backend/src/modules/guest'), { recursive: true });
            fs.writeFileSync(path.join(fixtureDir, 'backend/src/modules/admin/admin.service.ts'), '// admin');
            fs.writeFileSync(path.join(fixtureDir, 'backend/src/modules/guest/guest.service.ts'), '// guest');
            execSync('git add . && git commit -m "Baseline commit with scripts on main"', { cwd: fixtureDir });
        });

        afterAll(() => {
            if (fixtureDir && fs.existsSync(fixtureDir)) {
                fs.rmSync(fixtureDir, { recursive: true, force: true });
            }
        });

        it('fails closed when trusted base reference cannot be resolved in git (no silent fallback to HEAD~1 or HEAD)', () => {
            try {
                runWorkflowCheck('refs/heads/does-not-exist', { PR_AUTHOR: 'dothuongton' });
                expect.unreachable('Should fail on unresolvable base ref');
            } catch (err: any) {
                expect(err.status).toBe(1);
                const stderr = err.stderr.toString();
                expect(stderr).toContain('Base reference "refs/heads/does-not-exist" cannot be resolved');
                expect(stderr).toContain('git fetch origin <base_branch>');
            }
        });

        it('allows valid author with correct lane diff using workflow execution', () => {
            execSync('git checkout main', { cwd: fixtureDir });
            execSync('git checkout -b feature-valid-core', { cwd: fixtureDir });
            fs.appendFileSync(path.join(fixtureDir, 'backend/src/modules/guest/guest.service.ts'), '\n// valid guest change');
            execSync('git commit -am "Valid core change"', { cwd: fixtureDir });

            const out = runWorkflowCheck('main', { PR_AUTHOR: 'dothuongton', PR_LABELS: 'priority:P1 bug' });
            expect(out).toContain('passed successfully');
        });

        it('blocks author modifying files outside assigned lane using workflow execution', () => {
            execSync('git checkout main', { cwd: fixtureDir });
            execSync('git checkout -b feature-core-violating-sang', { cwd: fixtureDir });
            fs.appendFileSync(path.join(fixtureDir, 'backend/src/modules/admin/admin.service.ts'), '\n// core touched sang lane');
            execSync('git commit -am "Core touched admin file"', { cwd: fixtureDir });

            try {
                runWorkflowCheck('main', { PR_AUTHOR: 'dothuongton' });
                expect.unreachable('Should fail when core author touches Sang file');
            } catch (err: any) {
                expect(err.status).toBe(1);
                expect(err.stderr.toString()).toContain('Core cannot touch Super Admin lane file');
            }
        });

        it('inspects full multi-commit diff against base and catches violations in earlier commits (not masked by later clean commits)', () => {
            execSync('git checkout main', { cwd: fixtureDir });
            execSync('git checkout -b feature-multi-commit-violation', { cwd: fixtureDir });

            // Commit 1: Core touches Sang lane file (VIOLATION)
            fs.appendFileSync(path.join(fixtureDir, 'backend/src/modules/admin/admin.service.ts'), '\n// core touched admin');
            execSync('git commit -am "Commit 1 violating"', { cwd: fixtureDir });

            // Commit 2: Clean doc update
            fs.appendFileSync(path.join(fixtureDir, 'README.md'), '\n// clean doc update');
            execSync('git commit -am "Commit 2 clean doc"', { cwd: fixtureDir });

            try {
                runWorkflowCheck('main', { PR_AUTHOR: 'dothuongton' });
                expect.unreachable('Should fail because commit 1 had violation');
            } catch (err: any) {
                expect(err.status).toBe(1);
                expect(err.stderr.toString()).toContain('Core cannot touch Super Admin lane file');
            }
        });

        it('prevents PR branch from bypassing checks by tampering with check-file-boundaries.mjs (trusted guard from base is executed)', () => {
            execSync('git checkout main', { cwd: fixtureDir });
            execSync('git checkout -b feature-malicious-pr', { cwd: fixtureDir });

            // Tamper with check script in PR branch to exit 0
            fs.writeFileSync(path.join(fixtureDir, 'scripts/check-file-boundaries.mjs'), 'console.log("MALICIOUS_BYPASS"); process.exit(0);');
            // Also commit a boundary violation
            fs.appendFileSync(path.join(fixtureDir, 'backend/src/modules/admin/admin.service.ts'), '\n// unauthorized change');
            execSync('git commit -am "Tamper script and modify sang file"', { cwd: fixtureDir });

            try {
                const out = runWorkflowCheck('main', { PR_AUTHOR: 'dothuongton' });
                expect.unreachable('Malicious script must not bypass check');
            } catch (err: any) {
                expect(err.status).toBe(1);
                // Proves that the trusted script from main ran, not the tampered script!
                expect(err.stderr.toString()).toContain('Core cannot touch Super Admin lane file');
                expect(err.stdout.toString()).not.toContain('MALICIOUS_BYPASS');
            }
        });

        it('executes validator and verifies diff when piped via stdin (cat script | node - <base>)', () => {
            execSync('git checkout feature-valid-core', { cwd: fixtureDir });
            const cleanOut = execSync(`cat scripts/check-file-boundaries.mjs | node - main`, {
                cwd: fixtureDir,
                env: { ...process.env, PR_AUTHOR: 'dothuongton' },
                encoding: 'utf-8'
            });
            expect(cleanOut).toContain('passed successfully');

            execSync('git checkout feature-core-violating-sang', { cwd: fixtureDir });
            try {
                execSync(`cat scripts/check-file-boundaries.mjs | node - main`, {
                    cwd: fixtureDir,
                    env: { ...process.env, PR_AUTHOR: 'dothuongton' },
                    stdio: 'pipe'
                });
                expect.unreachable('Should fail when piped via stdin on violating diff');
            } catch (err: any) {
                expect(err.status).toBe(1);
                expect(err.stderr.toString()).toContain('Core cannot touch Super Admin lane file');
            }
        });

        it('detects violations on renamed files in multi-commit branch', () => {
            execSync('git checkout main', { cwd: fixtureDir });
            execSync('git checkout -b feature-rename-violation', { cwd: fixtureDir });

            // Core author renames guest file to admin file
            fs.renameSync(
                path.join(fixtureDir, 'backend/src/modules/guest/guest.service.ts'),
                path.join(fixtureDir, 'backend/src/modules/admin/renamed.service.ts')
            );
            execSync('git add -A && git commit -m "Rename to admin path"', { cwd: fixtureDir });

            try {
                runWorkflowCheck('main', { PR_AUTHOR: 'dothuongton' });
                expect.unreachable('Should fail because destination is in Sang lane');
            } catch (err: any) {
                expect(err.status).toBe(1);
                expect(err.stderr.toString()).toContain('Core cannot touch Super Admin lane file');
            }
        });

        it('enforces author vs label separation via CLI (fails closed on conflicting labels, ignores ordinary labels)', () => {
            execSync('git checkout feature-valid-core', { cwd: fixtureDir });

            // 1. Sang author claiming lane:core on core diff -> FAIL CLOSED
            try {
                runWorkflowCheck('main', { PR_AUTHOR: 'SangVuxx', PR_LABELS: 'lane:core' });
                expect.unreachable('Sang author with lane:core must fail closed');
            } catch (err: any) {
                expect(err.status).toBe(1);
                expect(err.stderr.toString()).toContain('conflicting label "lane:core"');
            }

            // 2. Core author with ordinary labels priority:P1 bug -> PASS
            const out = runWorkflowCheck('main', { PR_AUTHOR: 'dothuongton', PR_LABELS: 'priority:P1 bug' });
            expect(out).toContain('passed successfully');

            // 3. Unknown author -> FAIL CLOSED
            try {
                runWorkflowCheck('main', { PR_AUTHOR: 'random-unauthorized-user' });
                expect.unreachable('Unknown author must fail closed');
            } catch (err: any) {
                expect(err.status).toBe(1);
                expect(err.stderr.toString()).toContain('Unknown or unauthorized lane identifier');
            }
        });
    });
});
