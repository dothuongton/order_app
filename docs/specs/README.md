# Đặc tả chính thức và trạng thái phát triển GAERU SOFT V4

Hai tài liệu dưới đây do chủ dự án cung cấp, được lưu nguyên văn. **V4 là hệ thống đích cần xây dựng, không phải chỉ tên gọi cho đợt vá QR hiện tại.** Việc fix core/CMS hiện tại không được báo cáo là đã hoàn thành V4.

1. [Master spec V4](GAERU_SOFT_V4_MASTER.md): phạm vi SaaS, QR/POS, Online/Ship, inventory/loyalty, finance/invoice, 25 module và kiến trúc mục tiêu.
2. [Bổ sung order tại bàn](GAERU_V4_TABLE_ORDER_ADDENDUM.md): bất biến session/claim, món từng phần, CHECKOUT_LOCKED, chốt tiền, quyền và checklist nghiệm thu.
3. [Ma trận V4 với code/issue hiện tại](V4_IMPLEMENTATION_MAP.md): phần đã có một phần, phần còn thiếu, dependency và nơi ghi quyết định.
4. [Quy tắc làm việc chung](../../AGENTS.md) và [Karpathy skill trong repo](../../.agents/skills/karpathy-guidelines/SKILL.md).
5. [Nguồn/checksum](SOURCES.json): xác nhận tài liệu gốc không bị sửa ngầm.

## Cách đọc đúng

- Master/addendum là đặc tả đích. README QR v1.2 và audit là thông tin triển khai hiện tại. Spec Muse và đề xuất kỹ thuật là đầu vào cần đối chiếu, không tự ghi đè master/addendum.
- Phần order tại bàn áp dụng addendum để làm rõ master; nếu có mâu thuẫn chưa giải quyết, ghi ADR/issue thay vì tự chọn cách khác hoặc tự sửa nguyên văn tài liệu.
- Master đề xuất Next.js/NestJS/Prisma/Redis và monorepo; hiện tại là React/Vite/Express/pg. Phải có thiết kế migration từng giai đoạn, PoC và kế hoạch dữ liệu/cutover/rollback; không coi việc giữ stack trong một hotfix là hủy kiến trúc V4, cũng không rewrite tất cả trong PR vá lỗi.
- Master có tham chiếu repo gaeruvn/qrorder và domain dự kiến; repo thực thi hiện được chủ dự án chỉ định là dothuongton/order_app. Giữ nguyên tham chiếu gốc để truy xuất, nêu sai khác trong ADR thay vì âm thầm sửa nguồn.
- Addendum yêu cầu **một claim hiệu lực mỗi session**; Muse đề xuất nhiều guest cùng join và anomaly. Hai cách này không tương đương: không được triển khai nhiều quyền ghi/bill access công khai chỉ vì proposal Muse. QR vẫn là định tuyến public, không chứng minh hiện diện; claim/transfer/revoke cần atomic và scope.
- Addendum có CHECKOUT_LOCKED và payment riêng; current code OPEN/CLOSED + xác nhận thủ công chưa là toàn bộ state machine V4. Không gọi chuyển khoản thủ công là xác minh ngân hàng tự động.

## Trạng thái và phân công

Dùng Planned / In Progress / Tested / Released kèm issue, commit/PR, migration/OpenAPI, bằng chứng. Ghi rõ baseline khi audit; test xanh không chứng minh mọi yêu cầu spec đã được thực hiện.

Issue #2 giữ ownership: Sang làm admin module/UI riêng, core/auth/schema/shared do dothuongton giữ. Task mới đi theo module trong ma trận, chỉ giao khi contract/dependency rõ. Mỗi lane một việc tại một thời điểm trên working directory riêng. Mọi thay đổi đi qua review trước merge; main auto-deploy Render.

Tài liệu đang được đưa vào nhánh docs riêng để review và merge tách khỏi code. Khi chưa merge, đọc qua link nhánh/PR được gắn trong issue; không giả định clone main đã có các tệp này.
