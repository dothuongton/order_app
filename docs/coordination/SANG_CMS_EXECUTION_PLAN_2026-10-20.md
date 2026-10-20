# Kế hoạch thực hiện CMS của Sang — 20/10/2026

Nguồn điều phối: https://github.com/dothuongton/order_app/issues/85; epic #80. Baseline mainaceb906, PR79 đã merge nhưng acceptance hậu kiểm còn mở. Không thay đổi công nghệ hoặc phạm vi MVP.

| Issue | Ưu tiên | Phần việc độc quyền | Điều kiện |
|---|---|---|---|
| #18 | P0 | Password form | Không cần chờ core để bỏ default |
| #17 | P1 | Metrics list/detail | Sau18; không làm list/nav |
| #81 | P1 | UI truth: roles/static/placeholder | Sau17 |
| #82 | P1 | Explicit new/link owner | Sau18 và policy#6 |
| #84 | P1 | Audit reader/UI | Sau82; core83 cung cấp event contract mới |
| #86 | P1 | List async/filter/sort/page | Sau các hotfix giữ Dashboard |
| #87 | P2 | Deep-link/Back/Forward | Sau list |
| #88 | P1 | Modal focus/mobile | Sau18/17/82, không cùng drawer84 |
| #89 | P1 | QR adapter | Chờ core41/SHA#6 |
| #90 | P1 | Lifecycle adapter | Chờ#6/cơ chế core/SHA |
| #19 | Gate | Nghiệm thu pilot | Theo dõi evidence, không viết tính năng |
| #46 | P2 | Deep API đọc | Saupilot/contract |
| #47 | P2 | Deep UI đọc | Sau46/SHA |
| #48 | Contract | Identity admin client | Chờcore identity; không mặc định chạy ngay |
| #91 | P2 later | Analytics thật | Chờ45/46 và saupilot |

## Quyền giữ tệp và bàn giao

Một issue active/lane; nhánh codex/sang-<issue-number>-<slug> từ main đã chứa PR trước. Ghi baseSHA/tệp giữ/contract lúc bắt đầu; headSHA/PR/test lúc bàn giao. Không mở các nhánh song song cùng sửa AdminDashboard, AdminService, api/admin.ts, types/admin.ts hoặc admin.api.test.ts. Một issue chỉ lấy scope hiện hành ở đầu mô tả; phần cũ được lưu để truy vết, không còn là lệnh thực hiện song song.

#15/#16/#19 là contract/umbrella/gate. #17 chỉ metrics; #18 chỉ password form; #81 chỉ UI truth; #82 chỉ owner onboarding; #84 chỉ audit reader. Scope mới đã được tách khỏi các mô tả rộng cũ. AdminLogin/App/shared auth/schema/CI/deps/global CSS và Guest/Staff vẫn core. Không sửa working tree core#57.

Nếu dependency chưa có SHA/API được duyệt, không tự viết helper/schema/auth của core. Chuyển sang task Sang độc lập theo queue, ghi trạng thái chờ rõ ràng. Không tạo dữ liệu production, reset credential/QR, tự merge/deploy hoặc xem CI xanh là Codex nghiệm thu. #45/46/analytics là giai đoạn sau, không bắt pilot đợi đủ mọi tính năng.

## Quan hệ GitHub đã gắn

Epic80 → queue85 → các issue86–91 qua native sub-issues. Blocked-by đã gắn:81 chờ17;82 chờ18;86 chờ17/81;87 chờ86;88 chờ18/82;91 chờ19/45/46.

Issue89 chờ helper/SHA của phần core41 và issue90 chờ contract/SHA của phần core6, không buộc đóng toàn bộ umbrella41/6 để tránh vòng phụ thuộc giữa integration hai lane. Những phần đã bàn giao có thể tích hợp theo SHA được Codex duyệt; không tự kết luận dependency sẵn sàng chỉ vì tài liệu đã viết.

Native dependencies là công cụ theo dõi, không thay branch protection, required review hoặc việc giữ tệp một issue/lane; cấu hình repository tiếp tục theo#5.


## Bổ sung đề xuất SuperAdmin toàn diện (main aceb906)

PR92/#18 đang giữ CreateShopModal; không tạo hotfix trùng hoặc đổi scope PR. Core PR78/#57 vẫn riêng. Nguồn và ma trận SA01–20: [assessment](../proposals/MUSE_SUPERADMIN_FULL_ASSESSMENT_2026-10-20.md), [Muse nguyên văn](../proposals/MUSE_SUPERADMIN_FULL_PROPOSAL_2026-10-20.md).

| Issue Sang mới | Phạm vi độc quyền | Gate |
|---|---|---|
| #93 | Admin guard/error + writer audit adapter | Core36/83 contract/SHA qua6; không auth/schema |
| #94 | Admin table support | Sau47/89/90/93 + core table capability |
| #95 | Admin menu/promotion support | Sau94 + core menu/promotion capability |
| #96 | Membership support | Sau95/82 + identity policy/capability |
| #97 | Operations phi tài chính | Sau96 + core actor/reason/quantity/idempotency |
| #98 | Draft/publish/rollback support | Sau97 + core revision/publish/event contract |
| #99 | Audit export bounded/CSV safe | Sau84 + export/redaction contract |

#94–98 và99 phase later, không cản pilot. #93 prelaunch từng phần đã đủ handoff; không đợi toàn bộ MFA/identity rollout. Mọi bước vẫn serial trong lane Sang, không dùng dependency khác nhau để mở nhiều branch cùng sửa connector files. Read-only46/47 hoàn tất từng lát sau hotfix; không fork nghiệp vụ mutation.

Core handoff trong#6 có tên capability, policy/actor/scope, DTO/errors, exact mergedSHA và test evidence. Không có nghĩa main đã có đủ safe service để gọi: table/menu còn inline routes, CMS saveDraft thiếu expected revision. Không tự bật global lock/reset, impersonation, support role, template CRUD/refund/reversal. #53 giữ paymentstate/ledger mới.
