# Đánh giá lại toàn bộ QR Order — 20/10/2026

## Kết luận

**NOT READY để vận hành production với dữ liệu kinh doanh cần bảo toàn.** Bản hiện tại build được, 81 test có sẵn đạt và website Render phản hồi health thành công; tuy nhiên có một lỗi P0 về tài khoản quản trị cùng nhiều lỗi P1 về tính tiền, tùy chọn món và bảo toàn hóa đơn. Trạng thái website chạy được không đồng nghĩa các nghiệp vụ này đúng.

- Nhánh: `main`; HEAD: `1a773f7a428ca8756c9bce3a6e388cdc4ea21312`.
- Checkout sạch trước đánh giá. So với bản audit trước `25547d1`, 42 file đã đổi, khoảng 5.576 dòng thêm và 594 dòng xóa.
- Phạm vi: backend, frontend, schema/migrations/startup, auth/RBAC/realtime/push, menu/option groups, CMS, pricing/settlement/reporting, PWA và cấu hình triển khai.
- Runtime: test và các ca tái hiện đều dùng PostgreSQL tạm ở máy local. Production chỉ đọc `/health`, nhận đúng commit HEAD. Không đăng nhập bằng tài khoản mặc định hay khai thác các phát hiện trên production.
- Lượt này là **đánh giá**, không sửa mã nghiệp vụ, không push/deploy hoặc đổi secret production. Các file mới là báo cáo, ma trận API và công cụ/bằng chứng tái hiện local.

## Kiểm tra cơ sở

| Hạng mục | Kết quả thực tế | Giới hạn |
|---|---|---|
| Backend tests | 6 file, **81/81 đạt** | Không bao phủ các lỗi mới dưới đây; test xanh không phủ nhận bằng chứng tái hiện. |
| Backend/frontend build | Đạt | Dùng dependency hiện có, không chạy lại `npm ci` từ checkout mới. |
| Dependency backend | `npm audit`: 0 cảnh báo | Chỉ theo registry ở thời điểm kiểm tra. |
| Dependency frontend | 7 cảnh báo: 5 high, 2 moderate | Đều trong cây development của Tailwind 3; không được coi là đã khắc phục. |
| Runtime dependency tree | `npm ls --depth=0` backend/frontend đạt | Không phải kiểm tra supply chain toàn diện. |
| Docker | **BLOCKED** | Có CLI nhưng Docker daemon không chạy; không tuyên bố Docker build/start đạt. |
| Render | `/health` trả OK và đúng HEAD | Chỉ là kiểm tra khả dụng cơ bản, không kiểm chứng mọi luồng production. |
| iOS/Android khóa màn hình | **Chưa kiểm tra thiết bị thật** | Không đảm bảo chuông/push nền chỉ từ đọc mã hoặc test Node. |

## Phát hiện đã xác nhận

P0: cần xử lý ngay vì ảnh hưởng quyền quản trị. P1: cần xử lý trước khi tin cậy thu tiền/lưu dữ liệu thực. P2: cải thiện độ đúng, vận hành và phòng vệ. Severity là đánh giá trong phạm vi mã nguồn và tái hiện local, không phải khẳng định đã có tấn công thực tế.

| ID | Mức | Phát hiện | Chứng cứ nguồn | Xác minh | Hướng xử lý đề xuất |
|---|---|---|---|---|---|
| SEC-01 | **P0** | Boot và migration ghi đè Super Admin về mật khẩu mặc định công khai, đồng thời gán quyền platform admin | `backend/src/db/auto-migrate.ts:235`, `backend/src/db/migrate.ts:34`, `backend/src/db/migrations/004_superadmin_user.sql:3` | **CONFIRMED runtime**: đặt một mật khẩu mạnh ngẫu nhiên trên DB tạm; chạy boot hoặc migrate thì mật khẩu đó không còn dùng được. | Bỏ tạo/reset tài khoản mặc định khỏi cả 3 đường chạy. Bootstrap quản trị riêng, một lần, có kiểm soát; không cập nhật password/role ở startup. Sau khi sửa, chủ dự án xử lý mật khẩu/session có khả năng đã bị ảnh hưởng và rà audit log. Chỉ đổi mật khẩu hiện tại mà chưa sửa startup sẽ không bền vững. |
| SEC-02 | **P1** | Private key VAPID được hardcode trở lại và dùng khi không có cấu hình môi trường, kể cả production | `backend/src/config/index.ts:21` | **CONFIRMED static**. Không chép giá trị khóa vào báo cáo; chưa đọc env production để biết có override hay không. | Bỏ fallback private key; cấu hình secret riêng, rotate theo kế hoạch và đăng ký lại subscription khi cần. Không suy rằng riêng khóa này đủ để giải mã mọi push hay chiếm tài khoản. |
| DATA-01 | **P1** | Xóa bàn đã đóng xóa luôn phiên/hóa đơn/xác nhận thu tiền do FK CASCADE | `backend/src/modules/staff/staff.routes.ts:1063`, `backend/src/db/schema.sql:57`, `backend/src/db/schema.sql:238` | **CONFIRMED HTTP+DB**: DELETE trả 200, hóa đơn đã chốt còn 0 dòng, doanh thu giảm 220.000 → 120.000đ. | Dùng disable/archive bàn hoặc chặn xóa khi đã có lịch sử. Giữ ledger/bill snapshot và định danh bàn lịch sử. Rà kế hoạch thay FK/soft delete, backup và đối soát trước migration; không tự sửa/xóa dữ liệu lịch sử. |
| BUS-01 | **P1** | Server không xác thực tùy chọn thuộc đúng món; không cưỡng chế SINGLE/min/max/nhóm active; ID không tồn tại bị bỏ qua | `backend/src/modules/pricing/pricing.service.ts:91`, `backend/src/modules/pricing/pricing.service.ts:160` | **CONFIRMED runtime** cả 5 ca: chọn option của món khác; bỏ nhóm bắt buộc; chọn 2 trong nhóm SINGLE; ID lạ; nhóm inactive. | Load nhóm theo tenant và menu item, validate toàn bộ lựa chọn trước tính giá; từ chối ID lạ/sai chủ sở hữu/nhóm tắt và sai min/max. Khống chế độ dài mảng option IDs. Giữ tương thích có chủ đích với variant legacy. |
| BUS-02 | **P1** | Chính sách “khuyến mãi theo tổng phiên” chưa thực sự thay thế cách tính theo từng lần gọi | `backend/src/modules/guest/guest.service.ts:397`, `backend/src/modules/guest/guest.service.ts:425`, `backend/src/modules/guest/guest.service.ts:819` | **CONFIRMED runtime**: hai lượt 120.000đ, giảm cố định 20.000đ cho tổng phiên từ 100.000đ; kết quả 200.000đ, đúng chính sách mới phải là 220.000đ. | Dùng một pricing policy cấp phiên, một nguồn tính tiền cho cart/order/bill/settlement. Quy định chuyển tiếp đơn đã có discount snapshot; không âm thầm sửa đơn lịch sử. |
| BUS-03 | **P1** | Đọc lại bill CLOSED vẫn tra khuyến mãi hiện tại, không dùng snapshot bill đã chốt | `backend/src/modules/guest/guest.service.ts:780`, `backend/src/modules/guest/guest.service.ts:833`, `frontend/src/pages/staff/ReceiptDetailModal.tsx:32` | **CONFIRMED runtime**: trước thu 100.000đ, settlement/bill lines 100.000đ; sau khi lượt khuyến mãi hết, cùng API summary trả 120.000đ. Không cần sửa đơn để tái hiện. | Bill CLOSED lấy số tiền/dòng từ bills + bill_lines và snapshot promotion đã chốt. Đừng tính lại theo chương trình đang active. |
| BUS-04 | **P1** | Settlement version không bảo vệ thay đổi khuyến mãi: cùng version vẫn chốt số khác số đã hiển thị | `backend/src/modules/staff/staff.service.ts:711`, `backend/src/modules/staff/staff.service.ts:747` | **CONFIRMED runtime**: xem bill 100.000đ → tắt chương trình → gửi nguyên version → thu 120.000đ, không báo SUMMARY_CHANGED. | Ràng buộc version/fingerprint với toàn bộ dữ liệu quyết định số tiền hoặc dùng snapshot báo giá được xác nhận. Khi số tiền đổi phải yêu cầu nhân viên xem/xác nhận lại. |
| BUS-05 | **P2** | Báo cáo giá trị món chưa phân bổ giảm giá cấp phiên; thiếu trace redemption cho nhánh này | `backend/src/modules/reports/reports.routes.ts:33`, `backend/src/modules/staff/staff.service.ts:772` | **CONFIRMED**: phiên thu 100.000đ nhưng đóng góp 120.000đ vào thống kê món; `promotion_redemptions` của khuyến mãi cấp phiên có 0 dòng. | Tách rõ gross/net trong báo cáo hoặc đọc/phân bổ từ bill snapshot. Lưu promotion ID/giá trị/lượt redeem cấp phiên. Thống kê món hiện gồm cả phiên OPEN đã phục vụ nên không so tổng món và tổng đã thu một cách máy móc. |
| BUS-06 | **P1** | Giới hạn lượt khuyến mãi cấp phiên không nguyên tử giữa các phiên | `backend/src/modules/staff/staff.service.ts:712`, `backend/src/modules/staff/staff.service.ts:774` | **CONFIRMED concurrency**: max_redemptions=1, hai phiên cùng chốt thành công và current_redemptions=2. Trigger chậm 0,5s chỉ tồn tại trong DB tạm để ổn định cửa sổ cạnh tranh. | Claim lượt bằng UPDATE có điều kiện/RETURNING hoặc lock phù hợp; xử lý trường hợp hết lượt và thay đổi số tiền theo BUS-04. Không chỉ kiểm tra SELECT trước UPDATE. |
| OPS-01 | **P2** | Auto-migrate nuốt lỗi; chạy server trực tiếp có thể báo healthy khi DB không truy cập được | `backend/src/db/auto-migrate.ts:253`, `backend/src/server.ts:13`, `backend/src/app.ts:35` | **CONFIRMED local**: child server trỏ tới PostgreSQL không tồn tại vẫn listen, GET /health trả 200. | Hợp nhất đường migrate, propagate lỗi bắt buộc; phân biệt liveness/readiness và kiểm tra schema/DB ở readiness. `start.sh` vẫn dừng khi bước migrate CLI lỗi; không kết luận mọi lỗi DB trong Docker đều bị bỏ qua. |

### Bằng chứng số liệu

Chi tiết máy đọc được: `docs/audits/2026-10-20-evidence.json`. Công cụ tái hiện: `backend/scripts/audit-2026-10-20.mjs`. Script chỉ nhận kết nối PostgreSQL local, tạo DB `qr_order_test_*`, thao tác trong DB đó rồi xóa khi xong. Không chứa mật khẩu/khóa production và không thay default suite. Script hoàn tất thành công nghĩa là **đã tái hiện/thu thập bằng chứng**, không có nghĩa các nghiệp vụ bị lỗi đã pass.

## Các lớp bảo vệ đang hoạt động tốt

- Test về truy cập chéo tenant, role waiter/cashier, guest token bị thu hồi, chặn Origin lạ, CORS preflight, token logout và room authorization vẫn đạt trong suite hiện có.
- Membership được đọc từ DB; `x-tenant-id` không tự cấp quyền. CMS và Super Admin có ranh giới middleware riêng.
- Order có khóa phiên, ràng buộc unique và idempotency; phần phục vụ/hủy và chốt tiền bảo vệ trạng thái phiên. Các bảo vệ này không tự giải quyết cap promotion dùng chung giữa hai phiên.
- Ảnh upload có whitelist, base64/magic bytes/size và `nosniff`; push endpoint có allowlist provider; subscription có ràng buộc user/tenant.
- CMS có draft/publish/rollback và khóa tenant khi cấp version. Test publish song song và publish sau rollback vẫn đạt.
- Query chính dùng tham số; chưa xác nhận SQL injection hoặc vượt tenant mới trong phạm vi kiểm tra này. Không đồng nghĩa chứng minh toàn bộ project miễn nhiễm.
- Tách DB test đã được giữ lại; các ca tái hiện mới không chạm DB ứng dụng hay production.

## Rủi ro và khoảng trống cần xử lý tiếp

### Auth và bảo mật phòng vệ

Staff/admin bearer token vẫn lưu ở localStorage (`frontend/src/context/AuthContext.tsx:88`, `frontend/src/App.tsx:38`). Đây là rủi ro khi có XSS hoặc script bên thứ ba bị xâm nhập, chưa phải bằng chứng có XSS đang khai thác được. Cần kế hoạch chuyển sang HttpOnly/cơ chế xác thực socket tương thích và CSRF, không đổi giao thức đột ngột làm mất phiên PWA. CSP hiện chưa có; role manager/owner vẫn được full access theo chính sách hiện tại.

Quota upload/tổng dung lượng ảnh theo tenant và throttling các mutation của staff chưa được triển khai thành lớp bảo vệ rõ ràng. Lưu base64 trong PostgreSQL cần theo dõi dung lượng/backup; chưa có đo tải hoặc kiểm thử ảnh trên nhiều thiết bị. Không cần đổi storage/framework để kết luận các lỗi nghiệp vụ phía trên.

### Thông báo, PWA và iOS

- WebSocket và Web Push cùng một event có hai đường gọi âm thanh: `StaffDashboard.tsx:109` và `NotificationContext.tsx:547`; SW gửi postMessage cho các client tại `frontend/public/sw.js:45`. Chưa thấy dedupe dùng eventId xuyên hai kênh. **NEEDS RUNTIME TEST** trên thiết bị có subscription; chưa kết luận mọi lần đều bị chuông trùng.
- `PushContext.tsx:105` báo isSubscribed/granted dựa trên subscription của trình duyệt, sau đó sync backend nhưng bỏ qua lỗi. Backend có thể trả lỗi/409 nhưng UI vẫn thể hiện đã bật. **CONFIRMED static**, chưa test thiết bị thật cho ca này.
- Việc không còn vòng lặp buffer audio 0 mẫu và listener có cleanup là cải thiện tốt. Phát âm thanh nền/khóa màn hình còn phụ thuộc OS/browser/user gesture; chưa có bằng chứng đảm bảo iOS.
- SW hiện tập trung push, không có cache offline/API. Không thấy reload cưỡng bức gây mất giỏ; cũng chưa có quy trình xác nhận update an toàn/đồng bộ phiên sau nâng bản được test E2E.

### Vận hành và hiệu năng

- Không có cấu hình trust proxy rõ ràng trong Express. Rate limit theo IP có nguy cơ gộp nhiều khách sau proxy Render; cần kiểm chứng topology/logs và cấu hình số hop tin cậy, không bật tin cậy mọi X-Forwarded-For.
- Guest polling mỗi 3 giây gọi nhiều API; getSessionOrders truy vấn item theo từng order; broadcast xác thực lại từng socket bằng DB. Đây là điểm cần benchmark theo số bàn/thiết bị, chưa phải kết luận đã quá tải.
- Có ba nguồn định nghĩa schema: schema.sql, migrations và auto-migrate.ts; migrate chưa có bảng version/tracking, chưa bọc toàn bộ migration theo kế hoạch nhất quán. Cụ thể bảng revoked_tokens trong auto-migrate khác bảng revoked_staff_tokens được auth thực sự dùng.
- `render.yaml` còn AUTO_SEED=true; seed hiện có nhánh tránh ghi đè khi đủ dữ liệu, nhưng production mới/thiếu dữ liệu vẫn có thể được nạp tài khoản demo. Cần cấu hình bootstrap/seed rõ ràng.
- Render Free có rủi ro cold start, kết nối realtime bị ngắt và giới hạn tài nguyên; chưa có load test, restore test backup, kiểm chứng HA hoặc cảnh báo vận hành. Không đề xuất keep-alive để né giới hạn dịch vụ.

### Chất lượng code và test

Cấu trúc modular monolith phù hợp quy mô hiện tại, nhưng logic mới đang nhân bản: pricing khuyến mãi ở tạo đơn/summary/settlement/frontend; schema ở ba đường; DTO đồng thời snake_case và camelCase; legacy variants và item_options cùng tồn tại. `staff.routes.ts` trên 1.000 dòng và UI quản lý menu trên 1.000 dòng làm việc review/đổi tính tiền dễ bỏ sót. Nên gom đúng điểm dùng chung sau khi đã có test thể hiện chính sách, không viết lại toàn hệ thống.

Repo có backend tests nhưng chưa có script test frontend/E2E hoặc CI workflow trong `.github`. Những ca còn thiếu nổi bật là bootstrap admin giữ mật khẩu sau restart; xóa bàn bảo toàn sổ sách; tùy chọn sai món/sai cardinality; session promotions có nhiều lượt gọi; promotion cap race; summary CLOSED bất biến; số tiền đổi sau màn xác nhận. Các ca tái hiện ở lượt này là đầu vào để chuyển thành test hồi quy khi sửa.

## Ma trận phạm vi chức năng

| Nhóm | Mức đánh giá hiện tại |
|---|---|
| Khách quét QR/join/order/trạng thái | Các luồng cơ bản có backend test; tùy chọn món và khuyến mãi còn P1. |
| Nhân viên mở bàn/nhận/phục vụ/hủy/chốt | Có test giao dịch và RBAC; P1 ở chốt số tiền khi promotion đổi và xóa lịch sử bàn. |
| Menu/sắp xếp/option groups | CRUD/reorder/happy path có test; enforcement lựa chọn ở server còn thiếu. |
| CMS/banner/ảnh/publish/rollback | Có test isolation/version; upload được rà mã; chưa chạy đầy đủ browser/iOS lại ở lượt này. |
| Super Admin | API có middleware đúng; bootstrap/reset password P0 làm suy yếu bảo vệ đó. |
| Báo cáo/biên nhận | Tổng settlement có snapshot; đọc lại summary và giá trị món còn lệch, P1/P2. |
| Push/realtime/PWA | Room/push ownership có test; keys fallback P1, nhận notification nền/dedupe cần test thiết bị. |
| Deploy/DB | Build đạt, live đúng HEAD; Docker local chưa chạy được; schema/startup/readiness còn P2. |

Ma trận kiểm kê route: [API_MATRIX.md](API_MATRIX.md), gồm 65 route trong module, cộng GET /health và GET /api/v1/public/images/:id ở app.ts. Ma trận thể hiện điểm gắn middleware, không gán nhãn mọi handler đã an toàn.

## Thứ tự khắc phục đề xuất

1. **Ngay:** SEC-01 — loại bỏ reset/tạo tài khoản mặc định trong mọi đường boot/migrate; sau đó người quản trị kiểm tra tài khoản, đổi mật khẩu và thu hồi session phù hợp. SEC-02 — loại private key khỏi source và lập kế hoạch rotate Web Push. Không in khóa/mật khẩu vào log.
2. **Trước khi nhập thêm dữ liệu thực:** DATA-01 — chặn cascade mất ledger; BUS-01 — validate lựa chọn server-side.
3. **Một thay đổi nghiệp vụ có test thống nhất:** BUS-02/03/04/06 — quy định promotion cấp phiên, snapshot số tiền được xác nhận, claim cap nguyên tử, đọc bill CLOSED từ snapshot. Không lẫn chính sách mới với discount lịch sử.
4. **Đối soát:** BUS-05 — gross/net rõ ràng, trace redemption, kiểm tra invoice/report sau sửa.
5. **Sau đó:** startup/readiness/tracking migration, CI + E2E, test iOS, load test, proxy rate limit và backup/restore.

Không nên sửa đơn lịch sử bằng cách tự tính lại khuyến mãi hiện tại. Trước bất kỳ migration làm thay đổi dữ liệu thực cần backup, mẫu đối soát và kế hoạch rollback; chi tiết trong [CODEX_VERIFICATION.md](CODEX_VERIFICATION.md).

## Tiêu chí đối chiếu bên ngoài

Kiểm tra dữ liệu giá/quyền/phụ thuộc tùy chọn trên server phù hợp hướng dẫn [OWASP Business Logic Security](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html). Việc số tiền được chốt phải gắn với dữ liệu nhân viên đã kiểm tra phù hợp [OWASP Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html). Vai trò cặp khóa nhận diện application server của Web Push được mô tả tại [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292.html).
