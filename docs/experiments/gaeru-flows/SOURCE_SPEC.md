# Đặc tả học hỏi gaeru-soft-source để xây nhánh thử nghiệm trên order_app

**Ngày:** 2026-10-21 · **Nguồn học hỏi:** `dothuongton/gaeru-soft-source` @ `3f36c9b` · **Đích:** repo `dothuongton/order_app` (mốc main `92f81cb`, Express + PostgreSQL + Vite/React, Socket.io + Web Push).
**Tính chất:** đây là đặc tả cho **một nhánh thử nghiệm** triển khai mô hình vận hành của gaeru (khách gửi yêu cầu mở bàn → một máy giữ quyền gọi món, máy khác chỉ xem menu) cùng các điểm mạnh khác của repo đó, để có bản chạy thật đem so sánh trước khi chốt mô hình lâu dài. Nó **không** tự thay thế phương án đa thiết bị + phân luồng tự động đã bàn tối 20/10 — hai phương án chạy song song để quyết bằng trải nghiệm thật.
**Mức kiểm chứng nguồn:** bộ kiểm thử của gaeru đã được Muse chạy lại độc lập ngày 2026-10-21: **276/276 đạt, 0 lỗi** (18 file; riêng tích hợp API 168 test). Các mô tả luồng dưới đây đối chiếu README + tài liệu bàn giao + schema trong chính repo.

---

# PHẦN A — ĐÁNH GIÁ TOÀN BỘ gaeru-soft-source

## A.1 Định danh

- Sản phẩm **"Mộc — Gọi món bằng QR" (GAERU Software v32)**, mã nguồn dạng gói bàn giao: 1 commit duy nhất, ~18.500 dòng code lõi, 13 bảng dữ liệu, có lớp đa cửa hàng trong code (`stores`, chủ nền tảng tạo/tạm ngưng quán, nhân viên theo quán) nhưng dữ liệu kèm theo chỉ là mẫu (1 quán, 12 bàn), không có dữ liệu thật hay bản sao cơ sở dữ liệu.
- Nền tảng gốc: **ChatGPT Sites + Cloudflare Workers + D1 (SQLite)**; React 19, Vinext/Next 16, Drizzle ORM, Tailwind 4 + shadcn/ui. Miền đích soft.gaeru.com chưa xác minh DNS; theo tài liệu bàn giao, hệ thống **chưa từng chạy độc lập ngoài Sites**.

## A.2 Điểm mạnh (có kiểm chứng trong code/tài liệu)

1. **Toàn vẹn đơn khi mạng chập chờn:** trước lần gửi đầu, app chụp toàn bộ nội dung + giá + mã yêu cầu của đơn; mất mạng/không rõ kết quả thì gửi lại **đúng bản chụp** bằng hộp "Kiểm tra lần gửi món"; máy chủ từ chối rõ ràng mới mở lại giỏ cho sửa. Mỗi yêu cầu có khóa duy nhất chống trùng; giá được tính lại phía máy chủ và lưu ảnh chụp tên/giá/tùy chọn vào từng đơn.
2. **Giới hạn đơn áp ở cả API:** giỏ ≤30 lựa chọn, ≤60 phần, ≤20 phần cho cùng lựa chọn — kiểm tra ở giao diện lẫn API.
3. **Thanh toán có biên nhận:** thu theo từng lần gọi hoặc cả bàn; mỗi lần thu có một biên nhận duy nhất, máy chủ so khớp chính xác danh sách đơn + tổng tiền kỳ vọng trong cùng giao dịch (lệch → từ chối toàn bộ); gửi lại cùng mã yêu cầu trả biên nhận cũ, không thu trùng, không tính doanh thu hai lần; `paid_at` ghi một lần duy nhất kể cả khi hai nhân viên xác nhận đồng thời.
4. **Đóng bàn có điều kiện + phiếu quyết toán:** chỉ đóng khi mọi đơn hợp lệ đã phục vụ và thanh toán (hoặc hủy hợp lệ); phiếu quyết toán lưu toàn bộ ảnh chụp của lượt (bàn, khách, thời gian, tổng tiền, mọi đơn kể cả đã hủy) trong cùng giao dịch — ghi phiếu lỗi thì bàn vẫn mở.
5. **Đổi bàn giữ nguyên phiên** (chi tiết ở B.7).
6. **Phân quyền nhân viên chi tiết:** 10 quyền riêng, 5 vai trò mẫu + tùy chỉnh; quyền được đọc lại ở mỗi yêu cầu phía máy chủ; sửa tài khoản dùng phiên bản chống ghi đè; thay đổi quyền và lịch sử phân quyền ghi trong cùng một giao dịch; chủ quán không thể bị sửa/khóa; người quản lý không tự sửa quyền của mình.
7. **Yêu cầu hỗ trợ có "thế hệ":** mỗi lần gọi nhân viên/xin hóa đơn mang mã + thời điểm riêng; thao tác xác nhận xử lý chỉ đóng đúng yêu cầu đó, không đóng nhầm yêu cầu mới đến sau; ghi chú tối đa 300 ký tự, được đọc thành tiếng trên trang quản trị.
8. **Thông báo quản trị theo hàng đợi sự kiện:** popup + giọng đọc tiếng Việt (đơn mới, yêu cầu mở bàn, yêu cầu hỗ trợ), dấu "Đơn mới" bám theo trạng thái máy chủ đến khi đơn được nhận/hủy; trang quản trị tự đồng bộ 3 giây.
9. **Báo cáo doanh thu nghiêm túc:** kỳ so sánh cùng độ dài, phân biệt tiền thu theo `paid_at` với giá trị đơn theo ngày tạo, tổng hợp theo bàn/phương thức trong một ảnh chụp giao dịch, xuất CSV chống chèn công thức bảng tính.
10. **Cài đặt hiển thị theo quán:** thời lượng popup 1–30 giây, cỡ chữ/ảnh món 100–250%, màu giao diện có kiểm tra độ tương phản — lưu dạng bản nháp/lưu tường minh, không cần migration (lưu theo khóa trong bảng settings).

## A.3 Điểm yếu và phụ thuộc (lý do chỉ học luồng, không lấy nền)

1. **Xác thực nhân viên dính ChatGPT Sites:** danh tính lấy từ header gateway (`oai-authenticated-user-id/email` — 4 header, 3 file chạm vào). Tài liệu bàn giao tự ghi: tự host phải thay toàn bộ xác thực, không được tin header do khách gửi. Nhân viên quán phải có tài khoản ChatGPT là rào cản vận hành lớn.
2. **Dữ liệu dính D1:** 139 điểm gọi kiểu `.prepare/.bind` trong lib+app (binding tập trung ở 2 file lõi). Rời Cloudflare là phải viết lại lớp truy cập dữ liệu hoặc dựng lớp tương thích D1.
3. **Không có thông báo đẩy khi đóng trang:** toàn bộ realtime là polling (quản trị 3 giây, khách 5–7 giây); âm báo chỉ kêu khi trang quản trị đang mở. order_app hiện có Socket.io + Web Push — vượt trội ở điểm này, giữ nguyên khi chuyển giao luồng.
4. **Chuỗi công cụ dính Sites/Cloudflare:** script chạy/build bọc helper của Sites, bản build xuất cấu hình wrangler.
5. **Phạm vi bản đầu (theo README của chính repo):** chưa cổng thanh toán, chưa máy in bếp/POS, chưa email/SMS/push; tên quán/thực đơn/ảnh là dữ liệu mẫu; QR cố định "không chứng minh khách có mặt tại bàn" — chính họ cũng ghi nhận giới hạn này.

## A.4 Về việc deploy gaeru lên Vercel (kết luận riêng)

**Không ổn để đưa thẳng lên Vercel.** Ba mối hàn phải cắt: (1) chuỗi build/chạy là của Cloudflare/Sites (script `start` chạy wrangler); (2) lớp dữ liệu nói tiếng D1 ở 139 điểm — Vercel không có D1, phải thay bằng cơ sở dữ liệu khác + lớp tương thích; (3) xác thực nhân viên đọc header gateway của Sites — sang Vercel là mất hẳn, khu quản trị không có gì bảo vệ cho tới khi xây lại xác thực. Chuyển nhà đúng nghĩa là một dự án port cỡ **vài ngày đến hai tuần** (ước lượng), có bộ 276 test làm lưới an toàn. Nếu mục tiêu chỉ là cho gaeru chạy độc lập, đường rẻ nhất là **ở lại Cloudflare bằng tài khoản Workers riêng** và chỉ thay phần xác thực Sites. Vercel chỉ đáng làm nếu có lý do chuẩn hóa hạ tầng riêng — bản thân Vercel không làm app chạy tốt hơn.

## A.5 Kết luận

gaeru là **kho mẫu thiết kế đã kiểm chứng** về kỷ luật giao dịch và vận hành phiên, không phải nền tảng để thay order_app. Giá trị khai thác: các luồng ở Phần B.

---

# PHẦN B — MÔ TẢ, YÊU CẦU VÀ LUỒNG XỬ LÝ CHO NHÁNH order_app

## B.0 Nguyên tắc thích ứng

- Giữ nguyên stack và hạ tầng của order_app (Express + PostgreSQL + Socket.io + Web Push + PWA). Mọi cơ chế của gaeru được **dịch sang tương đương PostgreSQL/order_app**, không bê nguyên code.
- Giữ nguyên các quyết định không xung đột: QR in cố định tại bàn; nhân viên thao tác bằng nút lớn, ít phán xét; mọi thao tác ghi phải có audit (theo đặc tả Super Admin).
- Nhánh này thử nghiệm đúng một thay đổi triết lý: **quyền gọi món theo phiên được cấp cho đúng một thiết bị (claim) sau khi nhân viên duyệt yêu cầu mở bàn**; các thiết bị khác tại bàn ở chế độ **xem menu** (và xem trạng thái công khai của bàn ở mức tối thiểu, không thấy đơn/bill của phiên).

## B.1 Luồng yêu cầu mở bàn (guest request → duyệt)

**Trạng thái bàn/phiên:** `trống → chờ duyệt (đã có thiết bị giữ) → đang phục vụ → đã đóng`. Thêm trạng thái phiên `pending` (chờ duyệt) và `open` (đang phục vụ) như hai pha phân biệt trong `table_sessions`.

**Luồng:**
1. Khách quét QR bàn (link trực tiếp như hiện tại) → trang khách tải menu ở chế độ xem. Nếu bàn trống: hiện nút/hộp **"Yêu cầu mở bàn"** kèm ô nhập tên khách (tên hiển thị cho nhân viên đối chiếu).
2. Khách gửi yêu cầu → máy chủ tạo phiên `pending`, **gắn claim cho đúng trình duyệt gửi** (xem B.2) và giữ bàn ngay từ thời điểm này. Thiết bị khác quét vào trong lúc `pending` hoặc `open` → chỉ xem menu + dòng trạng thái "Bàn đang có khách", không tạo được yêu cầu thứ hai.
3. Phía nhân viên nhận thông báo realtime (socket + push): "Bàn X — khách *Nguyễn A* yêu cầu mở bàn" với hai nút lớn **Duyệt mở bàn** / **Từ chối**. Duyệt → phiên chuyển `open`, thiết bị claim được gọi món. Từ chối → phiên hủy, bàn giải phóng ngay, thiết bị gửi nhận thông báo bị từ chối.
4. Nhân viên vẫn mở bàn trực tiếp như hiện tại (đường phụ cho khách không dùng điện thoại): phiên `open` không có claim, nhân viên gọi món hộ qua cổng staff như luồng hiện có.
5. **Chống phá tại cửa này:** tối đa 6 yêu cầu mở bàn mới/10 phút cho mỗi cookie thiết bị (theo mẫu gaeru); gửi lại yêu cầu đang chờ không tạo bản ghi mới (idempotent theo phiên chờ hiện có của thiết bị); yêu cầu `pending` quá **15 phút** không được duyệt thì tự hết hạn, giải phóng bàn *(điểm này là bổ sung của đặc tả này — gaeru không ghi thời hạn chờ; ghi rõ để nghiệm thu)*.

**Ràng buộc toàn vẹn (bắt buộc):** tại mọi thời điểm, một bàn chỉ có tối đa **một** phiên thuộc {`pending`, `open`}. Thực thi ở tầng dữ liệu bằng **partial unique index** trên `table_sessions(table_id) WHERE status IN ('pending','open')` + xử lý xung đột trả lỗi thân thiện — tương đương "khóa duy nhất có điều kiện" của gaeru trên D1, chống hai thiết bị gửi đồng thời.

## B.2 Thiết bị claim — một máy gọi món, máy khác xem menu

1. Khi tạo yêu cầu mở bàn, máy chủ cấp cookie thiết bị: tên dạng `__Host-<app>-device`, thuộc tính `Secure; HttpOnly; SameSite=Lax`, Path=/, giá trị ngẫu nhiên đủ dài; **cơ sở dữ liệu chỉ lưu bản băm** của giá trị (cột `claim_device_hash` trên phiên), không lưu giá trị thô.
2. Mọi API ghi phía khách (gửi đơn, gọi nhân viên, xin hóa đơn) phải kiểm tra **đồng thời trong cùng thao tác ghi**: cookie thiết bị khớp bản băm của phiên + đúng bàn + đúng mã phiên + phiên ở trạng thái `open` và đã được duyệt. Thiếu/sai bất kỳ điều kiện nào → từ chối với mã lỗi thống nhất phía public (không lộ chi tiết phân biệt, theo nguyên tắc chống dò đã chốt ở đặc tả chống đơn ảo).
3. Thiết bị không có claim: tải được menu và CMS công khai của quán; **không** đọc được đơn, bill, hay trạng thái chi tiết của phiên đang mở của bàn.
4. Tải lại trang trên đúng trình duyệt claim → tiếp tục phiên (đọc claim từ cookie). Trình duyệt khác, chế độ ẩn danh, hoặc đã xóa cookie = thiết bị mới → bị từ chối theo mục 2–3.
5. **Mất claim** (khách xóa cookie, hỏng máy): không tự chiếm lại. Nhân viên xử lý bằng một thao tác staff tường minh **"Giải phóng thiết bị"** trên phiên đang mở (ghi audit), sau đó thiết bị mới được gửi yêu cầu nhận claim cho **chính phiên đó** (không phải đóng/mở lại phiên) — *(thích ứng mềm hơn gaeru, nơi mất cookie buộc đóng bàn; lý do: order_app đã có cổng staff đủ mạnh để ghi vết thao tác này)*.
6. Đóng phiên (B.6) thu hồi claim lập tức: mọi yêu cầu ghi mang cookie/mã phiên cũ đều bị từ chối. Cơ chế `count`/thế hệ phiên đã bàn tối 20/10 là cách triển khai tương đương trong order_app: chốt bill tăng thế hệ của bàn, dấu vết cũ lệch thế hệ là hết hiệu lực.

## B.3 Toàn vẹn gửi đơn phía khách

1. **Mã yêu cầu duy nhất (UUID) cho mỗi lần gửi đơn**, máy chủ chống trùng theo (phiên, mã yêu cầu): gửi lại cùng mã + cùng nội dung → trả kết quả cũ; cùng mã khác nội dung → từ chối.
2. **Chụp ảnh đơn trước khi gửi:** client khóa nội dung giỏ + giá + mã yêu cầu ngay khi bắt đầu gửi; trong lúc gửi/không rõ kết quả, không cho sửa phần đã chụp. Lỗi mạng/timeout/phản hồi không đầy đủ → hiện hộp **"Kiểm tra lần gửi món"** cho gửi lại đúng bản chụp. Máy chủ từ chối rõ ràng → mở lại giỏ với nội dung cũ để khách sửa; tùy chọn món không còn hợp lệ (quán đổi cấu trúc món) thì bỏ tùy chọn đó kèm lời nhắc kiểm tra lại.
3. Bản chụp chờ được lưu **theo từng phiên khách + mã yêu cầu** (khóa riêng), tab khác không ghi đè/xóa nhầm; phiên mới không đọc bản chờ của phiên cũ.
4. **Giá tính lại phía máy chủ** từ menu tại thời điểm nhận; đơn lưu ảnh chụp tên món/giá/tùy chọn tại thời điểm gửi (bill không đổi khi quán sửa giá sau đó).
5. **Giới hạn áp ở API** (không chỉ giao diện): mỗi giỏ ≤30 lựa chọn, ≤60 phần, ≤20 phần/cùng lựa chọn — vượt là từ chối với thông báo rõ ràng.

## B.4 Xử lý đơn phía nhân viên

Giữ máy trạng thái hiện có của order_app, ánh xạ sang nhịp gaeru: `chờ tiếp nhận → đang chuẩn bị → sẵn sàng → đã phục vụ`; hủy đơn chưa thanh toán phải kèm lý do; **đánh dấu đã thanh toán là thao tác xác nhận riêng**, không gộp với chuyển trạng thái món. Mọi chuyển trạng thái ghi sự kiện vào lịch sử đơn của phiên (phục vụ B.9).

## B.5 Thanh toán theo lần / cả bàn có biên nhận

1. Hai chế độ: **Thanh toán lần này** (đúng một lần gọi) và **Thanh toán cả bàn** (toàn bộ phần chưa thu của phiên). Chọn phương thức: Tiền mặt / Chuyển khoản / Khác; chỉ xác nhận khi đã nhận đủ tiền (đây là ghi nhận của nhân viên, không phải cổng thanh toán — như hiện tại).
2. API thu tiền nhận: `sessionId`, `requestId` (UUID), danh sách `orderIds` nhân viên đã thấy, `expectedTotal`, `paymentMethod`. Máy chủ so khớp **chính xác** danh sách + tổng tiền trong cùng giao dịch với việc ghi biên nhận và cập nhật đơn: có đơn mới chen vào, một đơn đã được thu riêng/hủy trước → **từ chối toàn bộ**, màn hình tải lại số liệu mới để nhân viên kiểm tra lại.
3. Mỗi lần thu thành công có **một biên nhận duy nhất** (bảng mới `payment_receipts`, duy nhất theo `requestId`). Gửi lại đúng nội dung + mã → trả biên nhận cũ (kể cả khi bàn đã gọi thêm hoặc đã đóng); đổi nội dung nhưng dùng lại mã → từ chối.
4. Khi kết quả một lần thu **không rõ** (mất mạng sau khi gửi): nút **"Kiểm tra lại giao dịch"** gửi lại đúng yêu cầu đang chờ; cấm đổi phương thức/số tiền của yêu cầu chưa rõ kết quả.
5. `paid_at` + phương thức được ghi **một lần** tại lần xác nhận đầu tiên; xác nhận trùng/đồng thời không đổi dữ kiện đã ghi, không cộng doanh thu hai lần. Thanh toán không tự đóng bàn và không tự chuyển trạng thái món.
6. Trần an toàn mỗi lần xác nhận cả bàn: tối đa 600 đơn/lần thu (theo gaeru).

## B.6 Đóng bàn và phiếu quyết toán

1. Điều kiện đóng: mọi đơn hợp lệ của phiên đã `đã phục vụ` **và** đã thanh toán, hoặc đã hủy hợp lệ; còn đơn chưa đạt → API từ chối kèm danh sách vướng.
2. Đóng bàn là **một giao dịch**: chốt phiên + lưu **phiếu quyết toán** (bảng mới `table_settlements`, duy nhất theo phiên) chứa ảnh chụp đầy đủ: bàn, tên khách, thời điểm bắt đầu/đóng, tổng thu, toàn bộ đơn kể cả đã hủy, lịch sử chuyển bàn, các biên nhận. Ghi phiếu lỗi → toàn bộ hoàn tác, bàn vẫn mở.
3. Cùng giao dịch: kết thúc mọi yêu cầu hỗ trợ đang mở của phiên, thu hồi claim (B.2.6). Đóng bàn không tự ghi thêm tiền và không thay đổi `paid_at` của bất kỳ đơn nào.

## B.7 Đổi bàn giữ nguyên phiên

1. Thao tác staff trên bàn đang hoạt động: chọn bàn đích **đang trống** (không có phiên `pending`/`open`, kể cả của chính thao tác khác vừa giữ) → xác nhận. Màn hình tải lại tình trạng mới nhất trước khi cho chọn.
2. API (thích ứng REST của order_app): `POST /staff/sessions/:id/transfer` với `requestId` (UUID), `fromTableId`, `toTableId`, `expectedUpdatedAt` (dấu phiên bản của phiên tại thời điểm nhân viên xem). Máy chủ kiểm tra lại mọi điều kiện **ngay trong giao dịch**: phiên còn ở bàn nguồn như kỳ vọng, bàn đích còn trống; lệch bất kỳ điều kiện nào → từ chối toàn bộ, không chuyển một phần.
3. Phạm vi chuyển (nguyên vẹn, cùng giao dịch): tham chiếu bàn của **phiên** và của mọi đơn, yêu cầu hỗ trợ, biên nhận thuộc phiên. Giữ nguyên: mã phiên, tên khách, claim thiết bị, thời điểm bắt đầu, trạng thái/thời điểm/phương thức thu tiền của từng đơn, ghi chú. Bàn cũ giải phóng đồng thời với việc khóa bàn mới.
4. Đổi bàn **không** thu tiền, **không** đóng phiên, **không** cộng doanh thu. Tổng hợp thu của phiên tính theo bàn hiện tại.
5. Nhật ký: bảng mới `table_transfers` (phiên, bàn đi, bàn đến, nhân viên thực hiện, thời điểm, `requestId` duy nhất). Gửi lại cùng `requestId` + cùng nội dung → trả kết quả cũ kèm vị trí hiện tại, không chuyển lần hai. Mỗi lần chuyển tăng **phiên bản phiên** (`version`), yêu cầu cũ mang phiên bản cũ không áp dụng lại được kể cả khi phiên chuyển vòng về bàn cũ.
6. Phía khách: trang khách theo **phiên + cookie claim** (không theo bàn trong URL hiển thị) tự cập nhật sang bàn mới qua socket; giỏ nháp và mã yêu cầu lưu theo phiên nên không mất món đang chọn khi đổi bàn; gửi lại một đơn đã nhận trước lúc chuyển không tạo đơn thứ hai.
7. Thông báo đơn đang chờ đi theo phiên sang bàn mới; việc chuyển bàn **không** phát sinh thông báo "đơn mới".

## B.8 Yêu cầu hỗ trợ

1. Khách (thiết bị claim) gọi nhân viên hoặc yêu cầu hóa đơn, kèm ghi chú tối đa 300 ký tự.
2. Mỗi yêu cầu có mã + **thế hệ** (generation) riêng. Thao tác staff "Đã hỗ trợ" phải chỉ đúng (mã yêu cầu, thế hệ): yêu cầu mới đến sau không bị thao tác xác nhận của yêu cầu cũ đóng nhầm — kiểm tra điều kiện ngay trong câu lệnh cập nhật.
3. Hiển thị ngay trong thẻ bàn đang mở (không danh sách rời), kèm bộ lọc "Cần hỗ trợ" ở cổng staff; yêu cầu chỉ biến mất khi máy chủ xác nhận đã xử lý đúng yêu cầu đó.
4. Yêu cầu hỗ trợ của phiên tự kết thúc khi đóng bàn (B.6.3); ghi chú giữ nguyên khi đổi bàn.

## B.9 Lịch sử

1. **Quyết toán bàn đã đóng (staff/quản lý):** lọc theo **ngày đóng theo giờ Việt Nam**, phân trang 20 lượt/trang, tổng hợp tính trên toàn bộ kết quả lọc (không chỉ trang đang xem). Mở chi tiết một lượt: toàn bộ lịch sử của lượt đó — đơn (kể cả hủy), biên nhận, chuyển bàn, hỗ trợ.
2. **Lịch sử theo bàn:** danh sách các phiên đã qua của từng bàn (thời gian, khách, tổng thu, kết quả) để tra cứu khi có khiếu nại.
3. **Lịch sử trong phiên (khách):** trang "Đơn của bạn" trả **đầy đủ** đơn của phiên hiện tại (không cắt ở số lượng cố định), chỉ cho thiết bị claim của đúng phiên đó; khách của phiên trước không thấy dữ liệu phiên sau và ngược lại.
4. **Lịch sử vận hành phía staff:** bảng điều khiển giữ toàn bộ đơn của các phiên đang mở + 200 đơn lịch sử gần nhất; **mọi truy vấn doanh thu đọc dữ liệu đầy đủ, không bị giới hạn 200**.
5. **Lịch sử phân quyền:** mọi thay đổi tài khoản nhân viên (thêm, đổi quyền, tạm ngưng, kích hoạt) ghi kèm người thực hiện + thời điểm, hiển thị được trong khu quản lý tài khoản (chi tiết ở B.10) và đổ vào audit log chung theo đặc tả Super Admin.

## B.10 Phân quyền nhân viên chi tiết

1. Từ 3 vai trò thô hiện tại chuyển sang **bộ 10 quyền** (ánh xạ từ gaeru sang tính năng order_app): xem đơn · xử lý đơn · hủy đơn · quản lý bàn & QR (gồm duyệt/từ chối yêu cầu mở bàn, đóng bàn, giải phóng thiết bị) · chuyển bàn · thu tiền · xem doanh thu · quản lý thực đơn · cài đặt quán · quản lý nhân viên. Quyền thao tác tự kèm quyền xem đơn.
2. Vai trò mẫu: **Quản lý** (cả 10) · **Thu ngân** (xem đơn, quản lý bàn/QR/hỗ trợ, chuyển bàn, thu tiền, xem doanh thu) · **Phục vụ** (xem + xử lý đơn, quản lý bàn/QR/hỗ trợ, chuyển bàn) · **Bếp** (xem + cập nhật tiến độ đơn) · **Xem báo cáo** (doanh thu, quyết toán, xuất CSV) · **Tùy chỉnh**.
3. Ràng buộc máy chủ (kiểm tra ở API trước mọi thao tác, không dựa vào vai trò lưu ở trình duyệt): chủ quán giữ đủ quyền và không bị sửa/khóa qua trang tài khoản; không ai tự sửa quyền/trạng thái của chính mình; không cấp quyền mình không có; không sửa tài khoản có quyền cao hơn phạm vi được giao; khóa tài khoản chặn mọi yêu cầu quản trị tiếp theo nhưng giữ nguyên dữ liệu đơn.
4. Sửa tài khoản dùng **phiên bản** chống ghi đè thay đổi của người khác; thay đổi + lịch sử phân quyền ghi trong **cùng một giao dịch**; yêu cầu cấp quyền đang chờ bị từ chối nếu người thực hiện vừa bị khóa/đổi quyền trước khi ghi.

## B.11 Thông báo (giữ hạ tầng order_app, học ngữ nghĩa gaeru)

1. Dùng Socket.io + Web Push hiện có thay cho polling của gaeru: sự kiện **đơn mới**, **yêu cầu mở bàn**, **yêu cầu hỗ trợ** đẩy ngay tới cổng staff, kể cả khi khóa màn hình (điểm order_app hơn gaeru — không được regress).
2. Ngữ nghĩa hiển thị học gaeru: hàng đợi thông báo theo thứ tự phát sinh; dấu **"Đơn mới"** bám theo trạng thái máy chủ của bàn/lượt, chỉ hết khi mọi đơn mới đã được tiếp nhận hoặc hủy (không mất khi xem popup hay tải lại trang); lần tải thành công đầu tiên là mốc theo dõi — không phát lại thông báo cho đơn cũ đã chờ sẵn.
3. Giọng đọc tiếng Việt (tùy chọn bật/tắt theo quán): đọc "Bàn X có đơn" / "Bàn X có khách yêu cầu mở bàn" / yêu cầu hỗ trợ kèm ghi chú. Chỉ đánh dấu đã đọc khi giọng thực sự bắt đầu phát; không xin quyền microphone. *(Khác gaeru ở một điểm: gaeru để âm báo luôn bật không tắt được — không học điểm này.)*

## B.12 Cài đặt hiển thị quán (giai đoạn sau, không chặn các luồng trên)

Thời lượng popup thông báo 1–30 giây; cỡ chữ và cỡ ảnh món 100–250% áp riêng theo từng cỡ màn hình; màu chủ đạo + màu chữ có kiểm tra tương phản (chữ quá nhạt trên nền sáng thì cảnh báo/làm đậm); chỉnh ở dạng bản nháp — chỉ áp dụng khi bấm Lưu; quán khác đổi cấu hình trong lúc đang sửa thì giao diện báo và giữ bản nháp. Lưu theo khóa trong bảng cài đặt quán (JSONB sẵn có của order_app), không cần migration riêng.

---

# PHẦN C — THAY ĐỔI DỮ LIỆU & API (PostgreSQL)

**Dữ liệu:**
- `table_sessions`: thêm `status` pha `pending`, `guest_name`, `claim_device_hash`, `version` (tăng khi chuyển bàn/sửa quan trọng).
- Partial unique index: một phiên `pending|open` cho mỗi bàn.
- Bảng mới: `payment_receipts` (duy nhất `request_id`), `table_settlements` (duy nhất `session_id`), `table_transfers` (duy nhất `request_id`), lịch sử phân quyền dùng chung bảng audit (thêm loại sự kiện nhân viên).
- `service_requests`: thêm `generation` (hoặc dùng cặp id + created_at làm điều kiện đóng nguyên tử).
- Đơn: giữ ảnh chụp giá/tên/tùy chọn (đã có ở mức cơ bản — rà soát đủ theo B.3.4); `paid_at` + `payment_method` ghi một lần.

**API (theo tiền tố hiện có của order_app):**
- Public: gửi yêu cầu mở bàn; trạng thái yêu cầu của thiết bị; gửi đơn/gọi hỗ trợ/xin bill gắn kiểm tra claim (B.2.2).
- Staff: duyệt/từ chối yêu cầu; giải phóng thiết bị; chuyển bàn (B.7.2); đọc tổng + thu tiền cả bàn (B.5.2); đóng bàn (B.6); danh sách/chi tiết quyết toán (B.9.1).

# PHẦN D — TIÊU CHÍ NGHIỆM THU ĐO ĐƯỢC

1. Hai trình duyệt cùng gửi yêu cầu mở một bàn gần như đồng thời → **đúng một** yêu cầu được tạo/giữ bàn; trình duyệt còn lại nhận trạng thái "bàn đang có khách" và chỉ xem được menu.
2. Thiết bị không claim gọi API gửi đơn → bị từ chối; sửa cookie/token tay cũng bị từ chối; thiết bị claim tải lại trang → phiên tiếp tục nguyên trạng.
3. Staff từ chối yêu cầu → bàn về `trống` ngay; thiết bị gửi tạo được yêu cầu mới sau đó.
4. Gửi một đơn rồi cắt mạng trước khi nhận phản hồi, bấm "Kiểm tra lần gửi món" → phiên có **đúng một** đơn với đúng nội dung đã chụp; quán đổi giá giữa chừng → bill vẫn theo giá đã chụp.
5. Thu tiền cả bàn trong lúc có đơn mới chen vào sau khi nhân viên mở hộp xác nhận → giao dịch bị từ chối toàn bộ, không đơn nào bị đánh dấu đã thu; gửi lại yêu cầu thu cũ (cùng `requestId`) sau khi đã thu thành công → trả đúng biên nhận cũ, doanh thu không tăng.
6. Đóng bàn khi còn một đơn chưa thanh toán → bị từ chối kèm lý do; hoàn tất đơn đó → đóng được, phiếu quyết toán chứa đủ đơn đã hủy và lịch sử chuyển bàn.
7. Đổi bàn giữa phiên: bill, claim, giỏ nháp của khách giữ nguyên; khách không phải quét lại; gửi lại `requestId` chuyển bàn cũ → không chuyển lần hai; hai nhân viên cùng chuyển một phiên → chỉ một người thành công.
8. Hai yêu cầu hỗ trợ liên tiếp: xác nhận xử lý yêu cầu thứ nhất không đóng yêu cầu thứ hai.
9. Tài khoản bị khóa giữa phiên làm việc → yêu cầu quản trị tiếp theo bị chặn; quản lý tự sửa quyền của mình → bị từ chối; hai quản lý sửa cùng một tài khoản đồng thời → một người nhận lỗi xung đột phiên bản, lịch sử phân quyền ghi đủ cả hai lần thử hợp lệ/không hợp lệ theo quy tắc audit.
10. Kiểm thử tự động cho các mục 1–9 chạy xanh trên nhánh trước khi cân nhắc gộp.

# PHẦN E — ĐÁNH ĐỔI PHẢI GHI NHẬN & THỨ TỰ LÀM

**Đánh đổi của mô hình nhánh này (so với phương án đa thiết bị đã bàn tối 20/10):**
- Khách phải nhập tên + **chờ duyệt** mới gọi được món — thêm ma sát ở đúng điểm phương án kia tối kỵ; nhân viên phải trực duyệt yêu cầu (một chạm, nhưng là việc mới, và bàn ở tầng khác/phòng kín thì đối chiếu tên chỉ còn ý nghĩa hình thức).
- Cả bàn phụ thuộc **một điện thoại**: máy đó hết pin/mất cookie là cả bàn dừng gọi món cho tới khi nhân viên giải phóng thiết bị (B.2.5).
- Đổi lại: bề mặt đơn ảo **gần như biến mất** — không claim thì không có đường gửi đơn; bài toán phân luồng/dò mã/gắn cờ thiết bị của phương án kia không còn cần thiết trên nhánh này.
- Tiêu chí chọn mô hình lâu dài (đề xuất): chạy thử nhánh này tại một quán test, đo (a) thời gian từ quét QR tới đơn đầu tiên, (b) tỉ lệ khách bỏ giữa chừng ở bước chờ duyệt, (c) số lần nhân viên phải giải phóng thiết bị/tuần — so với cùng số liệu của phương án hiện tại.

**Thứ tự triển khai đề xuất trên nhánh:** (1) trạng thái `pending` + ràng buộc một phiên/bàn + claim cookie/băm; (2) luồng yêu cầu/duyệt + chế độ xem menu cho máy không claim; (3) toàn vẹn gửi đơn (mã yêu cầu, chụp ảnh, giới hạn API); (4) biên nhận thanh toán + đóng bàn/quyết toán; (5) đổi bàn giữ phiên; (6) hỗ trợ theo thế hệ + lịch sử; (7) phân quyền 10 quyền; (8) thông báo/cài đặt hiển thị.

**Ngoài phạm vi nhánh này:** thay stack, thay hạ tầng deploy, cổng thanh toán online, máy in bếp/POS, hợp nhất code với gaeru.
