#!/usr/bin/env node
import { execSync } from 'child_process';
import path from 'path';

/**
 * Validates PR file boundaries according to Issue #2 and Issue #5.
 * 
 * Rules for SangVuxx (CMS Super Admin lane):
 * Allowed paths:
 *   - backend/src/modules/admin/**
 *   - frontend/src/pages/admin/** (EXCEPT AdminLogin.tsx)
 * Blocked paths:
 *   - frontend/src/pages/admin/AdminLogin.tsx
 *   - Any file in backend/src/modules/cms/** (this is shop CMS, not platform super admin)
 *   - Any file in frontend/src/pages/staff/**
 *   - Shared auth, middleware, database, types, routes, configs
 */

const SANG_ALLOWED_PREFIXES = [
    'backend/src/modules/admin/',
    'frontend/src/pages/admin/'
];

const SANG_BLOCKED_EXACT = [
    'frontend/src/pages/admin/AdminLogin.tsx'
];

export function validateAuthorFiles(author, files) {
    const isSang = author && (author.toLowerCase().includes('sangvux') || author.toLowerCase().includes('cms-super-admin'));

    const violations = [];
    for (const file of files) {
        const normalized = file.replace(/\\/g, '/');

        if (isSang) {
            // Rules for Sang: only allowed to touch CMS Super Admin files
            if (SANG_BLOCKED_EXACT.includes(normalized)) {
                violations.push(`Sang lane violation: Explicitly forbidden core file: ${normalized}`);
                continue;
            }

            const isAllowed = SANG_ALLOWED_PREFIXES.some(prefix => normalized.startsWith(prefix));
            if (!isAllowed) {
                violations.push(`Sang lane violation: File outside CMS Super Admin allowlist: ${normalized}`);
            }
        } else {
            // Rules for Core / other authors: MUST NOT touch Sang's lane files
            const isSangLaneFile = SANG_ALLOWED_PREFIXES.some(prefix => normalized.startsWith(prefix));
            if (isSangLaneFile && !SANG_BLOCKED_EXACT.includes(normalized)) {
                violations.push(`Core lane violation: Core cannot touch Super Admin lane file: ${normalized}`);
            }
        }
    }

    return {
        valid: violations.length === 0,
        violations
    };
}

export function validateDiffForSecretsAndDebug(diffText) {
    const violations = [];
    const lines = diffText.split('\n');
    let currentFile = '';

    const FORBIDDEN_PATTERNS = [
        { regex: /\bdebugger;?/, name: 'debugger statement' },
        { regex: /console\.log\(['"`](DEBUG|TEST_SECRET)/i, name: 'debug log' },
        { regex: new RegExp(['-WvfchB2Y7C', '_HM1-9_Ym1gXJEBqfy0zeZr5da3PVDiY'].join('')), name: 'known leaked VAPID key' },
        { regex: /(BEGIN PRIVATE KEY)/, name: 'raw private key in source' }
    ];

    for (const line of lines) {
        if (line.startsWith('diff --git ')) {
            const parts = line.split(' ');
            currentFile = parts[parts.length - 1].replace(/^b\//, '');
            continue;
        }

        // Only scan added lines in application code (skip documentation, test mocks and this script itself)
        if (line.startsWith('+') && !line.startsWith('+++')) {
            if (
                currentFile.endsWith('.md') ||
                currentFile.includes('tests/') ||
                currentFile.includes('check-file-boundaries.mjs')
            ) {
                continue;
            }

            for (const pattern of FORBIDDEN_PATTERNS) {
                if (pattern.regex.test(line)) {
                    violations.push(`Found ${pattern.name} in ${currentFile}: ${line.trim()}`);
                }
            }
        }
    }

    return {
        valid: violations.length === 0,
        violations
    };
}

// CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename || '')) {
    const baseRef = process.argv[2] || 'origin/main';
    const author = process.argv[3] || process.env.GITHUB_ACTOR || '';

    try {
        const changedFilesRaw = execSync(`git diff --name-only ${baseRef}...HEAD`, { encoding: 'utf-8' });
        const changedFiles = changedFilesRaw.split('\n').map(s => s.trim()).filter(Boolean);

        const boundaryCheck = validateAuthorFiles(author, changedFiles);
        if (!boundaryCheck.valid) {
            console.error('❌ File Boundary Violation:');
            boundaryCheck.violations.forEach(v => console.error(`  - ${v}`));
            process.exit(1);
        }

        const diffText = execSync(`git diff ${baseRef}...HEAD`, { encoding: 'utf-8' });
        const secretCheck = validateDiffForSecretsAndDebug(diffText);
        if (!secretCheck.valid) {
            console.error('❌ Diff Hygiene Violation:');
            secretCheck.violations.forEach(v => console.error(`  - ${v}`));
            process.exit(1);
        }

        console.log('✅ File boundaries and diff hygiene checks passed successfully.');
    } catch (err) {
        console.error('Error checking PR boundaries:', err.message);
        process.exit(1);
    }
}
