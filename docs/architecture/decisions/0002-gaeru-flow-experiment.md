# ADR-0002: Thử nghiệm luồng Gaeru trên nhánh và môi trường riêng

- Ngày:21/10/2026.
- Trạng thái: phạm vi thử nghiệm theo yêu cầu mới của chủ dự án; chưa phát hành.
- Nhánh:codex/gaeru-flow-experiment và các feature branch codex/gaeru-* có PR base nhánh này.

Chủ dự án yêu cầu xây nhánh mới học luồng từ báo cáo Gaeru và viết yêu cầu cho Antigravity. Cho phép thử yêu cầu mở bàn được Staff duyệt và claim một thiết bị trong sandbox để so sánh; không tự thay mô hình nhiều thiết bị của main trong ADR-0001.

Giữ React/Vite/Express/PostgreSQL/Socket.IO/Web Push, tenant/auth/quyền và bất biến tài chính của order_app. Không port Sites auth headers hoặc D1. Claim/order/recovery là đơn vị giao hàng đầu tiên; split receipts và RBAC mới cần contract riêng. Mọi thay đổi được giới hạn ở lane Core, checkout/DB/domain/secret thử nghiệm riêng, không ảnh hưởng nhánh CMS Sang.

Đọc [yêu cầu triển khai](../../experiments/gaeru-flows/README.md) và [đánh giá nguồn](../../experiments/gaeru-flows/SOURCE_REVIEW.md). Đặc tả gốc giữ nguyên tại SOURCE_SPEC.md; các điểm điều chỉnh được ghi rõ, không sửa nội dung nguồn.

Nhánh mới không tự giải quyết conflict. Một task Core coding mỗi lúc và file handoff qua#2/#6 vẫn bắt buộc. Chưa merge runtime lên main hoặc deploy Render production. Chỉ đổi mô hình vận hành chính thức sau review/dữ liệu thử nghiệm và yêu cầu riêng của chủ dự án.
