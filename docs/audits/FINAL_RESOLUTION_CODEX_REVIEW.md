# Final Resolution Report — Codex Re-Review Resolutions for PR #55

> **Repository:** `dothuongton/order_app`  
> **Target Branch:** `main` (commit `cb6eba3`)  
> **Work Branch:** `codex/core-audit-fixes`  
> **Date:** 2026-10-20  
> **Status:** All review items resolved, tested, and verified.

---

## 1. Conflict Resolution with `origin/main`

- **Branch Integration:** Merged `origin/main` (`cb6eba3`) into `codex/core-audit-fixes` without using blind `--ours`/`--theirs`.
- **Files Reconciled:**
  1. `backend/src/db/auto-migrate.ts`: Preserved PR #54 safe schema check while retaining `schema_migrations`, `revoked_staff_tokens`, and `item_option_groups`.
  2. `backend/src/db/schema.sql`: Retained tables `schema_migrations` and `revoked_staff_tokens` with index; preserved removal of hardcoded superadmin seed hash.
  3. `backend/src/db/seed.ts`: Kept safe non-destructive default `export async function seed(force: boolean = process.env.NODE_ENV === 'test')` from main.
  4. `backend/src/tests/core-audit/sec01_superadmin_persist.test.ts`: Combined non-recreation test with `try...finally` block to test both `migrate()` and `ensureSchemaOnBoot()`.

---

## 2. Promotion Selection Policy & Cap Handling Fix (#28)

- **Issues Addressed:**
  1. *Cancelled round poison:* `getBillSummary` previously scanned `partsRes.rows` including cancelled parts (`status = 'CANCELLED'`). When Round 1 with disabled Promo A was cancelled and Round 2 with Promo B was served, quote chose Promo A (0đ discount) while settlement chose Promo B (20k discount), triggering infinite 409 `PRICE_CHANGED`.
  2. *Multiple attached promotions with exhausted cap:* When a table had Round 1 with Promo A (which was subsequently exhausted by another table) and Round 2 with Promo B (available), `getBillSummary` skipped exhausted Promo A and selected Promo B (quoting 100k). However, settlement stopped at the first attached promo (Promo A), saw it was exhausted, and threw 409 `PROMOTION_EXHAUSTED` prematurely without checking subsequent available attached promotions.
- **Unified Resolution:**
  - In both `getBillSummary` and `confirmPaymentAndCloseSession`:
    - Only non-cancelled active item parts (`status IN ('SERVED', 'ACCEPTED')`) provide attached promotion IDs.
    - Query ordering is deterministic: `ORDER BY o.order_number ASC, oi.created_at ASC, oi.id ASC`.
    - Both quote and settlement iterate through `attachedPromoIds` looking for an active, non-exhausted promotion that meets `min_order_amount`.
    - If Promo A is exhausted, settlement records that an attached promo was exhausted (`hadExhaustedAttachedPromo`), but continues checking to see if a subsequent attached promo (Promo B) is available.
    - If Promo B is available, both quote and settlement select Promo B, claim it atomically, and settle cleanly.
    - Only if *no* attached promo is eligible and `hadExhaustedAttachedPromo` was found with `expectedAmount < rawServedTotal` does settlement throw 409 `PROMOTION_EXHAUSTED` to prompt quote reloading.
  - Concurrency safety (`expectedAmount`, `settlement_version`, atomic `UPDATE promotions ... RETURNING id`) is preserved.
  - Regression tests `BUS-02e` and `BUS-06c` in `bus02_to_06_finance_lifecycle.test.ts` verify both single-round cancelled promos and multi-round exhausted promo recovery.

---

## 3. Boundary Gate & Author Identity Hardening (#29)

- **Issues Addressed:**
  1. *Label replacing author identity:* CLI previously used `PR_LABELS || PR_AUTHOR`, allowing `PR_AUTHOR=SangVuxx PR_LABELS=lane:core` to pass.
  2. *Normal labels breaking author validation:* Labels like `priority:P1` caused legitimate author `dothuongton` to be rejected as an unknown identifier.
  3. *Exact files assignment:* `frontend/src/api/admin.ts` and `frontend/src/types/admin.ts` were missing from Sang's exact allowlist.
- **Unified Resolution:**
  - `resolveLaneFromAuthorAndLabels(authorInput, labelsInput)` separates author identity from PR labels:
    - Author identity is validated strictly against recognized repository accounts (`SangVuxx` for Sang lane; `dothuongton`, `codex`, `antigravity` for Core lane). Unknown authors fail closed.
    - PR labels are parsed strictly for lane labels (`lane:cms-super-admin`, `lane:admin`, `lane:core`). Ordinary labels (`priority:P1`, `bug`, etc.) are ignored.
    - Author lane and label lane must be compatible. If `PR_AUTHOR=SangVuxx` has `PR_LABELS=lane:core`, or if conflicting lane labels exist, the check fails closed.
  - CLI entry point takes `author = process.argv[3] || process.env.PR_AUTHOR || process.env.GITHUB_ACTOR` and `labels = process.env.PR_LABELS`, matching CI workflow.
  - Added exact files `frontend/src/api/admin.ts` and `frontend/src/types/admin.ts` to `SANG_ALLOWED_EXACT`.
  - Documented policy protection: `scripts/check-file-boundaries.mjs` and `.github/workflows/**` are owned exclusively by Core and cannot be modified by Sang.
  - Added CLI test in `sec05_boundary_check.test.ts` executing the script via `process.env` without argv override (15 tests total).

---

## 4. Safe Seed Default Preservation (#25)

- `export async function seed(force: boolean = process.env.NODE_ENV === 'test')` in `backend/src/db/seed.ts` ensures that outside test environments, `force` defaults to `false`.
- If tenants and users exist, `seed()` preserves live operational data and returns immediately.
- Production seeding is blocked unless `ALLOW_PROD_SEED=true`.
- Verified in `sec01_superadmin_persist.test.ts`.

---

## 5. Archived Shop Recovery Contract (#6 / #19)

- For `archived` tenants, staff can access recovery routes to resolve lingering `PENDING` and `ACCEPTED` items and settle obligations:
  - Reads: `GET /staff/dashboard/snapshot`, `GET /staff/sessions/:id/bill-summary`
  - Item resolution: `POST /staff/sessions/:id/accept-all`, `POST /staff/sessions/:id/serve-all`, `POST /staff/order-items/:id/cancel`
  - Settlement: `POST /staff/sessions/:id/confirm-payment-and-close`, `POST /staff/sessions/:id/close-without-charge`
  - Table readiness: `POST /staff/tables/:id/mark-ready`
- All other operations (new sessions, table creation, menu modifications) remain blocked with `403 SHOP_ARCHIVED`.
- Verified in `sec06_tenant_status.test.ts`.

---

## 6. Test Suite and Build Summary

- **Backend Tests:** 15 test files, 134 tests — **100% PASSING**.
- **Backend Build:** `npm --prefix backend run build` — **PASSING** (0 errors).
- **Frontend Build:** `npm --prefix frontend run build` — **PASSING** (0 errors).
- **Boundary Gate CLI (via env):**
  - `PR_AUTHOR=SangVuxx PR_LABELS=lane:core node scripts/check-file-boundaries.mjs origin/main` -> **FAIL CLOSED** (exit 1).
  - `PR_AUTHOR=dothuongton PR_LABELS="priority:P1 bug" node scripts/check-file-boundaries.mjs origin/main` -> **PASS** (exit 0).
  - `PR_AUTHOR=unknown-user PR_LABELS=lane:core node scripts/check-file-boundaries.mjs origin/main` -> **FAIL CLOSED** (exit 1).
- **Independent Codex Reproducers:**
  - `backend/scripts/review-21a3fca-independent.mjs` — All 4 test cases PASS.
  - `backend/scripts/review-978b49f-independent.mjs` — All cases PASS:
    - `cancelled-first-promotion`: quote 40,000đ, pay 200 OK.
    - `multiple-attached-cap`: quote 100,000đ, pay 200 OK, sessionStatus: "CLOSED".
    - `archived-accepted-session`: dashboard 200, serve 200, settle 200 OK.
    - `lane-bypass`: coreOnSangFile valid: false, unknownOnCoreFile valid: false, sangOwnedApi valid: true.
    - `seed-default-preservation`: markerPreserved: true.
