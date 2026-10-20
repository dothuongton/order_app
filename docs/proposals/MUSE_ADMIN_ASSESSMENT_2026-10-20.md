# Đối soát báo cáo admin Muse — 20/10/2026

Nguồn được lưu nguyên văn: MUSE_ADMIN_REVIEW_2026-10-20.md. SHA256 `f17ad865dc0ba33fbd4a6651152d4077e7fc1b444b18d5ced4f1ca13c0754fee`.

Baseline: mainaceb906 sauPR79; backendRender /health trảaceb906. Không dùng working tree core đang sửa#57 để chạy acceptance. Codex xuất snapshotmain ra thư mục riêng, tái sử dụng dependency hiện có; 24testAdminCMS vàbackend/frontendbuildđạt, không khẳng định fresh-install/full-backend-suite/browserE2E đã chạy trong lượt này. DB tạo/xóa riêng qr_order_test_*, không ghi production hoặc đăng nhập bằng mật khẩu mẫu.

## Đánh giá

Báo cáo hữu ích làm checklist trướcgoLive nhưng cần hiệu chỉnh theo phiên bản. A-02 đã sửa PR54/55; API list/detail/audit đã có boundedpagination/filter, routes/app che lỗi500. Current limit100 là đúngcontract; không tự suy deploymentdrift từ clone cũ. UI phân trang chỉ xuất hiện khi totalPages>1 nên cầnfixture nhiềutrang. Không chứng minh mậtkhẩumẫucònvalid hoặc hệthốngđãbịxâmnhập.

Code vẫn có defaultcredential login/form, QRcreateShop đoánđược, roles/mockcounts/growth và fake-save toast, mismatch detailmetrics. Runtimelocal xácnhận existingemailreuse khôngresetpassword (đúng an toàn) nhưng initializationpasswordkhônghiệulực vàownerlinkâmthầm cầncontract/UIrõ. Detailmetrics5 nhưngdrawer0; auditactorEmailcó, userIdthiếuSQLSELECT. Source/event/filterdetails có thểkhácdatasetlegacy; không bịa/backfill lịch sử.

## Mapping công việc

| Nguồn Muse | Xử lý |
|---|---|
| A-01 | #36 core, không sửa AdminLogin ở lane Sang |
| A-02 | Reset-on-boot đã sửa; #37/#38 identity mới vẫn kế hoạch |
| A-03 | #41 core generator → #16 Sang adapter |
| A-04, C-2 | #82 explicit account linking/ownership policy |
| A-05, B-06, C-10 | #83 core events → #84 Sang reader/UI |
| A-06 | 500/limit drift đã stale; tiếp tục regression ở #16/#19 |
| B-01, B-03, B-04 | #17 bug metrics/pagination; #47 read-only UX/deep-link |
| B-02, B-05, B-08 | #81 bỏ mock/false success; audit time ở #84 |
| B-07 | #45/#46/#47 analytics theo giai đoạn, chưa blockerpilot |
| B-09 | #18 default password form; không sửa core login |
| C-3/6/7/8 | #37/#38/#48 identity/recovery/roles, chưa tự gán owner/reset/impersonate |
| C-4/11/12/13/14/15 | BacklogV4 #50: impersonation/settings/templates/notifications/plans/ops, không tự triển khai trướcpilot |


Epic https://github.com/dothuongton/order_app/issues/80. Bản main cóbug sau merge không đồngnghĩa phải tựrevert toànPR; sửa nhỏ theoevidence vàtest. #16/#17/#18/#19 đượcmởlại chohậukiểm, #36/#37/#38/#41/#46/#47/#48/#6/#5 đượcbổsung; không tạo lại mọi chức năng đềxuất. Bảo toàn working changes#57 và ownershipSang/core. Không chứngnhận CMSđãan toàn/hoàn tất toàn bộV4.

## Chỉ thị Antigravity

Tách lane thực hiện: core tiếp tục hoàn thiện#57, không chèn CMS/auth vàoPR78; nhận#36 rồi#41/auditcoretheo lịch mộtissuecoremỗi lần. Sang bắt đầu#18(defaultpasswordform),#17(metrics),issueUItruth,ownercontract,auditreader theo dependency. AdminLogin/auth/DB/shared/CI do core, SuperAdmin namespace do Sang. Không nângrole demo hoặcresetpasswordexistinguser đểlàmUIđẹp. Mỗi PRnhỏ, tests/API/browserassertions đúngluồng, xuấtSHA/giớihạn; Codexreview rồiownermerge. Không tựmerge/deploy/đổi credential/QR/quán production.
