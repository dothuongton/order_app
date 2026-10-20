# Đánh giá SuperAdmin toàn diện Muse — 20/10/2026

## Baseline và giới hạn chứng cứ

Fetch origin hoàn tất; `origin/main = aceb9066b6819e28232517bcc402d0390d80fff5`, trùng baseline báo cáo Muse. Đọc code từ origin/main, không sửa checkout Core. PR92 của Sang (#18, head b43c1c2fde5eb5cbda24652c7a7fdc2bbdfe298e) đang sửa CreateShopModal; PR78 Core (#57) đang mở. Không review/merge hai PR trong task này. Working tree primary sạch lúc kiểm tra; không có nghĩa được đổi nhánh hay chiếm file.

Nguồn Muse giữ nguyên byte trong MUSE_SUPERADMIN_FULL_PROPOSAL_2026-10-20.md. Câu trích yêu cầu trong tài liệu là thông tin do Muse báo lại, không tự phê duyệt thêm quyền/mutation tài chính. Không đăng nhập, thử credential hay pentest production. Không chạy lại test suite runtime vì chỉ phân tích code/lập issue/docs; không tuyên bố nghiệm thu tính năng hoặc an toàn toàn hệ thống.

## Kết luận / phương án

Giữ React/Vite/Express/pg/PostgreSQL/Socket.IO và DB dùng chung, không rewrite. Khả năng hỗ trợ quán là hướng phù hợp nhưng triển khai theo capability từng phần: hotfix bảo mật và dữ liệu thật → audit/read-only workspace → hỗ trợ bàn/menu/membership/đơn/CMS sau pilot và sau Core contract. Không sao chép business logic hay impersonation. Mỗi capability phải mang actor platform thật, shop scope và resource scope, reason khi can thiệp, audit, transaction/revision/idempotency phù hợp và events sau commit. Không xây tất cả CRUD trước khi có quán dùng pilot.

### Phát hiện đã đối chiếu

- P01/P02: default credential frontend ở AdminLogin/main và CreateShopModal/main còn. P02 đang có PR92, chưa merged/accepted; không tạo hotfix thứ hai. Credential UI không chứng minh default password hiện đăng nhập production được. Xếp ưu tiên xử lý trước go-live, không khẳng định đã takeover.
- P03: AdminService.createShop sinh `qr-${slug}-b${i}` có thể dự đoán; #41 core generator → #89 Sang adapter. Không rotate QR hiện hữu âm thầm.
- P04: createShop ON CONFLICT no-op giữ password cũ rồi gán owner; #82 xử lý explicit new/link. Không reset password người có sẵn.
- P05: auth routes hiện login/me/logout, chưa có đổi password; #37 core/#48 UI. Must-change/generate temporary secret không thể hoàn thành chỉ bằng sửa form #18.
- P06: admin/CMS có writer audit, thiếu coverage auth/nhạy cảm và contract thống nhất; số 5/41 chỉ là snapshot/source count của Muse, không chứng minh đủ/thiếu toàn bộ hành vi. Audit hiện tenant_id NOT NULL, auth global event cần migration contract core, không fake tenant.
- P07: AdminLogin/App còn localStorage admin_token và server hỗ trợ cookie; #40 core/#48 admin client. Không giao sửa AdminLogin/App/shared client cho Sang.
- P08: handleAdminError generic500 đã masked, app còn envelope500 masking; không chứng minh raw err.message500 leakage như báo cáo. Đưa full-app fault regression vào #36/#93, không tạo bug leak đã xác nhận.
- P09: admin router có authenticateSuperAdmin, chưa gắn limiter mutation riêng; core #36 cung cấp guard, Sang #93 gắn sau auth. Không suy rằng mọi request đã có throttling.
- Admin detail trả `metrics.*`, drawer dùng flat fields; #17 đã có issue. Audit SELECT thiếu al.user_id dù mapper đọc; #84 đã có issue. List/audit API đã bounded pagination/filter, không xây lại.
- Nhiều thao tác tables/menu đang SQL inline trong staff.routes; chưa thể đáp ứng nguyên tắc dùng chung bằng cách gọi service có sẵn cho tất cả. Core tách capability + regression giữ parity trước; Sang chỉ adapter.
- CMS saveDraft có upsert và updated_at nhưng chưa expected revision; publish có tenant lock. Không gọi đó là đầy đủ optimistic locking hoặc chống mất cập nhật. Core phải chốt expectedRevision/atomic compare, version/publish ordering trước #98.

## Ma trận toàn bộ đề xuất SA

| Muse | Phương án / owner / issue |
|---|---|
| SA01 | Core #36 sửa AdminLogin; không Sang |
| SA02 | Sang #18/PR92 bỏ default; temporary credential/force-change chờ Core #37, không cấp mật khẩu chung |
| SA03 | Core #41 generator → Sang #89 createShop; bàn hiện hữu #94 có gate riêng |
| SA04 | Sang #82 onboarding explicit mode/policy #6; không silently link/reset |
| SA05 | Core #37/#38 → Sang #48; không sửa auth/schema từ lane CMS |
| SA06 | Core #83 helper/schema/auth/staff/CMS events → Sang #93 admin writers; không double events |
| SA07 | Sang #84 reader/filter/diff/time → #99 export riêng có giới hạn/redaction/CSV protection |
| SA08 | Sang #46 deep API → #47 read workspace; #87 navigation, #84 audit, từng lát dữ liệu thật |
| SA09 | Sang #17 metrics contract regression; không tạo duplicate |
| SA10 | Sang #96 membership adapter sau core policy; #82 vẫn riêng onboarding. Global lock/reset/owner transfer/support role chưa tự bật |
| SA11 | Sang #94 table support sau Core capability; #89 không trùng QR bootstrap |
| SA12 | Sang #95 menu/promotion support sau Core shared commands; giữ snapshot lịch sử |
| SA13 | Sang #97 phi tài chính có reason/quantity/concurrency; close-without-charge cần capability riêng được duyệt |
| SA14 | Sang #98 draft/publish/rollback sau Core revision/actor/events; template CRUD mới chưa triển khai |
| SA15 | Bill/settlement đọc qua #46/#47; confirm/reversal/refund/ledger mới chờ #53 và quyết định nghiệp vụ, không đưa vào Sang support |
| SA16 | #81 dọn placeholder; settings identity #48 sau Core, cấu hình nền tảng mới chưa tự dựng |
| SA17 | #81 bỏ fake permission success; quyền support/RBAC core #38 cần policy, không UI-only matrix |
| SA18 | #91 sau Core #45 + reader #46; không blocker pilot |
| SA19 | #88 admin component/accessibility; #86 list; #84 relative time. Shared tokens/global CSS qua Core #6, không refactor ba portal |
| SA20 | Core #36 guard/error, #40 cookie rollout → Sang #93 route integration/#48 client; không mở lại bug500 unproven |

## Logging, dữ liệu và đồng bộ

Giữ audit điều tra + operational/domain events + immutable bills phân biệt; không log raw body/secret để đạt mục tiêu “mọi mutation có log”. Coverage dựa test successful/failed/rolled-back/retried behavior, không grep helper toàn endpoint. Helper transaction-aware; audit DB append-only cần thử với app role/backup/migration path, không chỉ thêm UI badge. IP/user-agent/retention cần minimization/policy; không tự chốt 12 tháng hoặc purge.

Không tạo DB/cache bản sao cho admin. Mutation về business service duy nhất, actor không phải membership giả. Version check phải nằm cùng UPDATE/transaction (không chỉ preflight GET); cả Staff và Admin cùng dùng. Event phát sau commit, đúng room, không leak cross tenant và không broadcast trùng; reconnect/refetch vẫn cần test. Không sửa tiền lịch sử, không hard-delete ledger/bills; mọi mở rộng refund/reversal có thiết kế riêng.

## Ownership / kế hoạch thực thi

Queue #85 là nguồn hiện hành; Sang giữ PR92/#18 trước. Một issue active mỗi lane, working directory riêng; ghi nhận file giữ trước code. Không mở đồng thời các nhánh chỉnh AdminDashboard/AdminService/admin.routes/api/types/admin.api.test.ts. Issue umbrella #15/#16/#19/#85 không cấp thêm quyền nhận mọi child cùng lúc.

Các issue mới assign Sang: #93 security/audit integration, #94 tables, #95 menu/promotion, #96 membership, #97 operational phi tài chính, #98 CMS, #99 audit export. #94→#98 được serial bằng dependency; #99 sau #84; #93 từng phần chờ coreSHA. Core không được sửa admin để “giúp nhanh”, Sang không tách core service/migration.

Native dependency chỉ là một phần: #6 cần capability name/policy/DTO/errors/core SHA đã merge + test evidence trước implementation. Không bắt đóng toàn bộ core umbrella để tránh dependency vòng. Sau mỗi PR merge, cập nhật main, tạo nhánh issue kế tiếp; không force/reset/stash công việc người khác.

Main protected=false tại lần kiểm tra; quy trình/CI không phải khóa kỹ thuật. #5 vẫn theo dõi required review/checks/branch protection. Không tự đổi settings trong task này và không hứa đảm bảo conflict bằng0 nếu người tham gia bỏ quy trình.

## Các quyết định chưa áp dụng

Impersonation, quyền support, retention/PII audit, hard-delete/rotation QR, owner transfer/global reset, màu thương hiệu chung, template engine và user-directory toàn nền tảng cần scope/policy riêng. Có thể làm reader/bugfix độc lập, không cần dừng toàn bộ queue để đợi mọi quyết định này. Không tự phê duyệt payment/refund do proposal dùng từ “toàn quyền”.
