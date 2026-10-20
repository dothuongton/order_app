# Codex independent review — 2e764be (20/10/2026)

PR #55: CHANGES REQUIRED, còn một lỗi chặn ở nhánh thực thi trusted guard của CI. Không merge/deploy.

Baseline: core2e764beab1c3a35b3e5cda1fd670d543f6df3aef; maincb6eba357d35f8e02a58965833b9a75091aa2a6e. GitHub MERGEABLE, Actions boundary/build-test thành công; Vercel vẫn lỗi, Netlify preview thành công. Đích deploy được chọn là Render.

## Các phần đã kiểm chứng đạt

- Backend15files/138tests đạt; backend và frontend build đạt, chạy độc lập trên máy local.
- Ca hủy đợt đầu: quote40000/pay200.
- Nhiều attached promo với cap hết: quote100000/pay200, phiên CLOSED.
- Đổi min-order của promoA: quote100000/pay200, hết lỗi quote120k/settle100k trước đây.
- Archived ACCEPTED: dashboard200/serve200/settle200 qua HTTP.
- Branch substring bị chặn, Sang exact API/type paths được phép; default seed giữ marker.
- CLI chạy bằng tệp thật có phát hiện vi phạm và fail-closed khi base thiếu theo suite.

Đây là service/HTTP/local test, chưa phải browser E2E, thiết bị thật hoặc restore drill.

## P1 #29 — trusted script qua stdin không thực thi CLI

Nguồn: .github/workflows/ci.yml:35 và scripts/check-file-boundaries.mjs:281.

Workflow mới dùng git show từ base rồi pipe vào node - <base>. Trong script, CLI chỉ chạy khi path.resolve(process.argv[1]) bằng path.resolve(import.meta.filename). Khi dùng stdin, điều kiện không khớp: module chỉ khai báo các export, không gọi validator và kết thúc exit0.

Đã tái hiện trên Node20.20.2 (cùng major workflow):
- Tác giả SangVuxx với diff core hiện tại: chạy tệp thật exit1 và báo vi phạm; đưa cùng nội dung vào node - origin/main: exit0, stdout/stderr rỗng.
- node - refs/does-not-exist cũng exit0, không kiểm tra base.
- Kết quả tương tự trên Node26.4.0 local.

Actions hiện tại thật sự chạy nhánh bootstrap vì main chưa có script (đã đối chiếu log Run39384935709). Vì vậy không kết luận check hiện tại bị bỏ qua. Nhưng sau merge, nhánh trusted mới sẽ được chọn và bỏ qua validator; CI xanh hiện tại chưa kiểm chứng nhánh đó.

Sửa nhỏ: ghi script từ base vào tệp .mjs tạm đáng tin, rồi node <tệp> <base>; hoặc có entry point gọi main rõ ràng khi dùng stdin. Không chuyển lại chạy guard do PR sửa. Bắt buộc test đúng cách workflow chạy: base có script, PR sửa guard, actor vi phạm, base thiếu và diff nhiều commit; kiểm cả kết quả thành công hợp lệ và từ chối hợp lệ, không chỉ test CLI thông thường.

Branch protection vẫn là cấu hình repo bên ngoài code, không được báo đã bật khi chưa có bằng chứng.

## Bàn giao Antigravity

Giữ nguyên pricing đã đạt. Chỉ sửa integration trusted guard/entry point, bổ sung regression nhánh base đã có script. Không nhận Giai đoạn B. Cập nhật #29/#24 và PR #55 với SHA, kết quả test, khác biệt bootstrap/trusted. Chờ Codex re-review, không tự merge/deploy.

Bằng chứng JSON: RE_REVIEW_2E764BE_EVIDENCE.json. Harness local: backend/scripts/review-2e764be-independent.mjs, chạy từ backend với node --import tsx scripts/review-2e764be-independent.mjs. Harness ghi nhận giá trị, không coi exit0 là toàn bộ acceptance. Chỉ dùng DBlocalcôlập; không có thao tác production.
