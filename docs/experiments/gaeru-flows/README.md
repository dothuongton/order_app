# Thử nghiệm luồng Gaeru trên order_app

Ngày 21/10/2026. Trạng thái: **đặc tả triển khai, chưa có tính năng chạy**.

- Repo thực thi: dothuongton/order_app; baseline `92f81cb83a961dd74caffb98a6316fd73b3ac147`.
- Nhánh tích hợp riêng: `codex/gaeru-flow-experiment`.
- Repo tham khảo: dothuongton/gaeru-soft-source, commit `3f36c9b4733ed9e48a934935ee0d95c55a54c489`.
- Đọc [đánh giá](SOURCE_REVIEW.md), [đặc tả đầu vào nguyên văn](SOURCE_SPEC.md), [ADR thử nghiệm](../../architecture/decisions/0002-gaeru-flow-experiment.md), [lệnh cho Antigravity](ANTIGRAVITY_PROMPT.md).

## 1. Mục tiêu và ranh giới

Tạo một bản thử nghiệm thật: khách yêu cầu mở bàn → nhân viên duyệt → một thiết bị giữ quyền gọi món; các máy khác chỉ xem menu. Đo hiệu quả và ma sát so với mô hình nhiều thiết bị hiện tại. Giữ Express/pg/PostgreSQL + React/Vite/TypeScript + Socket.IO/Web Push/PWA. Học thuật toán và bất biến, không port framework/ORM/D1 hoặc gateway auth từ Gaeru.

Yêu cầu mới của chủ dự án cho phép **thử claim độc quyền trên nhánh/sandbox này**, không thay ADR-0001 cho production/main. Không lấy bản mô tả nguồn làm bằng chứng rằng một tính năng đã được lập trình hoặc được nghiệm thu trên order_app.

Đơn vị giao hàng đầu tiên chỉ gồm yêu cầu/duyệt bàn, claim/privacy, phục hồi gửi đơn, hỗ trợ và thông báo liên quan. Giữ nghiệp vụ tiền/đóng phiên hiện tại. Thu từng lần, RBAC mới, đổi bàn và settings là các giai đoạn riêng có cổng nghiệm thu; không làm tất cả trong một PR.

## 2. Cô lập, ownership và quy trình nhánh

1. Core owner duy nhất: `dothuongton`; Antigravity triển khai, Codex review. Không sửa `backend/src/modules/admin/**`, `frontend/src/pages/admin/**` trừ AdminLogin theo ownership hiện có, hoặc namespace admin của Sang. Không nhập chuỗi PR CMS105–112 chưa nghiệm thu.
2. Nhánh tích hợp chỉ nhận từng PR giai đoạn đã review. Feature branch tuần tự `codex/gaeru-01-request-claim`, `codex/gaeru-02-order-recovery`, ... tạo từ head tích hợp đã nghiệm thu. **Base PR là codex/gaeru-flow-experiment, không phải main.** Không push code trực tiếp main/tích hợp, không tự merge/deploy.
3. Checkout riêng; không đổi/reset/stash checkout Core đang sửa PR113. Branch khác không tự loại được merge conflict: cùng GuestContext/StaffService/schema vẫn phải có một người giữ tệp và một task coding Core hoạt động mỗi lúc. Trước coding, ghi bàn giao file/branch/task đang giữ #2/#6; không tự chạy thêm agent hoặc cho hai tiến trình cùng sửa các tệp Core. Nếu task Core cũ còn chạy, chỉ làm tài liệu/test inventory cho đến khi bàn giao, không viết đè hay dừng tiến trình của người khác.
4. #100/PR113 và #71 vẫn là công việc production độc lập. Không cherry-pick PR113 đang có blocker; không lấy code GuestContext từ nhánh khác theo tên mà không kiểm SHA/diff. Sửa đã được merge main sau này chỉ đưa sang bằng sync có review và regression. Không đưa migration thử nghiệm ngược vào main.
5. DB sandbox hoàn toàn riêng, dữ liệu giả/được phép sử dụng; không dùng DATABASE_URL, cookie domain, VAPID keys, push subscriptions hoặc token production. Không copy file .env production. Chưa được phép tạo/deploy thêm dịch vụ Render trong task tài liệu này. Sau này chỉ deploy service thử nghiệm riêng khi chủ dự án yêu cầu, tuyệt đối không đổi branch auto-deploy của order-app.
6. `ORDERING_MODE=multi_device|approved_single_device` do server quyết định, mặc định giữ multi_device. Chỉ bật approved_single_device trong sandbox có nhận diện môi trường/database riêng; frontend đọc capability từ server, không dùng localStorage/query để bật quyền. Startup của profile thử nghiệm phải từ chối nếu không khai báo sandbox rõ; test/profile tuyệt đối không mặc định trỏ tới production.
7. Không sửa stack/dependency, không đổi QR đang in, không mặc định tin header oai-authenticated-* của Sites. Không trộn gateway payment, refund, POS/offline, printer, SaaS billing hoặc rewrites vào thử nghiệm.

## 3. Ánh xạ đúng code hiện tại

| Nội dung | Hiện có ở main92f81cb | Cách triển khai |
|---|---|---|
| Phiên bàn | table_sessions OPEN/CLOSED; unique một OPEN/bàn | Thêm trạng thái chờ bằng migration; không thay toàn enum theo chữ thường của nguồn |
| Guest auth | guest_sessions, token hash, join công khai, scoped API/socket | Claim-mode phải thay quyền join và chặn bypass API/socket; không chỉ ẩn nút |
| Đơn | orders, order_items snapshot, order_item_parts, unique session/idempotency | Giữ bảng, giá và partial quantity; thêm phần thiếu có regression |
| Idempotency | idempotency_records + payload_fingerprint | Tái sử dụng helper; ghi rõ code lỗi đang có và adapter, không đổi global error tùy ý |
| Tiền hiện tại | bills + bill_lines + manual_settlement_confirmations, một settlement/phiên, settlement_version | Không dựng thêm receipt/paid_at rồi cộng tiền qua hai đường |
| Quyền | memberships.role + permissions[], middleware đọc membership; owner/manager implicit full | Không tuyên bố hiện chỉ có ba role thô, không thay toàn bộ bằng bộ10 quyền mới |
| Staff gọi hộ | orders.source có STAFF_POS, nhưng chưa thấy endpoint/UI staff tạo đơn ở baseline | Không giả định tính năng đã có; xây một adapter Staff nhỏ có quyền nếu cần nghiệm thu, dùng validation/pricing chung |
| Hỗ trợ | service_requests có id,call_count,status và unique active request/type/session | Kiểm thế hệ thực; dùng id+generation/call_count nếu cùng một row được dùng lại |
| Đổi bàn | guest_sessions và service_requests có table_id; orders dựa session_id | Không thêm table_id vào mọi bảng chỉ vì nguồn có; cập nhật các reference sống thật sự tồn tại |
| Realtime | Socket.IO kiểm membership/guest_session; Web Push đã có cấu hình VAPID | Giữ transport, thêm sự kiện sau commit và scope claim cho room/delivery |

## 4. Luồng yêu cầu mở bàn và claim (bắt buộc giai đoạn1)

### 4.1 Trạng thái và đồng thời

Dùng `PENDING_APPROVAL`, `OPEN`, `CLOSED` trong trạng thái phiên hiện tại; từ chối/hết hạn được đóng bằng close_reason riêng, không sinh bill doanh thu cho yêu cầu chưa phục vụ. Không đổi spelling OPEN/CLOSED ở module đang dùng.

- Public QR chỉ menu/CMS và trạng thái tối thiểu trống/đang chờ/đang có khách. Không trả guest_name, session ID của nhóm khác, orders/bill hay token.
- `requestId` UUID, tên khách hiển thị trim tối đa80ký tự, không HTML; cookie của cùng thiết bị dùng lại. Yêu cầu mới tạo phiên chờ và giữ bàn trong một transaction; retry cùng requestId/payload trả cùng kết quả; thay payload cùng key trả409 theo contract. Timeout không tự tạo request mới.
- Unique index theo table_id với predicate status IN ('PENDING_APPROVAL','OPEN'); preflight dữ liệu trước tạo index, không xóa phiên để làm migration xanh. Mở trực tiếp từ Staff, duyệt chờ và request guest đều dùng cùng khóa bàn/index, không ba cơ chế giữ bàn riêng.
- Staff duyệt/từ chối với expectedVersion, permission hiện hành (`session.open` hoặc mapping được ghi trong contract). Recheck tenant active, trạng thái, quyền và thời hạn bên trong transaction trước commit. Chỉ một kết quả thắng giữa approve/reject/expire; loser nhận conflict rõ.
- Phân biệt requested_at và approved_at; opened_at phản ánh lúc thực sự được mở, không dùng thời gian chờ duyệt để báo thời gian phục vụ. Khởi tạo bill hiện hành đúng một lần lúc OPEN; pending bị từ chối/hết hạn không tạo giao dịch thu.
- Pending expires_at = thời gian server +15phút. Kiểm hết hạn ngay trong read/write/approve và có cleanup idempotent nếu cần; chỉ cron/UI timer là chưa đủ. Approval đúng/sau expires_at không được mở bàn; node restart không làm đổi thời hạn. Expire/withdraw/reject giải phóng bàn trong transaction và không đánh dấu đã thu tiền.
- Khách được rút đúng yêu cầu chờ của mình. Mặc định tối đa6 yêu cầu mới/10phút/device; retry không trừ thêm. Đây chỉ là một lớp: thêm hạn mức hợp lý theo table/tenant/IP với proxy đáng tin, không dựa header IP tự khai. Cookie có thể xóa nên không coi đây là chống bot hoàn chỉnh. Các giới hạn phải server-side và không lộ PII.

### 4.2 Cookie, quyền và privacy

- Cookie `__Host-order-device`, random ít nhất32bytes, Secure/HttpOnly/SameSite=Lax/Path=/, không Domain. Tạo khi chưa có, không cấp lại cookie mỗi lần mở tab/request làm mất claim đang có. DB chỉ giữ hash; không lưu cookie raw trong JS/localStorage/log.
- Tách device identity khỏi lease/claim của phiên; một active claim/session, có claim_version độc lập. Không dùng settlement_version hoặc updated_at thay cho claim/session mutation version vì các trường có ý nghĩa khác.
- Mọi guest write và đọc dữ liệu riêng phải kiểm tenant/session/current location/OPEN/approved/device hash/claim_version trong transaction hay điều kiện SQL của thao tác đó. Middleware check rồi await/write không có kiểm lại là chưa đủ. Join công khai và guest token cũ không được mint/bypass claim-mode.
- Origin/CSRF cho cookie-auth mutation, CORS credentials theo exact allowlist, không wildcard. JWT Staff không thay thế guest claim. Không đọc cookie HttpOnly bằng JS; socket phải xác thực server-side từ cookie/claim hoặc capability ngắn hạn có scope được thiết kế rõ, không lấy quyền từ tableId do client gửi.
- Máy không claim không đọc snapshot/order/bill/receipt của nhóm khác qua REST, Socket.IO, cache hoặc replay join. Public DTO tách khỏi private DTO. Trước duyệt, thiết bị requester chỉ đọc trạng thái yêu cầu của chính nó, không dùng guest OPEN token.
- Reload/multitab cùng browser cookie giữ quyền; stale response từ bàn/phiên trước không ghi token/state/storage của phiên mới. Profile browser/ẩn danh/xóa cookie mới không tự lấy claim.
- Staff mở trực tiếp là phiên OPEN chưa gắn claim. Máy quét QR không được tự chiếm phiên đó; phải yêu cầu gắn claim và Staff duyệt. Nếu thêm gọi hộ, route Staff xác thực và pricing/option validator chung, không giả làm guest hoặc bỏ permission.
- Mất cookie: Staff có quyền quản lý claim thực hiện release có lý do + audit, revoke lease cũ ngay; thiết bị thay thế gửi yêu cầu cho **cùng phiên**, vẫn phải Staff duyệt, không first-come-first-served giành quyền chỉ vì vừa release. Không đóng/mở phiên hoặc mất đơn để sửa claim. Quyền mới `session.claim.manage` nếu dùng phải có mapping/migration tối thiểu và test; không biến thành RBAC rewrite.
- Close/revoke/reassign tăng claim generation và vô hiệu API/socket cũ ngay sau commit. Giữ cookie thiết bị toàn host nếu cần các phiên khác; revoke lease chứ không giả định xóa cookie đã thu hồi mọi token. Đơn/biên nhận cũ giữ nguyên. Receipt đóng phiên của chủ trước chỉ được đọc theo capability lịch sử có scope như contract hiện có, không tái cấp quyền phiên mới; ghi rõ contract trước implement.

### 4.3 Contract API đề xuất để khóa trong P0

Prefix thực là `/api/v1`. Đây là contract đích, chưa phải endpoint đã có. Tên cuối cùng ghi trong IMPLEMENTATION_PLAN trước coding; không tạo hai API làm cùng việc.

| Method/path | Ai dùng | Điều kiện/hành vi |
|---|---|---|
| POST /public/tables/:qrId/open-requests | Cookie thiết bị | requestId,guestName; tạo/replay pending của mình, không mint OPEN guest token |
| GET /public/tables/:qrId/open-requests/mine | Cookie thiết bị | Chỉ trạng thái yêu cầu của mình; không session/bill của nhóm khác |
| DELETE /public/open-requests/:id | Thiết bị đã yêu cầu | expectedVersion/requestId; withdraw pending của chính mình |
| GET /staff/open-requests | Staff có quyền | Bounded list scope tenant; pending chưa hết hạn, không quyền public |
| POST /staff/open-requests/:id/approve | Staff session.open | requestId,expectedVersion; atomic pending→OPEN/expiry conflict |
| POST /staff/open-requests/:id/reject | Staff session.open | requestId,expectedVersion,reason; giải phóng và audit |
| POST /staff/sessions/:id/claim/release | Staff session.claim.manage | requestId,expectedVersion,reason; revoke đúng lease, không close phiên |
| POST /public/tables/:qrId/claim-requests | Cookie mới | Xin lease cho phiên Staff mở/released; không auto gán quyền hoặc trả private session DTO |
| POST /staff/claim-requests/:id/approve hoặc reject | Staff session.claim.manage | Xác nhận replacement đúng request/current claim version |
| POST /public/tables/:qrId/join (hiện có) | Guest | multi-device mode giữ hành vi; claim-mode chỉ resolve lease đã được approve, không bypass |

Mọi mutation có idempotency scope tenant/entity/action/requestId + canonical payload. Public không đủ quyền trả403 GUEST_ACCESS_DENIED nhất quán, không lộ vì thiếu cookie/phiên khác/claim bị revoke; lỗi field của chính request vẫn400. Staff thiếu quyền403, stale version/expired/table busy409 có code phân biệt được UI; rate limit429. Reuse409 IDEMPOTENCY_KEY_REUSED hiện có hoặc adapter đã ghi rõ; không đổi lỗi toàn hệ thống chỉ để khớp tên nguồn. ETag/version không chứa secret. GET public menu/session projection phải sửa cùng contract để không rò ID/tên/đơn của người khác.

## 5. Toàn vẹn đơn và hỗ trợ (giai đoạn2)

- Một intent có requestId và canonical payload hash riêng, scope tenant/session/action. Canonical hóa option IDs đúng món; không thay idempotency key trên timeout hoặc tự retry payload khác.
- Pending submission bất biến lưu theo session + requestId; mutable cart tách riêng. Tab khác không ghi đè hoặc xóa pending của tab này. Reload khôi phục hộp Kiểm tra lần gửi món; storage bị chặn phải báo chưa thể bảo đảm phục hồi sau reload, không nói đã lưu.
- Replay đã commit trả snapshot gốc, không định giá lại khi menu đã đổi. Nếu request trước chưa commit và server chưa chấp nhận giá, **không dùng giá client cũ làm giá thật**: server tính lại, mismatch trả lỗi xác nhận mới và intent mới sau quyết định của người dùng. Phân biệt hai tình huống này trong test.
- Snapshot tên/giá/options được lưu server; không sửa bill snapshot sau sửa menu. Giữ partial accepted/served/cancelled quantities, tổng tiền và promotion cấp phiên của main. Không tự thêm trạng thái READY hoặc prep-ticket chỉ để khớp nhịp trạng thái của nguồn; đó là thay đổi riêng.
- Giới hạn thử nghiệm: ≤30 dòng lựa chọn chuẩn hóa, ≤60 phần/tổng request, ≤20 phần cho cùng lựa chọn. Định nghĩa line key gồm món + tập option + ghi chú chuẩn hóa; không gộp mất ghi chú. API enforce cả khi bỏ UI; không áp ngược các giới hạn mới lên đơn lịch sử.
- Hỗ trợ/checkout request: ghi chú≤300ký tự, generation tăng khi phát sinh lần mới. Acknowledge nhận requestId+expectedGeneration và UPDATE với đúng hai điều kiện; old ack không đóng new request. Gọi lặp cùng intent không tạo nhiều thông báo. Giữ idempotency + tenant scope.
- Sự kiện request/open/order/service sau commit; payload nhỏ có eventId,tenantId,sessionId,entityVersion. Client bỏ event cũ/out-of-order và resync sau reconnect. Baseline load không đọc lại lịch sử thành đơn mới; badge pending theo server, không mất vì popup đã xem.
- Giữ Socket.IO + Push, không thay bằng polling3giây vô điều kiện. Chỉ một cơ chế fallback bounded khi socket mất, có backoff và visibility handling. Provider accepted không chứng minh iPhone đã nhận. Speech chỉ foreground sau tương tác; không yêu cầu microphone. Chỉ đánh dấu spoken khi speech start, dedupe socket/push/reconnect theo eventId mà không bỏ sự kiện hợp lệ.

## 6. Đổi bàn và lịch sử (giai đoạn3)

Tách khỏi claim MVP nhưng không chờ phải viết lại payment mới. Đổi bàn phiên hiện có qua `POST /staff/sessions/:id/transfer`: requestId,fromTableId,toTableId,expectedSessionVersion; dùng integer version thay timestamp mong manh.

- Cùng tenant; kiểm quyền mới/mapping đã chốt và tenant status trong transaction. Khóa tenant/session và hai table theo thứ tự xác định, không đảo lock order giữa request/approve/transfer/close. Bàn đích không pending/open, đang enabled và sẵn sàng nhận khách. Index là hàng rào cuối, map conflict409, không500 thô.
- Giữ sessionId,claim,cart/pending request/session timestamps và toàn bộ đơn/options/tiền đã ghi. Cập nhật table_sessions.table_id và guest_sessions/service_requests reference sống thật; orders đã join theo session thì không thêm duplicate table_id.
- Transfer log append có request hash; replay cùng request trả kết quả gốc + vị trí hiện tại, không move lần2, kể cả vòng A→B→A. Idempotency lookup và authorize đúng scope trước kiểm version; stale operation mới trả conflict.
- Receipt/bill đã chốt là bất biến: giữ bàn tại thời điểm thu/ghi chứng từ; vị trí hiện tại đọc từ session hoặc projection. Không UPDATE table snapshot trên mọi receipt như đề xuất B.7.3. Reports phải nói rõ bàn hiện tại hay bàn tại lúc thu, không di chuyển doanh thu lịch sử âm thầm.
- Guest theo session, không khóa vào QR nguồn trong URL; credential vẫn kiểm current table do server resolve. Quét QR nguồn sau chuyển không lộ nhóm đã đi; retry order cũ không tạo mới. Chuyển bàn không phát đơn mới, không đóng/thu tiền.
- Lịch sử đóng phiên/hỗ trợ/chuyển bàn lọc ngày VN theo Asia/Ho_Chi_Minh, khoảng [startOfDay,nextStartOfDay); tổng trên toàn filter, không chỉ page20 hoặc recent200. Phân trang ổn định created_at/id hoặc cursor.

## 7. Thu từng lần gọi và quyết toán mới (giai đoạn4, chờ contract tiền)

Đây là thay đổi domain tiền, **không phải chỉ thêm nút và ba bảng**. Trước coding phải có design/review riêng gắn#53/#6, không nhét vào claim PR.

- Chốt đơn vị thu (cả order hay từng phần đã phục vụ), xử lý partial cancel/serve, order0đ và đang chờ. Không mặc định toàn order đã paid trong khi chỉ một phần served.
- Chốt phân bổ discount cấp phiên (fixed/percent/cap), làm tròn VND, phần còn lại sau thu trước và khi promo đổi. Không áp giảm hai lần hoặc sửa receipt trước. Giữ quota redemption đúng một lần theo chính sách đã chốt.
- Chỉ một nguồn doanh thu: payment receipts mới hoặc manual_settlement_confirmations có adapter được phê duyệt. Không cộng cả hai và không thêm unique session settlement cũ lần nữa khi đóng.
- Receipt có tenant/session/requestId/action + payload hash; concurrency exactly-once thông qua DB constraint và transaction, replay authorization đúng người/scope. expected orderIds/quote phải khớp chính xác, không chỉ SUM. Thu từng lần và cả bàn không được overlap phần đã thu. Payment method là khai báo Staff, không xác minh ngân hàng.
- Nếu bật manual split-pay, close là thao tác riêng theo các điều kiện tài chính mới và immutable settlement snapshot. Lỗi ghi snapshot rollback cả close; không tự phục vụ/hủy món để chốt. Khi chưa bật giai đoạn này, giữ đóng phiên hiện hành, gồm lý do close-without-charge theo quyền; không ép nhân viên đi qua payment mới để thử order.
- Sau chốt contract mới áp limit≤600orders/lần xác nhận; quote,unknown-result recovery,write-once paidAt và reporting theo paidAt phải có regression với partial quantities/promotions. Không gateway/refund/POS trong phase này.

## 8. Quyền và settings (giai đoạn5)

Không thay toàn permissions hiện có bằng mười tên mới. Lập mapping capability/server checks trên memberships hiện có; quyền mới tối thiểu cho claim/transfer. Phân quyền chi tiết, bảo vệ owner, chống self-escalation, optimistic version và recheck actor trước commit là task riêng đồng bộ#37–#40/#6, không sửa namespace admin của Sang. Account mutation + audit cùng transaction; quyền thu hồi chặn API/socket lần tiếp theo.

Settings popup1–30s, text/image100–250%,contrast và draft/save là backlog#43/CMS Core sau luồng vận hành; phải kiểm bảng/settings API nào hiện có trước quyết định JSONB. Không tuyên bố không cần migration khi chưa đối chiếu schema. Bản đầu có thể dùng cấu hình hiện hành, không phải làm designer mới.

## 9. Test bắt buộc trước demo/merge vào nhánh tích hợp

| ID | Ca kiểm tra và kết quả cần có |
|---|---|
| EX01 | Hai device + Staff open/approve/expiry cùng bàn thật sự overlap: một pending/open, không duplicate/no500, loser nhận trạng thái đúng |
| EX02 | Pending15phút qua restart; approve/reject/withdraw/expiry tại ranh giới chỉ một kết quả; retry không giữ bàn lần2 |
| EX03 | Không claim/legacy token/tự gán session/khác tenant không đọc bill/orders/room hoặc ghi; public response không lộ guest_name/token |
| EX04 | Claim reload và hai tab tiếp tục; xóa cookie/new profile không chiếm; release/reassign/cross-origin request bị kiểm soát |
| EX05 | Lost response sau commit→một order cùng snapshot; trước commit+menu đổi→không tự nhận giá client; cùng key khác payload409 |
| EX06 | Payload limits30/60/20 ở API; valid0đ option; repeat same dish ở lần mới hợp lệ; partial serve/cancel invariants và promotion unchanged |
| EX07 | Old support ack không đóng generation mới; giữ ghi chú và scope qua reconnect/close/transfer |
| EX08 | Late HTTP/socket khi switch tab/table/tenant/claim không ghi state mới; request cũ không làm loading kẹt hoặc xóa loading operation mới |
| EX09 | Close/reopen/revoke chặn API/socket cũ; closed own receipt không lộ phiên sau; lưu lịch sử còn nguyên |
| EX10 | Transfer vs transfer/request/close concurrent, replayA→B→A và unknown-result; session/cart giữ nguyên, receipt không đổi, không notification mới giả |
| EX11 | Finance phase: split/all overlap, discount allocation, replay sau close, no double revenue, close snapshot failure rollback |
| EX12 | Revoked Staff action trong lúc chờ không commit; owner/self-escalation/version conflict và audit rollback |
| EX13 | Hai mode: suite gốc vẫn xanh; branch disabled giữ hành vi main. Migration old/fresh/rerun/failure/restore DB thử, không nuốt lỗi hoặc xóa dữ liệu |
| EX14 | Browser thực với API/DB sandbox: iPhone PWA/Android/desktop, pending/reject/reclaim, offline/reload; tách viewport emulation với thiết bị thật |
| EX15 | Event dedupe/order/badge qua reconnect; provider accepted và device received ghi tách; TTL/rate limit không tin cookie/IP là bằng chứng hiện diện |

Dùng Postgres connections và barrier/lock để ép lịch đồng thời; Promise.all không đủ nếu các thao tác đã commit tuần tự. Không gọi sqlite batch tests của nguồn là Postgres race tests. Kiểm assertion giá trị, cleanup trong finally, server/Chrome ports riêng; không giả địnhlocalhost4000/5173 là test environment. Không tạo/sửa quán hoặc đơn production để lấy ảnh.

## 10. Thứ tự bàn giao và tiêu chí chọn mô hình

- **P0 — inventory/contract:** branch, DB isolation, state/API/error mapping, lock order, public/private DTO, source map và regression list. Không implementation claim còn thiếu contract. Bản tài liệu hiện tại là đầu vào P0, chưa thay inventory thực tế của Antigravity.
- **P1 — request/approval/claim:** EX01–04,08–09,13–15 liên quan. Demo hai browser độc lập; không finance/transfer/RBAC rewrite.
- **P2 — order recovery/support/events:** EX05–08,13–15; reuse code đã có, chỉ bù thiếu. Đủ P1+P2 mới so trải nghiệm quán với main.
- **P3 — transfer/history:** EX07–10,13; immutable snapshot và live references có contract.
- **P4 — manual receipts/close:** EX11 và contract tiền ở mục7 được review trước.
- **P5 — quyền/settings:** EX12 và UI/accessibility, dependencies Core identity rõ ràng.

Mỗi pha một task coding/feature branch/PR target integration; review xong pha trước mới nhận pha sau. Reuse#52 cho thử nghiệm claim;#61/#70 cho recovery/support;#53 cho contract finance;#43 cho settings;#6 cho shared capabilities. Không tạo issue implementation trùng hoặc tự đóng backlog production chỉ vì sandbox đạt.

Đo bằng event/timestamp không chứa tên khách/token: thời gian QR→request→duyệt→đơn đầu; tỷ lệ bỏ bước chờ/từ chối/hết hạn; thời gian Staff xử lý; số lần release/reclaim; sự cố gửi trùng/mất trạng thái. QR→đơn đầu so với baseline gồm cả thời gian chờ, không chỉ thời gian sau duyệt. Không tự ấn định thắng/thua hoặc phần trăm cải thiện trước số liệu; báo cỡ mẫu và môi trường. Tên khách không được coi là xác thực hiện diện. Chỉ cân nhắc main sau demo thực, đối chiếu số liệu và quyết định riêng của chủ dự án.
