# Quy tắc làm việc trong dothuongton/order_app

## Thực thi khi nhận lệnh ngắn

Đọc [quy trình agent](docs/coordination/AGENT_WORKFLOW.md) trước mỗi lần nhận việc. Lệnh chỉ có số issue/PR hoặc chuỗi `#87/PR #110 → #88/PR #111 → #90/PR #112` là yêu cầu tra GitHub và thực hiện theo quy trình này; không cần chủ dự án lặp lại quy tắc pull, lane, review hoặc bàn giao. Chuỗi là thứ tự, không là quyền code đồng thời hoặc tự merge.

Lấy role từ chỉ định của chủ dự án và assignee/ownership đã chốt; tài khoản CLI đang đăng nhập hoặc tên nhánh không tự đổi role. Core theo đầu [#2](https://github.com/dothuongton/order_app/issues/2), Sang theo đầu [#85](https://github.com/dothuongton/order_app/issues/85); contract dùng [#6](https://github.com/dothuongton/order_app/issues/6). Trước sửa phải kiểm tra state/head/review/dependency mới trên GitHub. Issue đã hoàn tất không làm lại; umbrella/verification không tự biến thành nhánh code. Mỗi lane một nhiệm vụ coding, chuyển bước khi PR trước đã merge và điều kiện kế tiếp đã đủ.

## Đọc trước khi làm

1. Yêu cầu trực tiếp mới nhất của chủ dự án, ADR docs/architecture/decisions/0001-current-stack-table-order-mvp.md và issue được giao.
2. docs/specs/README.md → GAERU_SOFT_V4_MASTER.md → GAERU_V4_TABLE_ORDER_ADDENDUM.md.
3. docs/specs/V4_IMPLEMENTATION_MAP.md, issue#2 về ownership và contract#6.
4. .agents/skills/karpathy-guidelines/SKILL.md (nguồn/commit trong UPSTREAM.md) khi viết, review hoặc refactor code.

Đã chốt MVP order tại bàn trên React/Vite/Express/pg hiện tại; chưa mở rộng online/payment integration hoặc đổi framework. Giữ nhiều thiết bị hiện có, chưa tự bật claim độc quyền. Spec V4 là đích phát triển toàn hệ thống theo giai đoạn. README QRv1.2 mô tả code hiện tại; báo cáo review không thay spec. Đợt sửa core không được gọi là hoàn thành V4. Đặc tả gốc lưu nguyên văn; proposal Muse hoặc nhận định agent không tự thay đổi nó. Nếu có mâu thuẫn spec/issue/hiện trạng, nêu khác biệt và ghi ADR/issue cụ thể; không tự quyết chính sách tiền/quyền. Làm phần độc lập đã rõ trong phạm vi chủ dự án giao.

## Ngoại lệ chỉ cho nhánh thử nghiệm Gaeru

Khi làm `codex/gaeru-flow-experiment` hoặc feature branch `codex/gaeru-*` có PR base nhánh thử nghiệm, đọc `docs/experiments/gaeru-flows/README.md` và ADR-0002. Yêu cầu mới21/10/2026 cho phép thử Staff-approved single-device claim trong sandbox riêng, không thay ADR-0001 của main. Một task Core coding mỗi lúc, ownership Sang/Core và review vẫn giữ nguyên. Không tự merge vào main, deploy Render production hoặc dùng DB/secret production. Nhánh hiện khởi tạo tài liệu; chưa có claim/payment tính năng mới.

## Ownership chống chồng chéo

- SangVuxx: backend/src/modules/admin/**; frontend/src/pages/admin/** TRỪ AdminLogin.tsx; namespace admin mới trong components/hooks/api/types, tests/admin-cms và docs/admin-cms theo issue#2.
- dothuongton/core: mọi phần còn lại, gồm auth/AdminLogin, DB/schema/migrations, guest/staff/pricing/reports, socket/push, App/shared API/styles/config/deps/CI/deploy.
- Một tệp một owner; mỗi lane một issue tại một thời điểm; working directory riêng. Core không sửa admin của Sang, Sang không sửa shared để mở rộng CMS. Cần thay đổi contract/schema/shared thì ghi #6, owner thực hiện và bàn giao SHA.
- Baseline nhánh main/core/CMS khác nhau; fetch và kiểm tra diff trước làm. Không force-push; không tự merge PR vào main khi chưa được chủ dự án ủy quyền. CI boundary phải dùng đủ mapping và metadata đáng tin; guideline không thay thế required review/checks.

## Nguyên tắc code và kiểm chứng

Theo Karpathy: nêu giả định; giải pháp nhỏ đủ mục tiêu; chỉ sửa dòng liên quan; tiêu chí nghiệm thu kiểm chứng được. Không refactor/framework migration ngoài issue; kiến trúc V4 phải có Sprint0/ADR/migration plan riêng.

Server quyết định quyền, tenant/store scope, state và giá. Không hard-delete ledger/bill hoặc sửa số tiền lịch sử âm thầm. QR public không chứng minh hiện diện; API/guest token phải có tenant/session scope. Giữ mô hình nhiều thiết bị hiện có trong MVP; requirement1claim của addendum chờ quyết định UX theo ADR-0001, không tự triển khai. Có quote/revision và idempotency đúng ý định khi thao tác tiền/order.

Không console.log/debugger/debug alert, fake data báo hoàn tất, any/ts-ignore/catch rỗng để che lỗi trong bản bàn giao. Giữ logger/audit cần thiết với mức phù hợp, không password/token/private key/PII trong log/ảnh/diff. Không xóa code/log không liên quan chỉ để đạt checklist.

Chạy kiểm tra phù hợp: build/typecheck/test liên quan, regression cho bug, UI/E2E cho đổi luồng, isolation/concurrency cho tiền/quyền. Test DB cô lập, không dùng production để seed/truncate/pentest. Không khẳng định thiết bị thật/scale/provider payment/invoice đạt nếu chưa thử. Một harness exit0 chưa đủ nếu không kiểm tra giá trị mong đợi.

## Bàn giao và merge

PR nêu problem→behavior, spec/module/issue, file ownership, contract/migration/config, test thực chạy+kết quả, ảnh UI khi cần, rollout/rollback và giới hạn. Antigravity triển khai; Codex review độc lập; dothuongton quyết định merge. Main tự deploy Render, không tự merge/deploy trong task chỉ review/lập issue/tài liệu. Trạng thái module Planned/In Progress/Tested/Released cần evidence/PR, không suy từ spec đã viết.
