#!/usr/bin/env node
import { execSync } from 'child_process';
import path from 'path';

/**
 * Validates PR file boundaries according to Issue #2, Issue #5, and Issue #29.
 * 
 * Rules for SangVuxx (CMS Super Admin lane):
 * Allowed paths:
 *   - backend/src/modules/admin/**
 *   - frontend/src/pages/admin/** (EXCEPT AdminLogin.tsx)
 *   - frontend/src/components/admin/**
 *   - frontend/src/hooks/admin/**
 *   - frontend/src/api/admin/** and frontend/src/api/admin.ts
 *   - frontend/src/types/admin/** and frontend/src/types/admin.ts
 *   - backend/src/tests/admin-cms/**
 *   - docs/admin-cms/**
 * Blocked paths:
 *   - frontend/src/pages/admin/AdminLogin.tsx
 *   - Any file in backend/src/modules/cms/** (this is shop CMS, not platform super admin)
 *   - Any file in frontend/src/pages/staff/**
 *   - Shared auth, middleware, database, types, routes, configs
 * 
 * Enforcement Boundary & Policy Protection Architecture:
 * 1. Script/Policy Ownership:
 *    - scripts/check-file-boundaries.mjs and .github/workflows/** are strictly owned by Core (dothuongton).
 *    - SANG_ALLOWED_PREFIXES strictly excludes scripts/ and .github/. Any attempt by Sang to modify
 *      the boundary check script or CI workflows is immediately rejected as a boundary violation.
 * 2. Repository Branch Protection:
 *    - GitHub branch protection on `main` enforces required PR reviews and status checks.
 *    - PR execution runs in an isolated ephemeral VM; modifying the local script in a PR cannot
 *      bypass protected branch checks on GitHub because only Core maintainers have merge authority.
 *    - When a PR modifies scripts/ or CI, Core review is mandatory per AGENTS.md and CODEOWNERS.
 */

export const SANG_ALLOWED_PREFIXES = [
    'backend/src/modules/admin/',
    'frontend/src/pages/admin/',
    'frontend/src/components/admin/',
    'frontend/src/hooks/admin/',
    'frontend/src/api/admin/',
    'frontend/src/types/admin/',
    'backend/src/tests/admin-cms/',
    'docs/admin-cms/'
];

export const SANG_ALLOWED_EXACT = [
    'frontend/src/api/admin.ts',
    'frontend/src/types/admin.ts'
];

export const SANG_BLOCKED_EXACT = [
    'frontend/src/pages/admin/AdminLogin.tsx'
];

export function isSangPath(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    if (SANG_BLOCKED_EXACT.includes(normalized)) {
        return false;
    }
    return SANG_ALLOWED_PREFIXES.some(prefix => normalized.startsWith(prefix)) ||
           SANG_ALLOWED_EXACT.includes(normalized);
}

export function resolveLaneFromAuthorAndLabels(authorInput, labelsInput = '') {
    if (!authorInput || typeof authorInput !== 'string' || authorInput.trim() === '') {
        return { lane: null, error: 'Lane detection error: PR author is required (must not be empty)' };
    }

    const cleanAuthor = authorInput.trim().toLowerCase();
    const SANG_AUTHORS = new Set(['sangvuxx', 'sangvux']);
    const CORE_AUTHORS = new Set(['dothuongton', 'core', 'antigravity', 'codex', 'github-actions[bot]']);

    let authorLane = null;
    if (SANG_AUTHORS.has(cleanAuthor)) {
        authorLane = 'sang';
    } else if (CORE_AUTHORS.has(cleanAuthor)) {
        authorLane = 'core';
    } else {
        return {
            lane: null,
            error: `Lane detection error: Unknown or unauthorized author "${authorInput}". Must map strictly to Sang (SangVuxx) or Core (dothuongton/codex/antigravity).`
        };
    }

    // Parse labels if present: only lane labels are inspected, ordinary labels (priority:P1, bug, etc.) are ignored
    if (labelsInput && typeof labelsInput === 'string') {
        const tokens = labelsInput.trim().split(/[\s,]+/).filter(Boolean);
        let hasSangLabel = false;
        let hasCoreLabel = false;

        for (const token of tokens) {
            const lower = token.toLowerCase();
            if (lower === 'lane:cms-super-admin' || lower === 'lane:admin') {
                hasSangLabel = true;
            } else if (lower === 'lane:core') {
                hasCoreLabel = true;
            }
        }

        if (hasSangLabel && hasCoreLabel) {
            return {
                lane: null,
                error: `Lane detection error: Conflicting lane labels present on PR (${labelsInput}).`
            };
        }

        if (authorLane === 'sang' && hasCoreLabel) {
            return {
                lane: null,
                error: `Lane detection error: Author "${authorInput}" belongs to Sang lane but PR has conflicting label "lane:core".`
            };
        }

        if (authorLane === 'core' && hasSangLabel) {
            return {
                lane: null,
                error: `Lane detection error: Author "${authorInput}" belongs to Core lane but PR has conflicting Sang lane label.`
            };
        }
    }

    return { lane: authorLane, error: null };
}

export function resolveLane(identifier) {
    if (!identifier || typeof identifier !== 'string' || identifier.trim() === '') {
        return { lane: null, error: 'Lane detection error: author or lane identifier is required (must not be empty)' };
    }

    const tokens = identifier.trim().split(/[\s,]+/).filter(Boolean);
    const SANG_TOKENS = new Set(['sangvuxx', 'sangvux', 'lane:cms-super-admin', 'lane:admin']);
    const CORE_TOKENS = new Set(['dothuongton', 'core', 'antigravity', 'codex', 'lane:core', 'github-actions[bot]']);

    let hasSang = false;
    let hasCore = false;

    for (const token of tokens) {
        const lower = token.toLowerCase();
        if (SANG_TOKENS.has(lower)) {
            hasSang = true;
        } else if (CORE_TOKENS.has(lower)) {
            hasCore = true;
        }
    }

    if (hasSang && hasCore) {
        return { lane: null, error: `Lane detection error: Conflicting lane metadata in "${identifier}". PR cannot belong to both Core and Sang lanes.` };
    }

    if (hasSang) return { lane: 'sang', error: null };
    if (hasCore) return { lane: 'core', error: null };

    return {
        lane: null,
        error: `Lane detection error: Unknown or unauthorized lane identifier "${identifier}". Must map strictly to Sang (SangVuxx) or Core (dothuongton/codex/antigravity).`
    };
}

export function validateAuthorFiles(author, files, labels = '') {
    const violations = [];
    const laneResult = (typeof author === 'string' && labels)
        ? resolveLaneFromAuthorAndLabels(author, labels)
        : resolveLane(author);

    if (laneResult.error) {
        violations.push(laneResult.error);
        return {
            valid: false,
            violations
        };
    }

    const { lane } = laneResult;

    for (const file of files) {
        const normalized = file.replace(/\\/g, '/');

        if (lane === 'sang') {
            // Rules for Sang: only allowed to touch CMS Super Admin files
            if (SANG_BLOCKED_EXACT.includes(normalized)) {
                violations.push(`Sang lane violation: Explicitly forbidden core file: ${normalized}`);
                continue;
            }

            const allowed = isSangPath(normalized);
            if (!allowed) {
                violations.push(`Sang lane violation: File outside CMS Super Admin allowlist: ${normalized}`);
            }
        } else {
            // Rules for Core / other authors: MUST NOT touch Sang's lane files
            if (isSangPath(normalized)) {
                violations.push(`Core lane violation: Core cannot touch Super Admin lane file: ${normalized}`);
            }
        }
    }

    return {
        valid: violations.length === 0,
        violations
    };
}

export function parseChangedFilesFromDiffStatus(statusOutput) {
    const files = new Set();
    const lines = statusOutput.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        const parts = line.split(/\t+/);
        if (parts.length >= 2) {
            const code = parts[0];
            if (code.startsWith('R') || code.startsWith('C')) {
                // Renamed or copied: validate both source and destination
                if (parts[1]) files.add(parts[1]);
                if (parts[2]) files.add(parts[2]);
            } else {
                if (parts[1]) files.add(parts[1]);
            }
        }
    }
    return Array.from(files);
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
    let baseRef = process.argv[2] || 'origin/main';
    // Priority: Explicit argv[3] > PR_AUTHOR > GITHUB_ACTOR (PR_LABELS is used for compatibility check only)
    const author = process.argv[3] || process.env.PR_AUTHOR || process.env.GITHUB_ACTOR || '';
    const labels = process.env.PR_LABELS || '';

    // If baseRef defaulted to origin/main but cannot be resolved (e.g. shallow clone), fall back gracefully
    try {
        execSync(`git rev-parse --verify ${baseRef}`, { stdio: 'ignore' });
    } catch {
        if (!process.argv[2]) {
            try {
                execSync('git rev-parse --verify HEAD~1', { stdio: 'ignore' });
                baseRef = 'HEAD~1';
            } catch {
                baseRef = 'HEAD';
            }
        }
    }

    try {
        const diffStatusRaw = execSync(`git diff --name-status ${baseRef}...HEAD`, { encoding: 'utf-8' });
        const changedFiles = parseChangedFilesFromDiffStatus(diffStatusRaw);

        const boundaryCheck = validateAuthorFiles(author, changedFiles, labels);
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
