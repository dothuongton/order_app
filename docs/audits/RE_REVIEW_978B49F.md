# Codex independent review — 978b49f (2026-10-20)

PR#55 head978b49f5fbbe8eeaa9d5a62b2cca82afdb3cdf3e; maincb6eba357d35f8e02a58965833b9a75091aa2a6e. Result: CHANGES REQUIRED. No merge/deploy.

## Confirmed fixes

- Main is an ancestor of reviewed head; GitHub now MERGEABLE. The four previous conflicts are resolved.
- Backend15files/131tests passed independently; backend/frontend builds passed.
- Independent local reproducer: cancelled-first-promotion quote40000/pay200; archived ACCEPTED dashboard200/serve200/settle200; branch-substring bypass blocked, Sang exact api/types paths allowed; defaultseed preserves marker outside test.
- Archived checks here exercise services/HTTP, not a browser or physical device. Do not describe them as browser E2E acceptance.

## P1 — Multiple attached promotions still cause permanent PROMOTION_EXHAUSTED (#28)

Source: backend/src/modules/staff/staff.service.ts:735-747 vs guest.service.ts:914-940.

Quote query excludes exhausted promotions before choosing an attached promotion. Settlement query includes exhausted promotions, chooses the first attached one, and throws without considering a later available promotion.

Actual local reproduction, through order and settlement services and HTTP:
1. Create active fixed10k promoA with maxRedemptions1; target table places60k order withA.
2. A second table orders/settles usingA, consuming its final redemption.
3. DisableA, create fixed20k promoB. Target table places second60k order withB; serve both rounds.
4. Re-enableA; it remains exhausted. (Normal CMS lifecycle state; counter was consumed by real settlement, not manually incremented.)
5. Quote returns100000 (120k minusB20k). Settlement returns409 PROMOTION_EXHAUSTED forA.
6. Reload still100000; retry still409; target session staysOPEN.

Required: identical eligibility and deterministic selection policy for quote and settlement, including cap status. Preserve atomic redemption at settlement to catch races after quoting, then re-quote to an actually settleable price/promotion after conflict. Do not remove expectedAmount/version checks or silently fall back to a different amount. Add regression for this case and existing single/multiple-promotion cap recovery.

## P1 — CLI still lets labels replace author identity (#29)

Source: scripts/check-file-boundaries.mjs:195-198; workflow supplies PR_AUTHOR and PR_LABELS separately but CLI uses PR_LABELS || PR_AUTHOR.

Executed actual CLI against current core diff:
- PR_AUTHOR=SangVuxx, PR_LABELS=lane:core =>exit0 PASS despite core-owned files.
- PR_AUTHOR=dothuongton, PR_LABELS=priority:P1 =>exit1 unknown identifier despite legitimate core author.

Passing pure resolveLane tests does not test the workflow entry point. Author must be parsed/validated independently against exact accounts. Filter lane labels separately; treat ordinary labels as irrelevant; reject conflicting identity/lane and unknown author even if a valid lane label exists. Cover CLI behavior without argv override; the reported explicit `... dothuongton` check bypasses this path. Protect boundary script/policy review itself; execution from PR checkout alone is not a trusted enforcement boundary.

## Checks and limits

Local logs /tmp/qr-review-978-tests.log, -backend.log, -frontend.log, -independent.log. Evidence RE_REVIEW_978B49F_EVIDENCE.json; reproducer backend/scripts/review-978b49f-independent.mjs runs from backend using node --import tsx scripts/review-978b49f-independent.mjs. Reproducer records values rather than asserting all acceptance conditions; inspect results. Local disposable qr_order_test_* databases only; no production writes or secret changes.

GitHub boundary/build-test checks are green on this SHA; Netlify preview passed; Vercel status failed (target remains Render). Green CI does not invalidate reproduced failures. #34 restore drill remains unverified; do not claim production drill/RPO/RTO completion.

Antigravity handoff: fix #28 eligibility mismatch and #29 workflow identity resolution sequentially on core branch, add regression tests at real HTTP/CLI entry points, rerun131tests/builds and all old/new reproduction cases. Keep main security changes and owner boundaries. Update PR#55 with final SHA/results/limits. No autonomous merge/deploy.
