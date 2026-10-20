# Đánh giá đề xuất UX Muse — 20/10/2026

Đề xuất phù hợp làm backlog hoàn thiện MVP order tại bàn, sau khi hiệu chỉnh các giả định dưới đây. Tài liệu Muse được lưu nguyên văn bên cạnh; không thay thế ADR-0001 hoặc đặc tả V4.

Baseline đối chiếu: main `cb6eba3`, nhánh core `7b98dde` chưa phát hành. Codex đọc code và kiểm thử local; không lặp lại thao tác sửa dữ liệu production trong báo cáo Muse. Các số liệu về lần chạm, thời gian chờ và mật độ màn hình là quan sát của Muse, chưa được Codex đo độc lập.

## Những điểm cần hiệu chỉnh

- Guest đã có Socket.IO và polling trong GuestContext. Điều tra lỗi kết nối, reconnect và cập nhật màn hình, không xây lại realtime.
- GuestBill gộp `!session` với trạng thái đã đóng có thể giải thích câu chữ sai. Chưa có bằng chứng độc lập API làm lộ bill khách trước; issue yêu cầu kiểm tra cache, token và cách ly phiên.
- Tiền món chờ là ước tính có chú thích; không được biến thành số tiền phải thu chắc chắn. Khuyến mãi phải theo contract cấp phiên đang sửa ở #28, không đổi câu chữ về lần gọi theo giả định cũ.
- Đếm phải phân biệt dòng với số phần và bao phủ CANCELLED. Header số món chờ không mặc nhiên là tổng mọi món trong nhóm.
- Quyền theo permission thực tế, không suy từ tên vai trò. Giao diện và gọi API trực tiếp đều phải kiểm tra.
- Thu gọn hàng món vẫn giữ ghi chú bếp/dị ứng quan trọng, chữ hoặc icon mô tả trạng thái, vùng chạm và khả năng truy cập. Không ép mục tiêu 12–15 dòng nếu làm khó đọc.
- Không mở API hỗ trợ công khai chỉ bằng QR trong task UI. Dùng thông tin liên hệ đã cấu hình; thay đổi API cần contract và cơ chế chống spam riêng. Giữ nghĩa nghiệp vụ của thao tác nhắc hỗ trợ hiện có.
- Gom món bếp theo ID, tùy chọn, trạng thái và ghi chú; pha đầu chỉ đọc. Bulk mutation cần đề xuất riêng về quyền, concurrency và kết quả từng phần.
- Phản hồi tức thì không đồng nghĩa hiển thị thành công trước khi server xác nhận; không áp dụng optimistic cho chốt tiền.
- Cold start cần đo và đề xuất phương án chi phí; không tự nâng gói hay tạo keep-warm. Không tự đổi quy tắc giá bội 1.000, model topping, vai trò bếp hoặc vị trí quản lý tài khoản nhân viên.

## Backlog đã xuất bản

Epic: https://github.com/dothuongton/order_app/issues/56

| Issue | Mã Muse | Phạm vi |
|---|---|---|
| #57 | G-03, G-04 | Trạng thái phiên và cách ly bill |
| #58 | G-01, G-02 | Thẻ món, liên hệ khi bàn chưa mở |
| #59 | G-05 | Tìm kiếm món |
| #60 | G-06–G-09 | Tùy chọn, thêm nhanh, sửa giỏ và đếm phần |
| #61 | G-10 | Xác nhận gửi đơn, chống trùng khi retry |
| #62 | G-11, G-12 | Tiền ước tính và ưu đãi đúng contract |
| #63 | S-05 | Đếm dòng/phần và trạng thái |
| #64 | S-01–S-04 | Hàng đợi gọn và ưu tiên việc chưa xong |
| #65 | S-06, S-09 | Tìm bàn/món và bộ lọc |
| #66 | S-07 | Phản hồi thao tác, đồng bộ nhiều thiết bị |
| #67 | S-11, S-12 | Permission và lý do thao tác bị khóa |
| #68 | S-10 | Thời gian chờ theo timestamp |
| #69 | S-08 | Backlog sau pilot: xem gộp món chỉ đọc |
| #70 | G-13, G-14, S-15 | Realtime và vòng đời hỗ trợ |
| #71 | S-13 | Helper giá và validation |

Tái sử dụng issue: G-15 → #36 (nội dung demo/pilot); G-16 → #23 (cold start/vận hành); S-14 → #21/#43 (UX thông báo và cấu hình thiết bị). Không tạo lại phạm vi đã có.

Tất cả issue Guest/Staff/shop CMS giao @dothuongton/core; Super Admin của Sang giữ riêng. Hoàn tất và review PR #55 trước khi nhận nhánh triển khai UX từ main mới. Các issue cùng sửa GuestContext, CartDrawer hoặc StaffDashboard phải làm tuần tự, một issue giữ tệp mỗi lần. Đề xuất này không cấp quyền đổi dữ liệu production, merge hoặc deploy.

SHA256 nguồn Muse: `32de2a6a05c492d986b268175a65307646a3e8352b6cf5563366d87ea6bdcf89`.
