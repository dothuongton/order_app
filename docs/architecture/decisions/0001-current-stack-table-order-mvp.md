# ADR-0001: Ưu tiên MVP order tại bàn trên công nghệ hiện tại

- Trạng thái: **Đã chốt bởi chủ dự án**,20/10/2026.
- Repo thực thi: `dothuongton/order_app`.
- Yêu cầu: xây dựa công nghệ repo hiện tại; nếu đáp ứng được thì không đổi. Giai đoạn này ưu tiên có quán dùng order tại bàn, chưa cần tích hợp thanh toán; đặt online/thanh toán mở rộng sau.

## Quyết định

1. Tiếp tục React/Vite/TypeScript + Express/pg/PostgreSQL + Socket.IO/PWA. Tái sử dụng module/schema đang đáp ứng; chỉ đề xuất đổi công nghệ khi có yêu cầu hoặc số đo chứng minh cần, bằng ADR riêng. Next/Nest/Prisma/monorepo trong master là định hướng tham khảo tương lai, không là điều kiện của MVP hiện tại.
2. MVP: quét QR → xem menu/tùy chọn → gửi/gọi thêm → nhân viên nhận/phục vụ/hủy đúng lượng → cập nhật trạng thái → kết thúc lượt phục vụ và mở lượt mới. Quản lý quán/menu/bàn/nhân viên đủ vận hành, tenant isolation, idempotency và xử lý lỗi/mạng yếu đi cùng.
3. Chưa mở rộng bank/payment gateway/webhook/invoice/refund ledger mới, POS offline, Online/Ship, subscription billing, inventory/loyalty, hỗ trợ1000quán hoặc rewrite framework thành điều kiện để quán pilot. Giữ lịch sử/đóng phiên/ghi nhận nội bộ hiện có khi cần cho vận hành; không gọi đó là xác minh thanh toán tự động.
4. Giữ mô hình nhiều thiết bị của code hiện tại trong MVP. Không tự bật claim độc quyền một thiết bị. Addendum gốc yêu cầu1claim/session vẫn được lưu để đối chiếu; task#52 tạm hoãn cho đến khi chủ dự án chọn thay đổi UX này. Các kiểm soát revoke/scope/privacy/anomaly có thể cải thiện mà không tự giới hạn khách sang một máy.
5. Dothuongton/order_app là source of truth thực thi. Tham chiếu gaeruvn/qrorder trong bản master gốc không thay repo được chủ dự án chọn. Hai spec gốc giữ nguyên byte; quyết định hiện tại ghi ở ADR này và issue.
6. Sang giữ admin module/UI; core giữ auth/schema/guest/staff/shared. Mỗi lane một issue tại một thời điểm, không sửa tệp người kia. Không merge code đang có blocker chỉ vì toàn bộ tests cũ xanh.

## Tiêu chí ra pilot

Kiểm thử đầu-cuối luồng order tại bàn trên thiết bị thực, xử lý lỗi/hết món/partial serve/retry/đổi phiên/tenant isolation và đủ bước cho nhân viên vận hành; log/audit an toàn, backup/rollback rõ. Module không làm trong MVP được ghi Planned/Backlog, không báo hoàn thành hay triển khai giả.

## Tác động tài liệu/backlog

MasterV4 và addendum là nguồn yêu cầu tương lai; ADR/yêu cầu trực tiếp mới nhất của chủ dự án định phạm vi MVP hiện tại. #50 theo dõi đích dài hạn; #51 kiểm kê/sắp xếp MVP trên stack hiện tại; #52 claim và #53 payment state mới chờ giai đoạn/quyết định phù hợp. RoadmapMuse#35 và các task phải đọc cùngADR này. Các bug dữ liệu/quyền vẫn phải sửa đúng phạm vi, không vì hoãnpaymentintegration mà bỏ bảo toàn lịch sử.
