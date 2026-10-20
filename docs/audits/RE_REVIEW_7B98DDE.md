# Codex review — 7b98dde (2026-10-20)

PR#55 chưa đủ điều kiện merge. Main cb6eba3; core 7b98dde0d4369f2c600f2da1d9f8362c745c8582.

Đã chạy độc lập backend 15files/134tests đạt, backend/frontendbuild đạt. Ca cap nhiều promotion cũ đạt quote100000/pay200/CLOSED; cancelled-first-promotion40000/pay200; archivedAPI200/200/200; seedmarkerpreserved. CLI tác giảSang+lane:core đã bị chặn, core+priority:P1 đã đi qua. Các kiểm thử HTTP không phải browserE2E.

## P1 #28 — Min order khác nhau vẫn làm quote/settlement lệch

Source guest.service.ts:934-947 chọn attachedpromo đầu tiên cònactive/cap, rồi kiểmminorder và không thử promo tiếp theo. Settlement staff.service.ts:736-765 duyệt tiếp khi minorder khôngđạt.

Tái hiện DBlocal: A giảm10k min0 →bàn gọi60k; tắtA, tạoB giảm20k min0 →bàn gọi thêm60k; sửaA active=true,min_order_amount=200000; cảhaiSERVED. Quote120000 (chọnA khôngđạtmin), settlement100000 (bỏA/chọnB). POST409PRICE_CHANGED, reload120000/retry409. Counterkhôngcầnrace. Cần chung điều kiện eligibility đầy đủ (active/time/cap/min/discount) và policyselection nhấtquán; thêm regressionmin/cap/disabled/expired/zero-benefit. Không tắtquotevalidation.

## P1 #29 — Fallback baseRef thu hẹp diff âm thầm

Script lines273-287 khi thiếu origin/main tự dùngHEAD~1/HEAD. Trên repoDBgitlocal3commit: baseline →core sửa admin namespace →commitdocs. ChạyCLI khôngbase, PR_AUTHOR=dothuongton, khôngoriginmain →exit0PASS vì chỉsoHEAD~1..HEAD, bỏqua vi phạm ởcommittrước. HEAD fallback códiff rỗng cũngPASS. Không dùng fallback làm certification boundary. Nếu không có trustedbase thì failclosed với hướngdẫnfetch; test tạo gitfixture với base rõ ràng, tách unitparser khỏi repo thật. CI fullfetch làđúng nhưng không hợp thức hóa fallbacktráinghĩa.

## Chú thích enforcement chưa đúng thực tế

Comment mới trong check-file-boundaries.mjs tuyên bố main có requiredreviews/checks và CODEOWNERS. Kiểmtra GitHub main/protection hiệnHTTP404 Branch not protected, repo khôngcóCODEOWNERS. Workflow vẫn chạyguard từPRcheckout, nên người sửa guard có thể tựbỏcheck; isolatedVM khôngngănđược. Phải sửa claim, dùng trustedpolicy/guard +requiredreview/checkthực tế có evidence; không tựbật settings trong review này.

Các quan sát/JSONtrongRE_REVIEW_7B98DDE_EVIDENCE.json. Tất cả testDBcôlập, khôngproductionwrite, khôngmerge/deploy, chưarestore drill. UXMuse táchdocs/backlog khỏiPR#55, không coi kếhoạchUX làđãcode.
