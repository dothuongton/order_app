# Đánh giá độc lập và các điều chỉnh so với báo cáo

21/10/2026. Đây là đánh giá cho kế hoạch thử nghiệm, không phải nghiệm thu toàn bộ gaeru-soft-source hoặc một bản triển khai order_app mới.

## Bằng chứng đã kiểm

- Đã truy cập repo và checkout đúng [gaeru-soft-source@3f36c9b4733ed9e48a934935ee0d95c55a54c489](https://github.com/dothuongton/gaeru-soft-source/tree/3f36c9b4733ed9e48a934935ee0d95c55a54c489).
- Đọc README/BAN-GIAO, package.json; kiểm các module server, table-sessions, customer-order, table-payment-server, table-transfer-server và cách test load route.
- Chạy độc lập `node --test tests/*.test.mjs`: **276 tests PASS,0fail,0skip** với Node26.4.0. Cài riêng dependencies phục vụ test đúng phiên bản nêu trong SOURCE_MANIFEST; không chạy install scripts/build hoặc khởi động gaeru server.
- Ban đầu chạy thiếu React nên3 test files không load; sau cài dependency phục vụ test đã chạy lại toàn bộ và276/276PASS. Không gọi lỗi môi trường ban đầu là bug sản phẩm.
- `tests/api.integration.test.mjs` tự mô tả route/helpers được transpile trong bộ nhớ, `node:sqlite` và adapter D1, không HTTP server/network. Một số test React dùng renderToStaticMarkup, các test audio/popup kiểm pure state. Không có chứng nhận PostgreSQL row locks, liveCloudflare, production deployment hoặc push/autoplay trên iPhone từ các kết quả này.
- Đối chiếu baseline order_app main92f81cb; không coi CRUD category trên nhánh PR113 chưa nghiệm thu là đã có ở main. Mọi feature trong kế hoạch mới vẫn là Planned.

## Kết luận

Hợp lý để học **bất biến và trải nghiệm phục hồi**: immutable pending intent; idempotency+payload hash; quota server; approval/claim guard nằm trong write; generation cho hỗ trợ; replay transfer; queue notification; filter ngày rõ và CSV an toàn. Không có lý do kỹ thuật trong báo cáo buộc đổi Express/PostgreSQL/Vite hoặc bỏ Socket.IO/Push để dùng polling.

Không thể kết luận mô hình claim luôn tối ưu hơn đa thiết bị. Nó thêm chờ Staff, một thiết bị thành điểm phụ thuộc và một yêu cầu pending có thể giữ bàn15phút. Cần so sánh bằng dữ liệu vận hành, không chọn theo số lượng tests của nguồn.

## Những chỗ phải thích ứng trước code

1. **Không làm lại chức năng đã có.** order_app đã có memberships.permissions, guest_sessions và token hash, unique OPEN/table, snapshot order_items, partial order_item_parts, idempotency_records/payload fingerprint, settlement_version/expectedAmount và immutable bill_lines khi đóng. Ưu tiên contract/adapter, bù thiếu và regression.
2. **Một máy chỉ là thử nghiệm trên sandbox.** ADR-0001 vẫn giữ multi-device cho main. User yêu cầu nhánh mới chứ chưa cho đổi production. ADR-0002 giới hạn ngoại lệ đó, không sửa specV4 gốc.
3. **Claim không loại bỏ đơn ảo.** QR và tên khách không chứng minh hiện diện; cookie mới có thể tạo lại. Pending giữ bàn mở bề mặt capacity denial. Cần expiry atomic, reject/withdraw và rate limits nhiều scope; audit/Staff approval vẫn là yếu tố vận hành, không bảo đảm an ninh tuyệt đối.
4. **Mất claim không được mở cửa chiếm lại.** Staff release phải revoke lease cũ; browser thay thế cần Staff duyệt. Không giành quyền theo tốc độ request sau release. Không dùng client fingerprint làm chứng cứ sở hữu.
5. **Học giá snapshot đúng thời điểm.** Replay đơn đã commit giữ giá snapshot cũ. Nếu đơn chưa được server nhận, giá client cũ không được tự trở thành giá có hiệu lực sau khi menu đổi. Cần explicit mismatch/reconfirm thay vì giá do client quyết định.
6. **Đổi bàn không sửa chứng từ.** Phần B.7.3 nguồn yêu cầu đổi cả tham chiếu biên nhận; điều này có thể làm sai lịch sử. order_app.orders không có table_id riêng, đã dựa session_id. Chỉ đổi vị trí sống, ghi transfer history; giữ table snapshot tại lúc thu/đóng trên chứng từ và làm rõ chiều báo cáo.
7. **Finance là domain khác.** Một settlement/session hiện tại không thể được thay bằng thu từng order chỉ bằng paid_at. Promotion cấp phiên, partial served/cancelled, quota, rounding, zeroamount và double revenue cần contract riêng trước. Chia giai đoạn, không bắt buộc xây payment mới để demo order/claim.
8. **Không thay permission model bằng số10.** Main đã có quyền granular và owner/manager full. Chỉ thêm capability cần thiết, mapping rõ. Không giao Auth/Core/schema cho Sang hoặc thay server authority bằng role cache/headers Sites.
9. **Không giả định Staff gọi hộ đã có.** STAFF_POS tồn tại trong schema nhưng chưa thấy endpoint/UI tạo đơn Staff tại baseline. Nếu cần nhánh phục vụ không điện thoại phải làm adapter nhỏ dùng validation/pricing chung, không giả login khách.
10. **Realtime và lịch sử phải giữ mức bảo vệ hiện tại.** Không-claim không được đọc private qua join/socket/cache. Mở rộng events sau commit, giữ scoped replay và room reauthorization; không xóa receipts/guest history hợp lệ chỉ vì đổi mô hình cookie.
11. **Thông báo không bảo đảm chuông khi khóa máy.** Push phụ thuộc ENV, permission/PWA/OS/provider; TTS chỉ foreground và sau user interaction. Không hứa microphone hay âm tùy chỉnh nền. Test thật tách provider accepted với received/displayed trên máy.
12. **Chưa phải mọi nhận định nguồn đều đã kiểm.** Không lấy số dòng, số bảng, mức độc lập hạ tầng, DNS hoặc ước lượng vài ngày/hai tuần trong báo cáo làm kết luận đã xác nhận. Không chạy full gaeru build/deploy hoặc pentest trong task yêu cầu triển khai này.

## Nguồn chính để Antigravity tự đối chiếu

### Gaeru tại commit ghim
- [README](https://github.com/dothuongton/gaeru-soft-source/blob/3f36c9b4733ed9e48a934935ee0d95c55a54c489/README.md).
- [Cookie/server](https://github.com/dothuongton/gaeru-soft-source/blob/3f36c9b4733ed9e48a934935ee0d95c55a54c489/lib/server.ts), [pending session](https://github.com/dothuongton/gaeru-soft-source/blob/3f36c9b4733ed9e48a934935ee0d95c55a54c489/lib/table-sessions.ts).
- [Pending order](https://github.com/dothuongton/gaeru-soft-source/blob/3f36c9b4733ed9e48a934935ee0d95c55a54c489/lib/customer-order.ts).
- [Receipt](https://github.com/dothuongton/gaeru-soft-source/blob/3f36c9b4733ed9e48a934935ee0d95c55a54c489/lib/table-payment-server.ts), [transfer](https://github.com/dothuongton/gaeru-soft-source/blob/3f36c9b4733ed9e48a934935ee0d95c55a54c489/lib/table-transfer-server.ts).
- [Test harness thực sự chạy](https://github.com/dothuongton/gaeru-soft-source/blob/3f36c9b4733ed9e48a934935ee0d95c55a54c489/tests/api.integration.test.mjs).

### order_app tại baseline92f81cb
- [Schema](https://github.com/dothuongton/order_app/blob/92f81cb83a961dd74caffb98a6316fd73b3ac147/backend/src/db/schema.sql), [idempotency](https://github.com/dothuongton/order_app/blob/92f81cb83a961dd74caffb98a6316fd73b3ac147/backend/src/utils/idempotency.ts).
- [GuestService](https://github.com/dothuongton/order_app/blob/92f81cb83a961dd74caffb98a6316fd73b3ac147/backend/src/modules/guest/guest.service.ts), [Guest routes](https://github.com/dothuongton/order_app/blob/92f81cb83a961dd74caffb98a6316fd73b3ac147/backend/src/modules/guest/guest.routes.ts).
- [StaffService](https://github.com/dothuongton/order_app/blob/92f81cb83a961dd74caffb98a6316fd73b3ac147/backend/src/modules/staff/staff.service.ts), [Staff routes](https://github.com/dothuongton/order_app/blob/92f81cb83a961dd74caffb98a6316fd73b3ac147/backend/src/modules/staff/staff.routes.ts).
- [Socket](https://github.com/dothuongton/order_app/blob/92f81cb83a961dd74caffb98a6316fd73b3ac147/backend/src/realtime/socket.ts), [auth/permissions](https://github.com/dothuongton/order_app/blob/92f81cb83a961dd74caffb98a6316fd73b3ac147/backend/src/middleware/auth.ts).

Tham chiếu dùng để học, không cho phép nhập credentials/default data/auth headers hoặc copy toàn repo. Phát hành chỉ sau bằng chứng riêng trên order_app.
