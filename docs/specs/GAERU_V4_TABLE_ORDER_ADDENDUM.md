# GAERU SOFT V4 — Bổ sung và tối ưu order tại bàn

Ngày: 19/10/2026. Áp dụng cùng Master README V4.0 và phụ lục bảo mật/UI/UX/clean code.

**Trạng thái:** đặc tả triển khai đề xuất, không xác nhận mã nguồn đã đáp ứng. Tài liệu tập trung DINE_IN, không thay đổi định hướng SaaS, marketplace, giao hàng và tài chính.

## 1. Mục tiêu và phạm vi

Hoàn thiện chu trình: mở phiên bàn → khách gọi nhiều lượt → nhân viên duyệt → bếp/bar → phục vụ → chốt bill → ghi nhận tiền → đóng phiên. Ưu tiên nhanh, dễ thao tác, không mất/trùng đơn, không sai tiền và không truy cập chéo quán.

Giữ quyết định của README: khách không cần tài khoản; một thiết bị giữ quyền gọi món mỗi phiên; nhân viên duyệt trước chế biến/in; AUTO/MANUAL/DISABLED; TTS tiếng Việt; dùng lõi đơn chung.

Không tự thêm chia bill, chuyển/gộp bàn, ví khách, đặt cọc hoặc QR khách đặt offline. Các quy tắc chi tiết là phương án triển khai; những lựa chọn còn mở ở mục 15 cần chốt trước khi bật phần liên quan.

## 2. Thuật ngữ và bất biến

| Đối tượng | Ý nghĩa |
| --- | --- |
| Table | Bàn vật lý thuộc một quán |
| TableSession | Một lượt phục vụ nhóm khách; khác phiên đăng nhập |
| Claim | Quyền gửi món của một thiết bị trong phiên |
| Cart | Giỏ nháp, chưa phải đơn |
| Order | Một lượt gửi; gọi thêm tạo order mới cùng session |
| OrderItem | Dòng món với tùy chọn, ghi chú, số lượng và snapshot giá |
| PrepTicket | Phiếu cho trạm chế biến |
| ServiceRequest | Gọi hỗ trợ hoặc yêu cầu thanh toán |
| Checkout | Bản chốt bill có revision, tổng hợp các lượt hợp lệ |
| Payment | Bản ghi thanh toán độc lập với phục vụ và hóa đơn |

- Một bàn tối đa một session chưa đóng; một session tối đa một claim hiệu lực.
- Giỏ chưa gửi không tính bill, không gửi bếp.
- Chỉ số lượng được chấp nhận mới chế biến/in; gọi thêm không in lại món cũ.
- Server quyết định quyền, giá, tổng tiền và chuyển trạng thái.
- Không sửa/xóa âm thầm lịch sử món, bill hoặc tiền.
- Session, quyết định duyệt, chế biến, thanh toán và hóa đơn có trạng thái riêng.

## 3. Vòng đời phiên bàn và claim

| Trạng thái | Hành động | Chuyển tiếp |
| --- | --- | --- |
| OPEN | Gọi món, duyệt, chế biến, hỗ trợ | Bắt đầu chốt → CHECKOUT_LOCKED |
| CHECKOUT_LOCKED | Xử lý món còn lại, chốt bill, thu tiền | Đủ điều kiện → CLOSED; hủy chốt hợp lệ → OPEN |
| CLOSED | Xem lịch sử theo quyền | Lượt khách mới tạo session mới |

### Mở phiên và cấp quyền

1. Nhân viên có quyền mở session. Request lặp không tạo hai phiên.
2. QR công khai dẫn tới menu, tên quán và số bàn. Bàn chưa mở chỉ được xem menu/hướng dẫn liên hệ nhân viên; public API không tự mở session.
3. Mở QR không chiếm quyền. Khách bấm “Bắt đầu gọi món”, server claim atomically bằng transaction và unique constraint.
4. Máy khác chỉ xem menu, không thấy bill/lịch sử của nhóm khách. Chủ claim và nhân viên có quyền mới xem dữ liệu phiên.
5. Token ngẫu nhiên cấp từ server, lưu hash server-side; cookie HttpOnly/Secure/SameSite phù hợp và chống CSRF cho request ghi.
6. Mất mạng/đóng trình duyệt không tự giải phóng claim. Nhân viên chuyển quyền khi cần; token cũ vô hiệu ngay.
7. Nhiều tab dùng cùng cookie là cùng claim; đồng bộ hoặc cảnh báo giỏ, vẫn chống trùng phía server.
8. Đóng phiên thu hồi quyền; token cũ không dùng được với session mới trên cùng bàn.

QR in là mã định tuyến công khai, không phải secret ghi dữ liệu lâu dài. QR bị chụp vẫn có thể bị dùng từ xa; mở phiên bằng nhân viên giảm rủi ro nhưng không chứng minh hiện diện. Không tự thêm OTP; OTP cũng không chứng minh người dùng đang ở quán.

Nhân viên có thể tạo món hộ qua API nhân viên, ghi actor, không giả mạo claim của khách.

## 4. Gửi món và gọi thêm

- Hiển thị tùy chọn bắt buộc, giá, số lượng, ghi chú có giới hạn và tổng giỏ trước gửi.
- Server kiểm tra đúng quán/kênh, món đang bán, tùy chọn, giá, phiên và quyền claim.
- Giá/tùy chọn đổi so với bản khách xem: trả chênh lệch để xác nhận lại; không tăng tiền âm thầm.
- Món hết trước tạo đơn: từ chối lượt gửi với danh sách cần sửa, giữ giỏ; không tự gửi phần còn lại.
- Tạo order thành công snapshot tên, tùy chọn, đơn giá, thuế/phí, ghi chú; đổi menu sau đó không sửa lịch sử.
- Duyệt dùng snapshot đã gửi. Thay giá phải qua luồng điều chỉnh rõ ràng, không cập nhật ngầm.
- Mỗi lần gọi thêm tạo order mới; giao diện nhóm “Lượt 1”, “Lượt 2”, đồng thời có tổng phiên.
- Không gộp dòng khác tùy chọn/ghi chú chỉ vì cùng productId.
- Giới hạn số dòng/số lượng/tần suất bằng cấu hình và kiểm tra backend.

### Chống trùng và timeout

- Client tạo clientRequestId một lần cho một ý định gửi; retry dùng lại khóa đó.
- Unique theo storeId + clientRequestId, đồng thời kiểm tra session/actor và hash payload. Cùng khóa/cùng payload trả kết quả cũ; khác payload trả IDEMPOTENCY_CONFLICT.
- Sau timeout hiển thị “Đang kiểm tra kết quả gửi”, tra cứu cùng khóa; không lập tức sinh khóa mới hoặc báo chắc chắn thất bại.
- Chỉ xóa phần giỏ đã được server xác nhận; không xóa món khách thêm trong lúc request đang chạy.
- Khách cố ý gọi cùng món ở lượt mới dùng khóa mới; không dedup theo tên món và khoảng thời gian.
- Thời gian giữ khóa phải bao phủ retry nghiệp vụ; không để TTL ngắn tạo lại đơn cũ.
- Kiểm tra quyền trước khi trả kết quả idempotency đã lưu. Claim bị thu hồi không được dùng endpoint tra cứu để đọc dữ liệu riêng.

## 5. Duyệt theo số lượng và chế biến từng phần

Mỗi dòng có requestedQuantity, pendingQuantity, acceptedQuantity, rejectedQuantity; bất biến:

`requestedQuantity = pendingQuantity + acceptedQuantity + rejectedQuantity`

acceptedQuantity là lịch sử đã duyệt. Hủy sau duyệt dùng canceledQuantity/bản ghi điều chỉnh riêng, không đổi thành rejectedQuantity. Theo dõi số lượng chờ làm, đang làm, sẵn sàng, đã phục vụ và hủy bằng chuyển dịch có ràng buộc, không dùng một status cho cả dòng nếu phục vụ từng phần.

| Kết quả quyết định tổng hợp | Điều kiện |
| --- | --- |
| PENDING_CONFIRMATION | Còn số lượng chưa quyết định; UI vẫn thể hiện phần đã duyệt |
| CONFIRMED | Đã quyết định hết và chấp nhận toàn bộ |
| PARTIALLY_CONFIRMED | Đã quyết định hết, vừa chấp nhận vừa từ chối |
| REJECTED | Đã quyết định hết, từ chối toàn bộ |

Trạng thái tổng không điều khiển thay số lượng chi tiết. Phần được duyệt có thể vào bếp ngay, dù phần khác còn chờ xử lý.

- Có “Duyệt tất cả” cho ca thường, sửa từng dòng cho ca hết một phần; từ chối phải có lý do.
- Mỗi quyết định/cập nhật tiến độ có expectedVersion và chống trùng; hai nhân viên không cùng cộng một số lượng.
- Ví dụ yêu cầu 3, chấp nhận 2, từ chối 1: bếp nhận 2, bill tính 2; khách thấy rõ 1 bị từ chối.
- Phục vụ từng phần không nhân đôi số lượng khi retry/event lặp.

### Sửa và hủy

| Thời điểm | Xử lý |
| --- | --- |
| Giỏ chưa gửi | Khách tự sửa |
| Chờ duyệt | Nhân viên xử lý yêu cầu sửa/từ chối, ghi lịch sử |
| Duyệt nhưng chưa làm | Hủy có quyền/lý do, cập nhật trạm |
| Đang làm/đã sẵn sàng | Quyền tăng cường, báo trạm; không giả định đã ngừng chế biến chỉ vì gửi thông báo |
| Đã phục vụ/đã thu | Điều chỉnh tài chính/hoàn tiền theo quyền, giữ dòng gốc |

Bản đầu khách yêu cầu sửa/hủy bằng “Gọi nhân viên”. Hủy món đã nấu không tự hoàn nguyên liệu về kho. Khi tích hợp kho phải phân biệt giải phóng giữ hàng, nhập trả thực tế và hao hụt. Nấu lại không tự tính thêm tiền khách.

## 6. Bếp/bar, in và TTS

- Mỗi phần duyệt tạo chi tiết ticket có tham chiếu nguồn duy nhất; retry không tạo thêm ticket.
- Snapshot tuyến trạm khi duyệt. Món không chế biến có tuyến phục vụ trực tiếp; thiếu cấu hình không được bỏ khỏi hàng chờ âm thầm.
- AUTO tạo print job sau duyệt; MANUAL chờ thao tác in; DISABLED không tạo job nhưng vẫn có ticket màn hình.
- Job key theo ticket/revision/mục đích. Món gọi thêm chỉ in phần mới; sửa/hủy là phiếu thay đổi, không giả đơn mới.
- “Đã gửi máy in” khác “đã in xác nhận”. Khi kết quả không xác định, không retry vô hạn; in lại có nhãn, actor và lý do.
- Danh sách bếp thể hiện bàn, lượt, ghi chú, số lượng và thời gian chờ; không tự nhảy vị trí khi nhân viên đang bấm.
- Giữ TTS vi-VN, detail, volume 0.75 và mẫu README; phát sau commit, dedup theo event/device, xếp hàng đọc.
- Reconnect không đọc lại toàn bộ lịch sử; luôn có danh sách trực quan tương ứng.
- Lỗi in/TTS không làm mất order hoặc thay trạng thái món thành công giả.

## 7. Gọi nhân viên và gọi thanh toán

ServiceRequest có type ASSISTANCE/PAYMENT_REQUEST; trạng thái OPEN → ACKNOWLEDGED → RESOLVED. CANCELED khi không còn cần, lưu actor/lý do.

- Chủ claim có hai nút rõ ràng, không phải gõ tin nhắn dài.
- Mỗi session/type tối đa một yêu cầu chưa hoàn tất; bấm lại trả yêu cầu hiện có, không spam thông báo.
- Nhận yêu cầu atomically; người khác thấy ai đã nhận, thời gian chờ và tiến độ.
- Có chuyển/nhận lại nếu người phụ trách không thể xử lý; mất mạng không làm yêu cầu biến mất.
- Khách thấy đã gửi/đã nhận/hoàn tất; không hứa thời gian đến nếu chưa có dữ liệu.
- Dữ liệu lưu DB; realtime chỉ thông báo thay đổi, refresh vẫn phục hồi được.
- “Gọi thanh toán” không tự khóa bàn. Thu ngân bắt đầu chốt mới khóa.
- Đóng phiên phải kết thúc yêu cầu tồn bằng kết quả đúng, không đánh dấu hỗ trợ thành công giả.

## 8. Chốt bill, tiền và đóng phiên

### Chốt an toàn

1. Thu ngân bắt đầu chốt: khóa session bằng cùng cơ chế khóa mà tạo order sử dụng.
2. Request tạo order đến trước khóa được ghi và phải xuất hiện trong bill; đến sau bị từ chối TABLE_SESSION_LOCKED.
3. Xử lý hết pending; không âm thầm bỏ món chờ duyệt.
4. Server tạo checkout revision duy nhất đang hiệu lực, có mapping dòng nguồn và breakdown tiền.
5. Sửa/hủy làm thay đổi bill phải qua luồng có kiểm soát; không ghi đè bill đã thu.

Giao diện phân biệt tiền món đã duyệt, tiền chờ duyệt, tổng tạm tính và số cần trả. Tính tiền từ số lượng hợp lệ; món từ chối/hủy hợp lệ không được thu. Giảm giá, thuế/phí và làm tròn theo cấu hình Finance; không tự thêm phí phục vụ.

Hủy chốt để gọi thêm chỉ khi không có khoản thu, payment intent hoạt động hoặc kết quả tiền chưa rõ. Nếu có, phải xử lý/hủy hợp lệ trước. Checkout cũ chuyển VOIDED, giữ lịch sử; lần chốt sau có revision mới. Không tự động mở lại chỉ vì timeout giao diện.

### Ghi nhận tiền

- Dùng phương thức đã triển khai; tiền mặt do người có quyền xác nhận, chuyển khoản theo cơ chế xác minh của Finance.
- Nếu chính sách cho phép xác nhận chuyển khoản thủ công, lưu verificationSource/actor; không gọi đó là xác minh ngân hàng tự động.
- Mỗi khoản thu có khóa chống trùng và kiểm tra đồng thời; hai thu ngân không ghi vượt/trùng bill âm thầm.
- Tách tiền mặt khách đưa, tiền thừa trả lại và tiền áp dụng cho bill; tiền thừa không là doanh thu.
- Tiền thiếu/thừa, trả một phần, giao dịch đến muộn hoặc chưa rõ phải hiện trạng thái đối soát, không tự coi đủ tiền.
- Không tự hoàn tiền chỉ vì hủy món; đi qua quy trình Finance có quyền và audit.

### Đóng phiên

Đề xuất mặc định: không còn pending; món đã phục vụ hoặc hủy hợp lệ; checkout đã tất toán hoặc bill 0 hợp lệ; không còn payment chưa xác định có thể gây thu trùng. Ngoại lệ thu trước/phục vụ sau cần chính sách riêng.

- Đóng phiên và vô hiệu claim phải bảo đảm token cũ không thể ghi thêm.
- Phiên trống được đóng nếu không có nghĩa vụ tiền chưa giải quyết; ghi lý do.
- In phiếu/phát hành hóa đơn có trạng thái riêng. Lỗi nhà cung cấp đi vào hàng chờ xử lý, không giữ bàn mở vô hạn; vẫn thực hiện quy trình hóa đơn đã được xác minh.
- Lượt khách mới có session mới. Điều chỉnh tiền sau đóng tham chiếu đơn/checkout cũ, không gán vào khách mới.

## 9. Quyền và cách ly dữ liệu

| Vai trò | Quyền mặc định đề xuất |
| --- | --- |
| Guest claim | Gửi món trong OPEN, xem phiên của mình, yêu cầu hỗ trợ |
| Người xem QR chưa claim | Chỉ menu công khai, không bill/lịch sử |
| Waiter | Mở phiên, duyệt/tạo hộ/phục vụ theo permission; không mặc định hoàn tiền |
| Kitchen/Bar | Dữ liệu chế biến cần thiết tại trạm được cấp; không xem tài chính không cần thiết |
| Cashier | Chốt/thu/đóng theo quyền; hủy sau chế biến/hoàn tiền là quyền riêng |
| Manager | Quản lý trong quán được cấp; hành động nhạy cảm vẫn có permission/audit |

Role là bộ quyền, không bypass scope hoặc trạng thái. Platform/support không mặc định sửa đơn hoặc nhận tiền thay quán.

- Backend kiểm tra actor, tenant/store, đối tượng, permission và state; không tin storeId/sessionId từ client.
- Public API suy ra phạm vi từ claim. WebSocket room phải kiểm tra quyền, payload theo vai trò.
- Áp dụng cùng scope cho cache, worker, báo cáo, file và Print Agent.
- Thu hồi nhân viên phải chặn API và realtime đang mở.
- Validate input; parameterized query; escape ghi chú khi hiển thị/in/log; giới hạn payload và số lượng.
- Rate limit theo claim/session/store và IP phù hợp; không chỉ IP vì dùng chung Wi-Fi.
- Token không xuất hiện trong URL, analytics hoặc log. Audit hủy, giảm, thu/hoàn, chuyển claim và đóng phiên.

## 10. UI/UX và mạng yếu

### Khách

- Luôn rõ tên quán/bàn; danh mục dễ tìm, ảnh tối ưu, món hết hiển thị rõ.
- Giỏ dễ tiếp cận trên điện thoại; tùy chọn bắt buộc rõ, nút không bị bàn phím che.
- Sau gửi có mã lượt/trạng thái thực, không chỉ toast rồi biến mất.
- Trang món đã gọi nhóm theo lượt, hiện trạng thái/số lượng và phần bị từ chối.
- Không ép cài PWA/đăng nhập để gọi món.

### Nhân viên

- Ưu tiên đơn chờ, yêu cầu hỗ trợ và bàn thanh toán; thấy thời gian chờ.
- Duyệt nhanh cho ca thường; chi tiết khi ngoại lệ. Chỉ xác nhận tăng cường cho hành động có hậu quả.
- Xung đột version tải bản mới, không ghi đè người khác.
- Đổi quán hủy request/subscription cũ, xóa state/cache khác scope.

### Khả năng phục hồi

- Có loading, empty, error, thiếu quyền, offline và chưa rõ kết quả.
- Chữ/vùng chạm dễ dùng, focus/nhãn truy cập, không chỉ dựa vào màu.
- Cache menu có thời điểm cập nhật; gửi đơn luôn kiểm tra server.
- Giỏ nháp có thể lưu tối thiểu theo store/session, không lưu token bí mật hoặc lịch sử phiên khác; dọn khi kết thúc/đổi phạm vi.
- QR khách không xếp hàng order offline rồi gửi âm thầm khi có mạng; POS offline V4 là luồng riêng.
- Reconnect tải snapshot và version; không giả định đã nhận đủ event.
- Service worker không tự reload giữa lúc gửi món/thu tiền.

## 11. Dữ liệu, API và sự kiện

Tái sử dụng schema hiện có sau kiểm kê, không tạo bảng trùng chỉ vì tên khác.

Bổ sung/hoàn thiện: table_sessions(status, version, openedBy/At, closedBy/At); claims(tokenHash, revokedAt); order item quantities/history; service_requests(type, status, assignedTo); checkout revision và mapping dòng nguồn; outbox/audit theo phạm vi.

Partial unique cho session chưa đóng/bàn, claim hiệu lực/session, service request chưa hoàn tất/session/type, checkout hiệu lực/session. Nếu claim có expiresAt, cập nhật trạng thái hiệu lực bằng transaction; không giả định partial index tự đổi theo thời gian.

| Hành động | Endpoint đề xuất |
| --- | --- |
| Mở phiên | POST /stores/:storeId/tables/:tableId/sessions |
| Claim | POST /public/table-sessions/claim |
| Snapshot theo claim | GET /public/table-session |
| Gửi món | POST /public/orders |
| Tra cứu request | GET /public/order-requests/:clientRequestId |
| Gọi nhân viên | POST /public/service-requests |
| Chuyển claim | POST /stores/:storeId/table-sessions/:sessionId/claim-transfer |
| Duyệt từng dòng | POST /stores/:storeId/orders/:orderId/decisions |
| Cập nhật chế biến | POST /stores/:storeId/prep-tickets/:ticketId/transitions |
| Đánh dấu phục vụ | POST /stores/:storeId/order-items/:itemId/serve |
| Nhận/hoàn tất hỗ trợ | POST /stores/:storeId/service-requests/:requestId/transitions |
| Khóa/hủy khóa chốt | POST /stores/:storeId/table-sessions/:sessionId/checkout-lock hoặc checkout-unlock |
| Tạo bill chốt | POST /stores/:storeId/table-sessions/:sessionId/checkouts |
| Đóng phiên | POST /stores/:storeId/table-sessions/:sessionId/close |

Mutation có idempotency/expectedVersion khi phù hợp. OpenAPI mô tả quyền, input, lỗi và response. Mã lỗi: TABLE_SESSION_NOT_OPEN, TABLE_SESSION_LOCKED, CLAIM_ALREADY_HELD, CLAIM_REVOKED, PRODUCT_UNAVAILABLE, PRICE_CHANGED, IDEMPOTENCY_CONFLICT, VERSION_CONFLICT, UNRESOLVED_ITEMS, PAYMENT_UNRESOLVED, CHECKOUT_NOT_SETTLED.

Event gồm order.created, order.items_decided, prep.ticket_updated, order.items_served, service_request.created/updated, table_session.updated, checkout.created, payment.updated. Có eventId, aggregateId/version, scope, timestamp. Consumer xử lý trùng/lệch thứ tự; khách công khai không nhận payload bill.

## 12. Tính nhất quán, hiệu năng và clean code

- Tạo order kiểm tra session/claim và ghi items/outbox trong transaction; chốt/đóng dùng cơ chế khóa tương thích, không bỏ lọt request đồng thời.
- API không chờ in/TTS/notification ngoài hệ thống. Worker retry giới hạn, dead-letter, cảnh báo và không để lỗi một quán chặn các quán khác.
- Index theo store/session/status/thời gian đúng truy vấn; phân trang lịch sử, tránh tải mọi order.
- Đo p95 gửi/duyệt/chốt, độ trễ bếp, tỷ lệ lỗi và phục hồi dưới tải 100 quán theo kịch bản thống nhất; không tuyên bố chịu tải khi chưa đo.
- TypeScript strict, tên tiếng Anh rõ nghĩa: tableSessionId, acceptedQuantity, checkoutVersion, totalAmountVnd.
- Biến/hàm camelCase; type/component PascalCase; DB snake_case; file kebab-case trừ tên bắt buộc framework.
- Tách trách nhiệm session, gửi đơn, duyệt, checkout, hỗ trợ theo codebase; không tạo lớp chỉ cho đủ tên.
- Controller không chứa logic tiền; frontend không quyết định quyền/giá chính thức. Không any/ts-ignore/catch rỗng để che lỗi.
- Không console.log, debugger, dữ liệu giả hoặc code debug trong bản bàn giao. Giữ logger/audit cần thiết và che thông tin nhạy cảm.
- Không dùng CSS che lỗi cấu trúc/nghiệp vụ. Dùng component/design tokens chung.
- CI: format, lint, typecheck, build, test liên quan; không tắt rule/test để đạt xanh giả.

## 13. Checklist nghiệm thu

| ID | Kịch bản | Kết quả bắt buộc |
| --- | --- | --- |
| TB-01 | Hai người mở cùng bàn | Một session |
| TB-02 | Hai điện thoại claim | Một quyền ghi hiệu lực |
| TB-03 | Chuyển claim rồi dùng token cũ | Chặn ghi và đọc dữ liệu riêng |
| TB-04 | Đóng/mở lượt mới | Không lộ lịch sử/claim cũ |
| OR-01 | Gửi/retry cùng khóa | Một order, kết quả cũ |
| OR-02 | Cùng khóa khác payload | Bị từ chối |
| OR-03 | Timeout sau commit | Tra cứu được, không tạo thêm |
| OR-04 | Giá đổi/hết món trước gửi | Khách sửa/xác nhận, không tăng tiền âm thầm |
| OR-05 | Cùng món, lượt mới | Order mới hợp lệ |
| OR-06 | Duyệt 2/3 phần | Bếp/bill 2, phần còn lại rõ kết quả |
| OR-07 | Hai nhân viên cùng duyệt | Không cộng/ticket trùng |
| OR-08 | Hủy món đã nấu | Audit đúng, không tự tăng tồn |
| PR-01 | Gọi thêm | Chỉ phiếu phần mới |
| PR-02 | Ba chế độ in | Đúng thời điểm/tuyến/job |
| PR-03 | In mất phản hồi | Không retry vô hạn, reprint có nhãn |
| SR-01 | Spam gọi hỗ trợ | Một yêu cầu mở cùng loại |
| SR-02 | Hai người nhận hỗ trợ | Một người nhận, trạng thái đồng bộ |
| CK-01 | Gửi đồng thời chốt | Hoặc vào bill, hoặc từ chối rõ |
| CK-02 | Chốt còn pending | Yêu cầu xử lý, không bỏ món |
| CK-03 | Hủy chốt khi tiền chưa rõ | Chặn đến khi giải quyết |
| CK-04 | Hai người ghi nhận tiền | Không thu trùng/vượt âm thầm |
| CK-05 | Tiền mặt khách đưa dư | Tiền thừa không là doanh thu |
| CK-06 | Hóa đơn lỗi | Có theo dõi riêng, không giữ bàn vô hạn |
| SC-01 | Truy cập quán khác | Chặn API/socket/export |
| SC-02 | Quét QR công khai | Không lộ bill/lịch sử |
| UX-01 | Refresh/reconnect | Snapshot đúng, không đọc lại TTS lịch sử |
| UX-02 | Thêm món trong lúc gửi | Không mất phần giỏ thêm sau |
| UX-03 | Đổi quán/logout | Không còn state/subscription cũ |
| OP-01 | Cao điểm và worker lỗi | Có số liệu, không mất đơn, phục hồi được |

Kiểm tra dữ liệu DB/kết quả nghiệp vụ, không chỉ HTTP hoặc giao diện. Pilot cùng nhân viên thật với nhận đơn, hết món, hỗ trợ, thu tiền và đóng bàn; đo số bước, thời gian và lỗi thao tác.

## 14. Trình tự triển khai

1. Kiểm kê code/schema, map yêu cầu vào module hiện có, nêu phần tái sử dụng.
2. Session, claim, scope, idempotency trước khi mở public order.
3. Gọi nhiều lượt, duyệt theo số lượng, bếp/bar, in và race condition.
4. Hỗ trợ, snapshot/reconnect, UI ngoại lệ.
5. Checkout lock/revision, tiền và đóng phiên; kiểm thử vòng đời.
6. Kiểm tra cách ly quán, tải, pilot và migration trước phát hành.

Migration có backfill, sao lưu/staging, không reset production. Không tự viết lại hệ thống hoặc mở rộng module ngoài phạm vi.

Bàn giao nêu thay đổi, file/module, migration/config, test đã chạy/kết quả và giới hạn. Không coi mockup hoặc API thành công giả là hoàn thành.

## 15. Điểm còn cần chốt

- Xác minh thêm khi QR bị chia sẻ từ xa; không tự thêm OTP.
- Thời hạn claim và phục hồi khi hết hạn, không làm mất order đã ghi.
- Ngoại lệ thu trước/phục vụ sau và điều kiện đóng bàn.
- Quyền hủy sau chế biến, giảm/hoàn tiền, xác nhận chuyển khoản thủ công nếu có.
- Thuế/phí/giảm giá/làm tròn của Finance.
- Rate limit, thời gian giữ idempotency, timeout và mục tiêu tải dựa trên đo thực tế.

Các mục này không ngăn làm phần đã đủ yêu cầu. Quyết định thay đổi tiền, quyền hoặc vận hành phải được ghi rõ trước khi bật production.
