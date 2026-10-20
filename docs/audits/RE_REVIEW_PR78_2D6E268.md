# Codex independent review — PR78 / 2d6e268

Kết quả: CHANGES REQUIRED. Main b63cde9 giữ nguyên, không merge/deploy PR78.

Đã chạy độc lập: 16 files / 147 backend tests PASS; frontend/backend build PASS. Phần empty-state phân biệt chưa mở/đã đóng có cải thiện. Các test backend không bao phủ React effects và vòng đời cache mới.

## P1 — Vòng lặp khởi tạo và tạo lại guest session khi không thao tác

Nguồn: GuestContext.tsx:122,208,239 và GuestLanding.tsx:31-48.

refreshOrdersAndBill phụ thuộc orders/billSummary và luôn set hai object/array mới sau fetch. loadTableMenu và joinSession phụ thuộc callback này; effect init của Landing phụ thuộc cả hai. Mỗi refresh đổi callback, khởi chạy init mới, tải menu/join/refresh tiếp. Socket subscription và timer cũng liên tục bị tái tạo.

Tái hiện bằng Chrome thật headless, viewport390x844, Vite local và API fixture đã chặn mọi request ra ngoài: sau giai đoạn tải đầu, trong750ms idle phát sinh menu8, join9, guest/session7, orders6, bill-summary6. Không phải polling3giây bình thường. Với receipt fixture và bàn chưa mở, khoảng1.5giây ghi nhận menu263/join255; UI snapshot có thể trông đúng nhưng không ổn định. Counts phụ thuộc máy và fixture latency; không suy thành production load benchmark.

Sửa lifecycle/callback ổn định, init theo QR/scope có chủ đích, single-flight và chặn response stale. Không đơn giản bỏ dependency hoặc suppress hook lint để giữ closure sai. Không rejoin mỗi refresh hoặc tự vào lượt khách tiếp theo. Reset/khôi phục cache/token/cart theo đúng scope và trạng thái; bảo vệ idempotency khi request cũ chưa xong.

## P1 — Cache tạm tính bị gắn nhãn biên nhận thanh toán chính thức

Nguồn: GuestContext.tsx:103-115 và255-271.

handleSessionClosed và catch ACCESS_REVOKED sao chép billSummary đang giữ, tự đặt isClosed=true/sessionStatus=CLOSED và closedAt theo giờ client. Không lấy final immutable bill/settlement. Staff có thể chốt giá khác sau client refresh cuối; đóng không thu tiền/revoke/expiry cũng không đồng nghĩa thanh toán thành công.

Đã chạy chính callback trong source sau transpile với fixture cache120000, server final amount giả lập100000: storage vẫn lưu120000/isClosed=true. Đây là kiểm chứng callback + phân tích nguồn, không phải end-to-end server settlement. Bản thân browser script bàn giao chèn receipt100000 thủ công nên không thể xác minh nguồn snapshot hoặc số tiền cuối. Backend test xác nhận token revoked và không đọc được bill sau close, càng không chứng minh frontend lấy final bill.

Cần nguồn snapshot chính thức có scope cho khách vừa tham gia: contract riêng qua#6 nếu cần, không mở bill theo QR công khai hoặc nới mutation của token đã revoke. Nếu chưa xác nhận được final receipt, chỉ hiển thị dữ liệu đã xem với trạng thái chưa đối soát, không khẳng định đã thanh toán. Phân biệt SESSION_CLOSED, ACCESS_REVOKED, expired và close-without-charge.

## P2 — Browser harness không fail khi điều kiện sai và chưa kiểm chứng roundtrip

Nguồn scripts/verify-ux-issue57-browser.mjs: các console.log boolean; receipt được mock tại195-244. Các điều kiện false không throw/assert; suite vẫn in ALL...VERIFIED. Điều hướng bằng Page.navigate tải lại document nên chưa thử cùng-provider đổi QR hoặc request cũ trả về muộn. Hồ sơ Chrome dùng đường dẫn cố định, không chứng minh profile mới độc lập.

Thêm assertion và exit nonzero; fixture/profile riêng cho từng lần chạy; tạo menu/join/order/close trên DB test cô lập, nhận receipt thật rồi reload/back. Test request budget idle, join single-flight, đổi QR với delayed responses, đóng/mở lại bàn và không tự vào phiên của khách sau; đóng với promo đổi giá, zero-charge, revoke/expiry và offline/reconnect. Giữ screenshot để kiểm thị giác nhưng không dùng ảnh receipt mock làm bằng chứng tài chính đầu-cuối.

## Bàn giao

Antigravity chỉ hoàn thiện #57/PR78; chưa nhận #63 hoặc sửa SuperAdmin. Các phát hiện cập nhật vào #57 và PR78, không tạo issue trùng. Chạy test/build và browser assertions ở những đường đi lỗi thật; bàn giao SHA cuối. Không tự merge/deploy. Mọi request kiểm chứng của Codex đều local hoặc fixture, không tác động production.
