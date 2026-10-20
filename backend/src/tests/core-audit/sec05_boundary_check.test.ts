import { describe, it, expect } from 'vitest';
import { validateAuthorFiles, validateDiffForSecretsAndDebug } from '../../../../scripts/check-file-boundaries.mjs';

describe('SEC-05: CI File Boundary & Hygiene Gate (Issue #5)', () => {
    it('allows valid CMS Super Admin files for SangVuxx lane', () => {
        const allowedFiles = [
            'backend/src/modules/admin/shops.controller.ts',
            'frontend/src/pages/admin/AdminDashboard.tsx',
            'frontend/src/pages/admin/AdminShops.tsx'
        ];
        const res = validateAuthorFiles('SangVuxx', allowedFiles);
        expect(res.valid).toBe(true);
        expect(res.violations).toHaveLength(0);
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
});
