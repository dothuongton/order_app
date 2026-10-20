# Đánh giá báo cáo responsive Muse — 20/10/2026

Nguồn nguyên văn: MUSE_RESPONSIVE_REVIEW_2026-10-20.md. SHA256 `21de8923bcda6ee78e6809097c4c96be8c96e5b830eb41398f0a5c7e804fc33f`.

Codex đối chiếu code core7b98dde, maincb6eba3; không kiểm thử thị giác hoặc phần cứng thật trong lượt lập backlog này. Báo cáo phù hợp có điều kiện: max-w-lg ở Staff và max-w-md ở Guest được xác nhận trong code, không có custom maxWidth trong Tailwind. Giá trị512/448px là cấu hình theo rem, không xác nhận số đo DOM540/500px. Quan sát điện thoại/tablet/POS trong báo cáo vẫn là suy luận. Không coi mobile/tablet đã đạt chỉ vì mobile-first hoặc không thấy vỡ trên desktop.

GuestMenu hiện có phần render giá, nên món mất giá cần tái hiện API/model/DOM/theme/overflow, không tự sửa dữ liệu. Sheet đã có max-height85vh và overflow, nên phải kiểm bàn phím/safe-area thực tế thay vì giả định chưa có cuộn. Không biến mục tiêu44px vận hành cảm ứng thành tuyên bố chứng nhận accessibility chung. Giữ Guest mobile-first; chỉ Staff cần thiết kế rộng phù hợp thiết bị quán. Hồi quy mobile là điều kiện mỗi PR, không phải cải tiến tùy chọn P2 làm sau.

## Ánh xạ công việc

| Mã | Issue | Xử lý |
|---|---|---|
| R-01 | #73 | Staff shell rộng, điều hướng và nội dung; phối hợp #64 |
| R-02 | #21 | Banner push và header màn thấp; dùng issue cũ |
| R-03 | #76 | Inventory hitbox/focus/keyboard cho Staff |
| R-04 | #74 | Guest màn thấp, sheet, keyboard, safe-area |
| R-04 giá | #75 | Xác minh món mất giá; không đoán root cause |
| R-05/R-06 | #77 | Ma trận viewport bắt buộc và gate pilot thiết bị thật |

Các issue mới gán @dothuongton/core, không sửa Super Admin của Sang. Đọc epic#56, ownership#2 và dependency từng issue. Chốt PR#55 trước khi triển khai UX từ main mới. Một issue giữ tệp mỗi lần; không mở rộng framework/payment/claim, không thao tác dữ liệu production.

## Chỉ thị Antigravity

Giữ ưu tiên hoàn thiện #28/#29 trong PR#55. Sau Codex nghiệm thu, triển khai responsive trên nhánh issue riêng theo thứ tự: #64/nhãn và quyền → shell rộng → vùng chạm; phần Guest sau #58/#60 và phối hợp giỏ. Tái sử dụng #21 cho header/push. Mỗi PR có ảnh viewport/browser và regression liên quan; thiết bị thật chưa có phải ghi NOT TESTED. Không tự merge/deploy hoặc mua/nâng cấp hạ tầng.
