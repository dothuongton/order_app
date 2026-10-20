# Codex independent re-review — 21a3fca (2026-10-20)

Reviewed origin/codex/core-audit-fixes@21a3fca77ac334aaab9d32de8d00a22079ab9789 against origin/main@cb6eba357d35f8e02a58965833b9a75091aa2a6e. PR #55: CHANGES REQUIRED. Main unchanged; no merge or deploy performed.

## Verified improvements

- Backend: 15 files / 125 tests passed, independently rerun.
- Backend and frontend builds passed.
- Existing review-muse harness rerun: 13 observations matched reported results, including UI displayed quote, cap recovery, partial cancellation, readiness missing008 and malformed JSON. This is a data-recording harness, not 13 assertion-based tests or browser E2E.
- No automatic production platform admin recreation observed in harness. Original V4 docs remain published on main.

## Findings requiring changes

### P1 — Quote and settlement select different promotions after cancelling the first round (#28)

Source: backend/src/modules/guest/guest.service.ts:918 vs backend/src/modules/staff/staff.service.ts:723.

Reproduced on isolated local database through real services and HTTP:
1. Active A: fixed10k. Place first60k order.
2. Disable A; create B fixed20k. Place second60k order.
3. Cancel all of first order; accept/serve second order.
4. getBillSummary chooses order-level A from cancelled rows and returns60000; settlement chooses item-level B from served rows and computes40000.
5. POST returns409 PRICE_CHANGED. Reload still60000; retry still409. Session cannot settle using the quote supplied by the application.

Use one explicit promotion-selection/calculation policy for quote and settlement, with identical eligible basket and deterministic selection. Cover cancelled-only promotion references, multiple promotion changes, cap reload, and final bill-line sums. Do not remove expectedAmount validation to make this pass.

### P1 — Lane identifier is still spoofable; legitimate Sang paths denied (#29)

Source: scripts/check-file-boundaries.mjs:19-27,44-45 and .github/workflows/ci.yml:27-30.

Reproduced validator results:
- dothuongton + branch codex/cms-super-admin-fix modifying admin service: valid=true (core crosses ownership).
- unknown-user + branch my-core-work modifying auth: valid=true (unknown accepted).
- SangVuxx editing frontend/src/api/admin.ts or frontend/src/types/admin.ts: valid=false, although issue#2 assigned these files to Sang.

Author/branch/label strings are concatenated and regex substrings decide authorization. Branch names must not confer identity. Resolve an explicit trusted lane/author mapping; reject unknown/ambiguous metadata; align both exact files and namespaces with ownership. Evaluate both rename source/destination and protect the guard itself rather than trusting a PR-modified guard.

Workflow also interpolates head.ref directly into shell source. A legal ref can include shell command substitution (git check-ref-format accepts codex/$(id)); pass event values through step env and treat them only as data. No injected command was executed during this review.

### P2 — Seed default regresses the safe main behavior (#25 / merge conflict)

Source: backend/src/db/seed.ts:6. Main defaults force to NODE_ENV==='test'; PR defaults true. On isolated DB in development, inserting a marker then calling seed() deletes that marker through TRUNCATE CASCADE. Test confirmed markerPreserved=false.

Keep main's safe default outside tests, preserve explicit seed(false), add preservation coverage. Production without ALLOW_PROD_SEED is still blocked and the seed CLI calls seed(false); this finding does not claim normal production startup currently wipes data.

### P2 — Archived-session recovery remains API-only and incomplete (#6/#19)

Source: backend/src/middleware/auth.ts:95-119. Archived tenant with an ACCEPTED item: dashboard403, serve-all403 SHOP_ARCHIVED, confirm400 UNRESOLVED_ITEMS. Existing all-served fixtures do not cover this. Even for served sessions, dashboard403 means the normal staff UI cannot navigate to the allowed settlement API.

Coordinate policy across lanes: prevent archive atomically with opening sessions, or provide a usable narrowly authorized recovery route/UI for preexisting obligations. Do not blanket-enable archived-shop mutations. Sang3d56ce4 adds an open-session guard, but it returns400 vs contract409 SHOP_HAS_OPEN_SESSIONS and its SELECT count/update is not coordinated with core openSession via a shared tenant lock. Sang branch was inspected only; combined race/UI verification remains outstanding.

## Merge and operations limits

PR#55 remains GitHub CONFLICTING. Independent git merge-tree confirms four conflicts: auto-migrate.ts, schema.sql, seed.ts and sec01_superadmin_persist.test.ts. Copying main docs in767b98f did not incorporate main ancestry/code. Resolve on the core branch, preserve main security changes, then retest the merged candidate.

#34 runbook is clearer, but no actual backup/restore/old-version compatibility drill was supplied or performed in this review. No measured RPO/RTO or production provider push/device validation is certified. No production database used; each reproduction creates and drops a qr_order_test_* database.

Evidence: RE_REVIEW_21A3FCA_EVIDENCE.json; reproducer backend/scripts/review-21a3fca-independent.mjs (run from backend with node --import tsx scripts/review-21a3fca-independent.mjs). It records observations, so check expected values rather than treating exit0 as acceptance. It also deliberately exercises destructive seed only inside the disposable test database. Logs of existing tests/builds/harness are in /tmp/qr-review-21a3-*.log.
