# Lệnh Antigravity — role dothuongton/Core

Bạn triển khai thử nghiệm trong dothuongton/order_app theo tài liệu đã chuẩn bị. Không viết lại hệ thống hoặc nhập framework từ Gaeru.

## Nguồn sự thật
- Nhánh tích hợp `codex/gaeru-flow-experiment`, baseline main92f81cb83a961dd74caffb98a6316fd73b3ac147.
- Đọc AGENTS.md, skill Karpathy, docs/experiments/gaeru-flows/README.md, SOURCE_REVIEW.md và ADR-0002. SOURCE_SPEC.md là đầu vào để đối chiếu; README/ADR ghi các thích ứng và phạm vi thực hiện.
- Nguồn học hỏi dothuongton/gaeru-soft-source@3f36c9b4733ed9e48a934935ee0d95c55a54c489; không coi276tests SQLite/SSR của nguồn là chứng nhận Postgres hoặc browser thật.

## Bắt đầu an toàn
1. Dùng checkout mới riêng, không chuyển/reset/stash worktree đang làm PR113/#100/#71. Fetch origin; checkout đúng nhánh tích hợp, kiểm head/diff/working tree. Không lấy các PR113/CMS105–112 chưa nghiệm thu làm baseline.
2. Kiểm quyền giữ file/task Core đang chạy qua#2/#6. Chỉ một task coding Core hoạt động; nếu task cũ còn chạy, chờ bàn giao và làm inventory/tài liệu trước, không mở agent/nhánh coding chồng. Không tự dừng tiến trình của người khác.
3. Tạo DB sandbox riêng và profile server approved_single_device như README. Không dùng DATABASE_URL/.env, VAPID/subscription/cookie/token production, không đổi Render order-app hoặc auto-deploy/main.

## Phạm vi lượt đầu: P0 rồi P1
- Trước code, ghi inventory schema/API/permission/lock order, error contract, migration/rollback, danh sách file owner và ma trận test vào docs/experiments/gaeru-flows/IMPLEMENTATION_PLAN.md. Tái sử dụng session/idempotency/pricing/snapshot/auth/realtime đang có.
- P1: public menu tối thiểu; requestId/tên khách/cookie device hash; pending15phút; một pending/open trên bàn; Staff approve/reject/withdraw/expire; claim đúng một browser và menu-only cho browser khác; reload/multitab/release→Staff duyệt replacement; API/socket không bị legacyjoin/token bypass.
- Dùng PostgreSQL transaction/constraints/locks; recheck tenant/permission/state trước commit; event chỉ sau commit. Cookie HttpOnly/Secure/SameSite/CSRF, no raw secret trong JS/log. Không hardcode tin oai-authenticated-* headers.
- Tạo feature branch `codex/gaeru-01-request-claim` từ nhánh tích hợp đã kiểm; PR base `codex/gaeru-flow-experiment`. Không tự merge/deploy hoặc push runtime trực tiếp lên nhánh tích hợp/main.
- Không làm finance mới, chuyển bàn, RBAC10quyền, settings designer hoặc admin CMS trong P1. Phase sau đi đúng README và từng PR sau review; không tự chốt policy tiền.

## Kiểm chứng và bàn giao
- Suite baseline + hai builds + boundary/diff; EX01–04/08–09/13–15 liên quan trên DB/HTTP/browser thử nghiệm; concurrency thật bằng hai connection và barrier. Test hai browser, expiry/approve race, legacy-token bypass, CSRF, claim loss/reassign, close/reopen và late response.
- Không sửa pricing/partial quantities/promotion, không sửa receipts cũ khi đổi vị trí. Nếu request trước chưa được nhận, không tin giá client cũ; replay đã commit mới trả snapshot cũ.
- Bàn giao SHA, diff/file ownership, test đã chạy/chưa chạy, ảnh UI, config/migration/rollback và residual risks. Không ghi tính năng hoàn tất bằng số lượng tests hoặc ảnh viewport. Ghi state Planned/InProgress/Tested chính xác.
- Dừng sau bàn giao P1 để Codex review; chưa nhận P2 hoặc merge bất kỳ nhánh nào. Production tiếp tục theo ADR-0001.
