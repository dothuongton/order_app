# QR ORDERING PWA MULTI-TENANT — PHÂN TÍCH VÀ ĐẶC TẢ v1.2

**Ngày cập nhật:** 18/10/2026  
**Trạng thái:** đã cập nhật luồng theo yêu cầu mới của chủ sản phẩm; các chi tiết bổ sung được ghi rõ là đề xuất thiết kế. Chưa triển khai hoặc kiểm thử hiệu năng.  
**Thay thế:** bản phân tích và đặc tả v1.1 cho phạm vi triển khai tiếp theo.

## 1. Yêu cầu đã xác nhận và thay đổi so với v1.1

### 1.1 Bốn yêu cầu mới làm cơ sở

1. Không tích hợp thanh toán; hệ thống hiển thị tổng bill. Tiền được xử lý ngoài hệ thống.
2. Khách dùng camera điện thoại quét QR tại bàn để mở trang web gọi món.
3. Khách gửi yêu cầu gọi món. Nhân viên tiếp nhận, đánh dấu đã phục vụ, hoặc hủy khi hết nguyên liệu.
4. Khách có thể gọi món nhiều lần trong một phiên bàn. Hệ thống cộng tổng các lần gọi. Khách yêu cầu thanh toán qua web hoặc gọi trực tiếp nhân viên. Sau khi kiểm tra thanh toán ngoài hệ thống, nhân viên xác nhận thanh toán thành công và kết thúc phiên bàn.

**Phân biệt quan trọng:** “không tích hợp thanh toán” không loại bỏ nút nhân viên xác nhận đã thanh toán. Nút này chỉ ghi nhận xác nhận thủ công, không thực hiện, kiểm tra hay đối soát giao dịch ngân hàng.

### 1.2 Những phần v1.1 được thay đổi

| Nội dung cũ | Đặc tả v1.2 |
|---|---|
| Luồng nhiều bước PENDING → ACCEPTED → PREPARING → READY → SERVED | Luồng đơn giản PENDING → ACCEPTED → SERVED; có CANCELLED khi hết nguyên liệu |
| Bếp có luồng chế biến/sẵn sàng riêng | Không bắt buộc màn hình hoặc trạng thái bếp riêng trong MVP |
| Chốt bill FINALIZED rồi mới xác nhận thu | Bỏ thao tác chốt/mở lại bill; xem tổng cập nhật rồi xác nhận đã thanh toán |
| PAID nhưng phiên vẫn mở, đóng phiên ở thao tác sau | Xác nhận thanh toán và kết thúc phiên trong cùng một thao tác/transaction |
| Điều chỉnh/đảo điều chỉnh sau PAID | Ngoài MVP; không sửa trực tiếp bill đã kết thúc |
| Thu đủ tiền rồi mới đóng khi khách rời bàn | Theo yêu cầu mới, xác nhận thanh toán kết thúc phiên ngay; bàn chờ dọn trước lượt mới |
| Chọn thiết bị controller, nhập mã/chuyển quyền là luồng chính | Không bắt buộc các bước này trong luồng QR đề xuất mới; chính sách thiết bị nêu tại mục 4 |
| Giao diện thu ngân desktop nhiều panel | Mobile-first cho cả khách và nhân viên, quản lý |

Giữ kiến trúc nhiều quán, cô lập dữ liệu, không cần tài khoản khách, giá snapshot, chống trùng, kiểm tra quyền tại server, realtime có đồng bộ bù, audit và PWA nhân viên.

### 1.3 Phạm vi loại trừ

Không có cổng thanh toán, QR ngân hàng do hệ thống tạo, webhook thanh toán, SePay, xác minh chuyển khoản, thu tiền online, ví, thu nhiều lần, chia bill, hoàn tiền tự động, kế toán, quản lý kho định lượng, giao hàng hoặc loyalty. Không có giảm giá/thuế/phí riêng trong MVP đề xuất; đơn giá là giá bán cuối cùng do quán khai báo.

Khách quét QR bằng camera hoặc ứng dụng quét QR có sẵn trên điện thoại. Trang web không yêu cầu quyền camera và không cần xây trình quét QR bên trong website.

## 2. Thuật ngữ thống nhất

| Thuật ngữ | Ý nghĩa |
|---|---|
| Bàn | Bàn vật lý của một quán, có QR riêng |
| Phiên bàn | Một lượt phục vụ, từ lúc nhân viên mở đến lúc xác nhận thanh toán/kết thúc |
| Lần gọi món / order | Một yêu cầu được gửi, gồm một hoặc nhiều món; gọi thêm tạo order mới |
| Bill lần gọi | Phần tiền của một lần gọi; là cách trình bày subtotal, không phải giao dịch thanh toán riêng |
| Tổng bill của bàn | Tổng các món hợp lệ của mọi lần gọi trong cùng phiên |
| Yêu cầu thanh toán | Khách muốn nhân viên tới xử lý; không chứng minh đã trả tiền |
| Xác nhận thanh toán thành công | Nhân viên xác nhận đã nhận đủ tiền ngoài hệ thống và kết thúc phiên |

## 3. Vai trò và giao diện mobile-first
- Khách: Quét QR → xem menu → chọn món → gửi yêu cầu → xem trạng thái → gọi thêm → xem tổng bill → gọi hỗ trợ/yêu cầu thanh toán.
- Nhân viên: Mở phiên; xem yêu cầu mới; tiếp nhận; xác nhận đã phục vụ; hủy món khi hết nguyên liệu; xử lý hỗ trợ/thanh toán; xác nhận đã thanh toán và kết thúc phiên.
- Quản lý quán: Quản lý menu, hết món/còn bán, bàn/QR, nhân viên, quyền, lịch sử phiên và số liệu ghi nhận.
- Quy tắc UI: Mobile 390px trước (360-430px), nút chạm tối thiểu 44px-48px.
