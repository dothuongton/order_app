# Final Resolution Report — Codex Re-Review Resolutions for PR #55

> **Repository:** `dothuongton/order_app`  
> **Target Branch:** `main` (commit `cb6eba3`)  
> **Work Branch:** `codex/core-audit-fixes`  
> **Date:** 2026-10-20  
> **Status:** All 5 review items resolved, tested, and verified.

---

## 1. Conflict Resolution with `origin/main`

- **Branch Integration:** Merged `origin/main` (`cb6eba3`) into `codex/core-audit-fixes` without using blind `--ours`/`--theirs`.
- **Files Reconciled:**
  1. `backend/src/db/auto-migrate.ts`: Preserved PR #54 safe schema check while retaining `schema_migrations`, `revoked_staff_tokens`, and `item_option_groups`.
  2. `backend/src/db/schema.sql`: Retained tables `schema_migrations` and `revoked_staff_tokens` with index; preserved removal of hardcoded superadmin seed hash.
  3. `backend/src/db/seed.ts`: Kept safe non-destructive default `export async function seed(force: boolean = process.env.NODE_ENV === 'test')` from main.
  4. `backend/src/tests/core-audit/sec01_superadmin_persist.test.ts`: Combined non-recreation test with `try...finally` block to test both `migrate()` and `ensureSchemaOnBoot()`.

---

## 2. Promotion Selection Policy & Stuck Settlement Fix (#28)

- **Root Cause:**
  - `getBillSummary` previously scanned `partsRes.rows.find(r => r.applied_promotion_id)` without filtering out cancelled parts (`oip.status = 'CANCELLED'`).
  - In a multi-round scenario where Round 1 (with Promo A) was cancelled and Round 2 (with Promo B) was served, `getBillSummary` picked Promo A (which was disabled), calculated 0đ discount, and quoted 60,000đ.
  - Settlement (`confirmPaymentAndCloseSession`) only queried `oip.status = 'SERVED'`, picked Promo B, calculated 20,000đ discount, and computed 40,000đ.
  - Comparing `expectedAmount: 60000` vs `finalAmount: 40000` threw 409 `PRICE_CHANGED`. Subsequent reloads re-quoted 60,000đ, causing an infinite 409 loop.
- **Resolution:**
  - Unified promotion basket across `getBillSummary` and `confirmPaymentAndCloseSession`: only non-cancelled active item parts (`status IN ('SERVED', 'ACCEPTED')`) can provide attached promotions.
  - Deterministic query ordering in `confirmPaymentAndCloseSession`: `ORDER BY o.order_number ASC, oi.created_at ASC, oi.id ASC`.
  - In `createOrder`, `existingPromoCheck` filters `oip.status != 'CANCELLED' AND p.is_active = true` so cancelled earlier rounds do not poison subsequent rounds.
  - Both quote and settlement now quote 40,000đ and settle at 40,000đ without 409 errors.
  - Added regression test `BUS-02e` in `bus02_to_06_finance_lifecycle.test.ts`.

---

## 3. Boundary Gate Hardening (#29)

- **Root Cause:**
  - Previous validator inspected branch name substrings (`/cms-super-admin/i`), allowing branch names to grant lane privileges.
  - Substring checks accepted ambiguous or unknown identifiers.
  - GitHub Actions interpolated PR metadata directly into bash script strings (`"${{ github.event.pull_request.head.ref }}"`).
  - `frontend/src/api/admin.ts` and `frontend/src/types/admin.ts` were missing from Sang's exact allowlist.
- **Resolution:**
  - `scripts/check-file-boundaries.mjs` now strictly resolves explicit lane tokens (`SangVuxx`, `lane:cms-super-admin`, `dothuongton`, `lane:core`, `codex`, `antigravity`).
  - Unknown or conflicting metadata (e.g. `SangVuxx dothuongton` or branch names) fails closed with an error.
  - Added `frontend/src/api/admin.ts` and `frontend/src/types/admin.ts` to `SANG_ALLOWED_EXACT`.
  - In `.github/workflows/ci.yml`, PR metadata is passed via step `env:` variables without shell string interpolation.
  - Handled rename (source and destination) and delete operations via `parseChangedFilesFromDiffStatus`.
  - Updated `sec05_boundary_check.test.ts` to 13 passing test cases.

---

## 4. Safe Seed Default Preservation (#25)

- **Resolution:**
  - `export async function seed(force: boolean = process.env.NODE_ENV === 'test')` in `backend/src/db/seed.ts` ensures that outside test environments, `force` defaults to `false`.
  - If tenants and users exist, `seed()` returns immediately and does not wipe operational data.
  - Production seeding is blocked unless `ALLOW_PROD_SEED=true`.
  - Added automated test in `sec01_superadmin_persist.test.ts` verifying that calling default `seed()` outside test environments preserves existing tenant markers.

---

## 5. Archived Shop Recovery Contract (#6 / #19)

- **Resolution:**
  - When a tenant is `archived`, staff access to recovery operations is maintained for existing open sessions:
    - Reads: `GET /staff/dashboard/snapshot`, `GET /staff/sessions/:id/bill-summary`
    - Item resolution: `POST /staff/sessions/:id/accept-all`, `POST /staff/sessions/:id/serve-all`, `POST /staff/order-items/:id/cancel`
    - Settlement: `POST /staff/sessions/:id/confirm-payment-and-close`, `POST /staff/sessions/:id/close-without-charge`
    - Table readiness: `POST /staff/tables/:id/mark-ready`
  - All new session creation, menu editing, table creation, and category modifications remain strictly blocked (`403 SHOP_ARCHIVED`).
  - Added end-to-end recovery test in `sec06_tenant_status.test.ts` testing an archived shop with `PENDING` and `ACCEPTED` items being resolved, quoted, settled, and closed.

---

## 6. Test Suite and Build Summary

- **Backend Tests:** 15 test files, 131 tests — 100% PASSING.
- **Backend Build:** `npm --prefix backend run build` — PASSING (0 errors).
- **Frontend Build:** `npm --prefix frontend run build` — PASSING (0 errors).
- **Boundary Check CLI:** `node scripts/check-file-boundaries.mjs origin/main dothuongton` — PASSING.
- **Independent Codex Reproducer:** `node --import tsx backend/scripts/review-21a3fca-independent.mjs` — All 4 test cases output desired results:
  - `cancelled-first-promotion`: quote 40,000đ, pay 200 OK.
  - `archived-accepted-session`: dashboard 200, serve 200, settle 200 OK.
  - `lane-bypass`: coreOnSangFile valid: false, unknownOnCoreFile valid: false, sangOwnedApi valid: true.
  - `seed-default-preservation`: markerPreserved: true.
