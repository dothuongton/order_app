# Đánh giá luồng nghiệp vụ và bảo mật QR Order

Ngày kiểm tra: 19/10/2026. Phạm vi: mã nguồn trong repository, HTTP API, Socket.IO, PostgreSQL và bản dựng chạy trên localhost. Không quét hay sửa hệ thống production bên ngoài.

## Kết quả xác minh

- `npm test`: **68/68 test đạt**, gồm 30 test sẵn có và 38 trường hợp hồi quy bảo mật/nghiệp vụ mới. Các kịch bản giá niêm yết cũ được tách khỏi khuyến mãi; có test riêng cho tiền sau giảm giá và hủy một phần.
- `npm run build`: backend và frontend thành công. Đã chạy build lặp lại và kiểm tra migration được đóng gói đúng, không còn thư mục migration lồng hay test cũ trong bản dựng.
- Backend: `npm audit` và `npm audit --omit=dev` đều không còn cảnh báo được registry công bố tại thời điểm kiểm tra.
- Frontend: `npm audit --omit=dev` không có cảnh báo; toàn bộ cây phụ thuộc còn **7 cảnh báo development** (5 high, 2 moderate), xem phần giới hạn.
- Đã thử bản dựng qua trình duyệt bằng cơ sở dữ liệu tạm riêng; dữ liệu và các xác nhận tiền trong lượt thử này đều là dữ liệu mẫu.

Đây là kết quả kiểm tra trong phạm vi trên, không phải chứng nhận hệ thống không còn lỗ hổng.

## Các phát hiện và bản sửa

Mức độ là đánh giá theo tác động trong mã nguồn; không khẳng định các lỗ hổng đã từng bị khai thác trên production.

| Vấn đề | Mức độ | Thay đổi và xác minh |
|---|---|---|
| Secret ký JWT mặc định được công khai trong mã nguồn | Cao | Bỏ fallback cố định, sinh khóa ngẫu nhiên cho development khi thiếu cấu hình; production từ chối khóa mẫu/khóa ngắn. Test xác nhận không khởi tạo cấu hình production với khóa cũ. |
| Phục vụ/thu ngân mặc nhiên vượt mọi `requirePermission` | Cao | Chỉ owner/manager có toàn quyền ngầm định; vai trò khác dùng grants thực tế. Giao diện và bộ lọc push đồng bộ. Seed mới không cấp quyền chốt tiền cho waiter. |
| Socket.IO cho vào phòng chỉ cần biết ID tenant/session | Cao | Tham gia phòng yêu cầu token và kiểm tra membership/phiên khách. Kiểm tra lại quyền trước từng lần phát sự kiện; loại khỏi phòng khi hết hạn/thu hồi. Chặn Origin lạ cả WebSocket lẫn polling. |
| CORS phản chiếu mọi Origin kèm credentials | Cao | Danh sách Origin chính xác dùng chung HTTP/Socket.IO; chặn request từ Origin lạ trước khi thực hiện nghiệp vụ, kể cả request dùng cookie. Cho phép đủ header mà frontend thực sự gửi trong preflight. |
| Upload SVG/nội dung giả ảnh được phục vụ cùng origin | Cao | Chỉ nhận PNG/JPEG/GIF/WebP, kiểm tra base64 và chữ ký định dạng, giới hạn 5MB. Endpoint đọc cũng từ chối loại ảnh có nội dung thực thi đã lưu từ trước; thêm `nosniff`. Không thực thi payload trong trình duyệt khi test. |
| Push endpoint tùy ý có thể khiến server gửi request tới địa chỉ không tin cậy | Cao | Chỉ chấp nhận HTTPS tới các provider đã liệt kê; chặn userinfo, cổng lạ, host giả mạo và địa chỉ nội bộ. Kiểm tra cả lúc gửi cho subscription cũ. Test dùng địa chỉ giả và dừng trước bước gửi mạng. |
| Subscription có thể bị tài khoản khác ghi đè bằng cùng endpoint | Trung bình | Upsert chỉ cho cùng user/tenant; tài khoản khác nhận conflict. |
| Khuyến mãi lúc tạo đơn không đi vào bill/settlement/report món | Cao | Tính từ snapshot giảm giá của dòng món, phân bổ theo số lượng phục vụ, món hủy bằng 0. Bill summary và settlement dùng cùng công thức; báo cáo món cũng dùng số tiền sau giảm. Test 3 phần, phục vụ 2, hủy 1 với mức giảm 101đ. |
| Phân bổ phần dư giảm giá vào dòng cuối có thể vượt giá trị dòng | Trung bình | Dùng phương pháp phần dư lớn nhất và số nguyên BigInt khi nhân/chia phân bổ. Test 100 dòng giá 1đ giảm 99đ: tổng cuối đúng 1đ, không dòng nào âm. |
| Retry cùng idempotency key đồng thời kiểm tra trước khóa phiên | Trung bình | Tra bản ghi chống trùng sau khi khóa phiên. Sáu request đồng thời cùng payload nhận cùng order; đổi payload cùng key trả conflict. Frontend giữ key qua retry khi kết quả chưa rõ và dùng chung request đang gửi. |
| Thay đổi món, yêu cầu hỗ trợ và đóng phiên thiếu thứ tự khóa thống nhất | Cao | Thao tác đổi trạng thái món và tạo service request đều khóa phiên trước khi ghi; từ chối phiên đóng. Nhiều request hỗ trợ đồng thời chỉ tạo một dòng đang mở. Hai lần chốt tiền đồng thời chỉ một lần thành công. |
| Số lượng 0 bị hiểu thành xử lý toàn bộ; số âm/lẻ/vượt số còn lại không được chặn thống nhất | Trung bình | Validate số nguyên dương và giới hạn, chỉ dùng mặc định toàn bộ khi trường quantity bị bỏ qua. Phục vụ xử lý được nhiều phần ACCEPTED của cùng một dòng. |
| Bỏ qua settlement version khi gửi 0/thiếu giá trị | Cao | Bắt buộc version nguyên dương và phải khớp version đang khóa. Test thiếu/null/0/âm/chuỗi và version cũ. |
| Phát realtime/push trước COMMIT | Trung bình | Xếp tác dụng phụ sau COMMIT; giao dịch rollback không phát thông báo. Không có cam kết giao thông báo bền vững nếu tiến trình chết ngay sau commit. |
| Logout chỉ xóa cookie staff, token đã cấp vẫn dùng lại được | Cao | Thu hồi hash token trong PostgreSQL qua migration 003; HTTP và Socket.IO đều kiểm tra thu hồi. Logout xóa cả hai cookie. JWT có ID riêng để lần đăng nhập mới cùng giây không trùng token đã thu hồi. |
| Đăng nhập không giới hạn tần suất, lỗi 500 có thể lộ chi tiết DB | Trung bình | Giới hạn đăng nhập và thao tác ghi của khách theo IP; 500 trả thông báo chung. Test brute force nhận 429. |
| Xuất bản sau rollback có thể trùng số phiên bản | Trung bình | Khóa tenant, lấy MAX(version)+1 trong lịch sử. Test publish sau rollback và hai publish song song không trùng version. |
| CMS trả snake_case nhưng editor/preview đọc camelCase; preview lấy menu từ endpoint không có menu | Trung bình | Chuẩn hóa các danh sách CMS, thêm endpoint danh mục tenant và dùng endpoint menu thực tế cho preview. Không gửi ID/counter vào payload sửa. Test hợp đồng dữ liệu và kiểm tra trình duyệt. |
| Publish vẫn chạy khi lưu draft/profile thất bại | Trung bình | Dừng publish nếu bước lưu thất bại; URL logo/cover trống được xử lý đúng. Đã lưu và publish thành công qua trình duyệt. |
| Storefront không sử dụng banner, khuyến mãi và layout đã publish | Nghiệp vụ | Hiển thị banner/khuyến mãi đang hiệu lực, bật/tắt block, màu chủ đạo và layout classic/grid/compact theo cấu hình đã xuất bản. Đã thử publish giao diện xanh/lưới và xem lại phía khách. |
| Quét QR trước lúc mở bàn phải tải lại; giỏ có cùng món khác ghi chú bị chỉnh cùng số lượng | Nghiệp vụ | Khách đang chờ được thử tham gia định kỳ; dừng sau lần tham gia đầu để không tự vào phiên của lượt khách sau. Thao tác tăng/giảm/xóa giỏ nhận diện cả món và ghi chú. |
| Test xóa/nạp DB cấu hình sẵn; nhiều suite seed chồng nhau | Cao về an toàn dữ liệu | Test tạo DB `qr_order_test_*`, migrate/seed riêng, chạy các file tuần tự và xóa DB tạm khi xong. Hàm seed từ chối DB thường khi NODE_ENV=test. |
| Build lặp lại tạo migration lồng; startup bỏ qua lỗi migration | Cao về vận hành | Build sạch và copy tài nguyên bằng Node; startup dừng nếu migration thất bại. Đã thử bản dựng thực tế, phát hiện và khắc phục lỗi thiếu migration 003. |
| Vite cho mọi Host | Trung bình trong development | Bỏ `allowedHosts: true`; chỉ thêm host tunnel cụ thể qua cấu hình. |

## Các luồng đã chạy qua trình duyệt

1. Đăng nhập quản lý → tải đủ 5 bàn → mở A01.
2. Khách mở QR A01 → chọn món → giỏ → gửi đơn; phía nhân viên nhận cập nhật thời gian thực.
3. Nhân viên nhận món → phục vụ → kiểm tra bill → xác nhận thu tiền mẫu 25.000đ → đóng phiên.
4. Phía khách hiện thông báo kết thúc, không còn nút thêm món; phía nhân viên bàn trở lại sẵn sàng.
5. Báo cáo có đúng 1 phiên xác nhận, tổng 25.000đ.
6. CMS tải đủ banner/khuyến mãi/lịch sử và preview có danh mục, món.
7. Chọn màu xanh, layout grid → lưu/publish v2 thành công → thực đơn công khai hiển thị cấu hình đã publish.

Bằng chứng: [CMS preview](audit-evidence/cms-preview.png), [khách hết quyền](audit-evidence/guest-session-closed.png), [báo cáo chốt tiền](audit-evidence/settlement-report.png), [storefront đã publish](audit-evidence/published-storefront.png).

Các kịch bản API/đồng thời chi tiết nằm trong `backend/src/tests/security-flows.test.ts`. Không gửi Web Push thật đến thiết bị hoặc thực hiện giao dịch tiền thật.

## Sự cố dữ liệu trong lượt kiểm tra ban đầu

Lượt `npm test` đầu tiên đã chạy cơ chế test cũ trước khi phát hiện `seed()`/`seed(true)` thực hiện TRUNCATE. Lượt đó đã xóa và nạp lại dữ liệu mẫu trên database cấu hình sẵn; hai suite còn seed song song. Không có bản sao dữ liệu trước lượt chạy này được tạo trong phiên làm việc, nên không thể khẳng định đã khôi phục được trạng thái trước đó. Từ sau khi sửa thiết lập test, mọi lượt test và kiểm tra UI đều dùng database tạm, không seed lại DB ứng dụng.

## Việc cần thực hiện khi triển khai

1. Tạo JWT_SECRET và GUEST_COOKIE_SECRET ngẫu nhiên, riêng cho môi trường; tối thiểu 32 ký tự. Khóa mẫu cũ sẽ bị từ chối trong production. Nếu VAPID cũ từng được dùng công khai, thay cặp khóa và đăng ký lại các thiết bị push. Không dùng tài khoản/mật khẩu demo trong quán thật.
2. Chạy `npm run db:migrate` trước khi chạy bản mới; migration 003 thêm bảng thu hồi token. `start.sh` đã dừng khi migrate lỗi. Cấu hình FRONTEND_URL đúng origin HTTPS, CORS_ORIGINS chỉ gồm các origin thực sự được tin cậy.
3. Rà lại grants đã lưu của các membership hiện có. Bản sửa thực thi grants được cấu hình; không tự xóa quyền được cấp rõ ràng trong DB cũ. Seed mới đã bỏ các quyền thanh toán mặc định khỏi waiter.
4. Máy chạy test phải có quyền tạo/xóa DB tạm. Có thể dùng TEST_DATABASE_ADMIN_URL để chỉ định kết nối quản trị test; không trỏ workflow test vào production.
5. Khi dùng tunnel development, khai báo hostname cụ thể trong VITE_ALLOWED_HOSTS và origin tương ứng ở CORS_ORIGINS; không dùng wildcard toàn bộ.

## Giới hạn và hạng mục còn lại

- Frontend còn 7 cảnh báo ở cây công cụ build Tailwind 3: braces/chokidar/micromatch/fast-glob và postcss-selector-parser/postcss-nested/tailwindcss. Audit hiện gợi ý chuyển Tailwind sang major 4; braces tại thời điểm kiểm tra chưa có bản vá tương thích trên registry. Đã thử cập nhật không phá tương thích, không ép nâng major làm thay đổi stylesheet. Không có các gói này trong cây runtime `--omit=dev`; vẫn phải quản lý rủi ro môi trường build, không coi đây là đã xử lý xong.
- Rate limit dùng bộ nhớ từng tiến trình và địa chỉ IP Express mặc định. Production nhiều instance cần store dùng chung và cấu hình proxy tin cậy theo kiến trúc thực tế. Không tự bật tin cậy mọi X-Forwarded-For.
- Chưa thực hiện load test dài hạn, quét hạ tầng TLS/proxy thật, hoặc kiểm thử Web Push khóa màn hình iOS/Android trên thiết bị vật lý.
- QR tĩnh là thông tin để vào bàn đang mở; người có bản chụp/mã QR vẫn có thể dùng từ xa. Nếu cần chứng minh khách đang tại bàn, cần bổ sung mã tham gia xoay vòng/xác nhận nhân viên theo chính sách sản phẩm.
- Luồng hiện tại và test gốc chủ động dùng READY ngay khi đóng phiên. Đã giữ hành vi này và sửa mô tả UI/README tương ứng; SPEC_v1.2 ban đầu yêu cầu NEEDS_CLEANING nên vẫn là khác biệt sản phẩm cần biết.
- Các cập nhật menu/CMS đã publish được lấy khi tải lại storefront; chưa bổ sung cơ chế phát sự kiện cập nhật toàn bộ storefront tới mọi khách đang mở trang.
- Tùy chỉnh nâng cao như sắp xếp tùy ý blockOrder/featuredItemIds chưa được triển khai thành trình biên tập hoàn chỉnh. Luồng hiện đã hỗ trợ các layout và block toggles đang có trong UI.

## Tài liệu đối chiếu

Quy tắc xác thực/phân quyền từng phòng, kiểm tra Origin và thu hồi kết nối tham chiếu [OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html). Chính sách đích push theo allowlist tham chiếu [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html). Kiểm tra Origin phía server cho request dùng cookie tham chiếu [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
