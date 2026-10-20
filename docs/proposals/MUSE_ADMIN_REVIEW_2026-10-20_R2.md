# Báo cáo Pentest + UI/UX khu vực Super Admin (/admin) — QR Order app

**Đối tượng:** https://order-app-ddho.onrender.com/admin (nền tảng QR Order, repo `dothuongton/order_app`).
**Ngày kiểm tra:** 2026-10-20 · **Bối cảnh:** app đang giai đoạn TEST theo xác nhận của chủ hệ thống; các tài khoản/tài khoản mẫu là chủ đích — báo cáo này là checklist trước go-live.
**Phương pháp:** (1) kiểm tra trực tiếp trên bản deploy bằng tài khoản super admin, chế độ **chỉ quan sát** — mở mọi màn hình/panel/hộp thoại, không tạo/sửa/tạm dừng/lưu trữ/lưu bất cứ thứ gì; (2) gọi API admin trực tiếp để kiểm chứng ranh giới quyền; (3) đọc code backend module admin + frontend trong clone repo.
**Cơ sở code:** toàn bộ phát hiện dựa trên code đã được đối chiếu với **nhánh `main` mới nhất (commit `aceb906`, 2026-10-20 15:15)** — server deploy từ main mới nhất. Bản thảo đầu của báo cáo này dùng bản clone cũ (main @ `1a773f7` sáng 20/10); một số lỗi đã được sửa ngay trong ngày và được ghi rõ trạng thái "đã sửa" kèm commit bên dưới. Phát hiện ghi "live" là quan sát trên bản deploy; ghi "theo code" là từ main mới nhất.

---

# PHẦN A — PENTEST KHU VỰC ADMIN

## A-01 · [CRITICAL — live] Trang đăng nhập admin điền sẵn và in công khai thông tin đăng nhập super admin
Trang `/admin` tự điền sẵn cả email lẫn mật khẩu và in ở cuối thẻ dòng "Tài khoản mẫu: superadmin@qrorder.vn / admin123". Bất kỳ ai mở trang cũng đăng nhập được toàn quyền nền tảng. Trong code: `AdminLogin.tsx` đặt giá trị mặc định cho cả hai trường và in dòng tài khoản mẫu. Đồng thời trang không có link quên mật khẩu/đặt lại mật khẩu.

## A-02 · [ĐÃ SỬA ở main mới nhất — tồn dư MEDIUM] Cơ chế ghi đè mật khẩu super admin khi khởi động đã bị gỡ; vẫn chưa có chức năng đổi mật khẩu
Tại thời điểm pentest buổi sáng (main @ `1a773f7`), `auto-migrate.ts` và `migrate.ts` UPSERT tài khoản super admin với hash bcrypt cố định (= `admin123`) và ghi đè `password_hash` sau mỗi lần khởi động — đã chứng minh thực nghiệm trên bản local: đổi hash trong DB → khởi động lại → mật khẩu bị hoàn nguyên về `admin123`. **Trong main mới nhất, cơ chế này đã bị gỡ** (commit `6672ae6` "finish safe admin bootstrap"): cả hai file không còn nhắc tới super admin, tài khoản chỉ được tạo một lần ở `seed.ts` — đổi hash trực tiếp trong DB từ nay sẽ không bị hoàn nguyên nữa. **Tồn dư:** (1) mật khẩu hiện hành vẫn là `admin123` đã bị công khai (A-01); (2) toàn hệ thống vẫn **không có endpoint/UI đổi mật khẩu** cho bất kỳ vai trò nào (đã rà toàn repo) — muốn đổi vẫn phải can thiệp DB thủ công. Cần xử lý cùng A-01 trước go-live.

## A-03 · [HIGH — theo code] Quán tạo qua admin được sinh 5 bàn với mã QR đoán được
`AdminService.createShop` (bước 5) tạo 5 bàn mặc định với `public_qr_id = qr-{slug}-b1 … b5` — không hậu tố ngẫu nhiên, trong khi luồng tạo bàn phía quán đã có hậu tố 6 hex ngẫu nhiên. Mọi quán onboard qua admin đều mang sẵn lỗ hổng liệt kê bàn đã được xác minh ở vòng pentest chính (đoán mã → xem menu/phiên của bàn). Khắc phục: dùng chung một hàm sinh mã bàn không đoán được cho mọi đường tạo bàn.

## A-04 · [MEDIUM — theo code] Tạo quán gán quyền chủ quán cho tài khoản có sẵn theo email, bỏ qua mật khẩu khởi tạo
`createShop` (bước 2–3): nếu email chủ quán đã tồn tại trong bảng users, câu lệnh `ON CONFLICT (email) DO UPDATE SET email = users.email` trả về tài khoản cũ **mà không đặt mật khẩu mới**, sau đó gán membership vai trò `owner` cho tài khoản đó. Hệ quả: (a) mật khẩu khởi tạo admin vừa đặt không dùng được, "chủ quán" thực tế là một người khác đã có tài khoản; (b) nếu email thuộc về nhân viên của quán khác, người đó âm thầm thành chủ quán mới. Cần: từ chối tạo quán khi email đã tồn tại, hoặc có luồng mời/xác nhận sở hữu riêng.

## A-05 · [MEDIUM — live] Nhật ký kiểm toán không bao phủ hành động quản trị và đăng nhập
Toàn bộ log trên hệ thống hiện có 29 dòng, chỉ gồm 2 loại sự kiện phía quán (`SHOP_UPDATE_PROFILE` ×17, `SHOP_PUBLISH_CMS` ×12) của một quản lý quán trên một quán. Không có sự kiện đăng nhập (thành công hay thất bại), không có sự kiện super admin (tạo/tạm dừng quán, đổi quyền). Theo code, chỉ có 2 nơi ghi audit: `admin.service` (tạo/sửa quán) và `cms.service` — đăng nhập, đơn hàng, tất toán, quản lý nhân viên đều không ghi. (Điểm đã cải thiện ở main mới nhất: API `listAuditLogs` đã hỗ trợ lọc theo quán + loại hành động và phân trang — khoảng trống bộ lọc giờ nằm ở giao diện, xem B-06.) Màn hình tự mô tả là "chuẩn bất biến (Append-only ledger)" nhưng hiện không trả lời được câu hỏi điều tra cơ bản: ai đã đăng nhập, ai đã khóa quán, khi nào. Giao diện hiển thị được tên người thực hiện; qua API, trường email người thực hiện trả về trống ở cả 29 dòng.

## A-06 · [LOW — theo code] Lỗi API admin lộ thông điệp nội bộ
Một số route admin trả `err.message` thô trong response 500, có thể lộ chi tiết lỗi DB/nội bộ cho người gọi — nên chuẩn hóa thông điệp ra ngoài và ghi chi tiết vào log phía server. (Ghi chú đối chiếu: danh sách quán và audit-logs ở main mới nhất đã có phân trang chuẩn page/limit, limit tối đa 100, nhất quán với bản deploy — khác với bản clone cũ.)

## Các điểm ĐẠT (đã kiểm chứng live + code)
- **Ranh giới quyền đứng vững:** token nhân viên quán gọi `GET /admin/shops` → 403; `POST /admin/shops` → 403; không token → 401; token super admin → 200 (gọi trực tiếp ngày 2026-10-20).
- **Middleware kiểm tra quyền đúng cách:** `authenticateSuperAdmin` xác thực JWT **và truy vấn lại cờ `is_platform_admin` trong DB ở mỗi request** → thu hồi quyền quản trị có hiệu lực ngay, không phải chờ token hết hạn.
- Đầu vào tạo quán được validate bằng zod (slug theo pattern, mật khẩu tối thiểu 8 ký tự và ≤72 byte theo giới hạn bcrypt, email chuẩn hóa chữ thường); mật khẩu chủ quán băm bcrypt; tham số `:id` bị kiểm tra định dạng UUID; hành động tạo/sửa quán có ghi audit (theo code).

---

# PHẦN B — UI/UX KHU VỰC ADMIN (live)

## B-01 · Khung chung — làm tốt hơn hẳn cổng staff
Khác với cổng nhân viên (khóa cột điện thoại ~512px), khu vực admin dùng layout desktop đúng nghĩa: sidebar trái cố định ~255px, nội dung chiếm hết bề ngang còn lại, thẻ trắng bo góc, nút chính to rõ. Điểm trừ: toàn bộ là SPA tại **một URL duy nhất `/admin`** — không deep-link được tới từng màn hình/quán (không gửi link, không bookmark, nút Back của trình duyệt không có tác dụng điều hướng).

## B-02 · Dashboard
- 4 thẻ chỉ số (Tổng số Quán, Quán Đang Mở, Cần Rà Soát, Tổng Doanh Thu 3.723.600đ "Từ 15 phiên tất toán") + danh sách quán hoạt động + cột "Hoạt động gần đây".
- **Nhãn tăng trưởng "+12%" là số tĩnh trang trí** (2 quán thì không có cơ sở tính tăng trưởng); chữ "BÁO CÁO ĐẦY ĐỦ" ở góc là text không bấm được.
- Cột "Hoạt động gần đây": mọi mục đều ghi chung một câu "Thao tác hệ thống — Quán: … bởi …" — không hiển thị loại hành động thật dù dữ liệu audit có.
- **Lỗi hiển thị giờ tương đối:** cùng một mục hiện "6 giờ trước" ở lần tải đầu và "22 giờ trước" vài phút sau (mốc thật ~22 giờ) — hàm tính giờ tương đối không đáng tin.

## B-03 · Quản lý Quán
- Bảng 6 cột (Tên & đường dẫn, Chủ quán, Bàn & Đơn, Doanh thu, Trạng thái, nút chi tiết) + 4 tab lọc trạng thái + ô tìm kiếm toàn cục trên thanh trên (đã kiểm chứng lọc đúng theo tên/slug/email). Trạng thái rỗng hiển thị đẹp kèm nút tạo quán.
- Thiếu: sắp xếp theo cột, phân trang, xuất dữ liệu. (Danh sách quán phía API cũng không phân trang — xem thêm tài liệu scale 1000 quán.)
- **Cả 2 quán đều hiện chủ quán "Chưa gán"** — vì dữ liệu mẫu tạo membership vai trò quản lý chứ không có vai trò "chủ quán" (owner), và giao diện **không có thao tác nào để gán chủ quán** cho quán đã tồn tại.

## B-04 · Panel chi tiết quán — số liệu sai lệch với danh sách (lỗi dữ liệu hiển thị)
Panel trượt bên phải gồm: trạng thái, phiên bản giao diện, thông tin liên hệ, tài khoản chủ quán, 2 ô thống kê và 3 nút vòng đời (Chỉnh sửa / Tạm dừng / Lưu trữ "Zero Hard-Delete"). Nhưng **2 ô thống kê luôn bằng 0**: Đà Lạt Phố hiện "Tổng số bàn: 0, Doanh thu chốt: 0đ" trong khi bảng danh sách ghi 5 bàn và 3.723.600đ; Sakura tương tự (bảng: 2 bàn). **Nguyên nhân đã xác định trong code main mới nhất:** API chi tiết quán trả số liệu lồng trong object `metrics` (`metrics.tableCount`, `metrics.orderCount`, `metrics.totalRevenue` — câu SQL tính đúng), nhưng `AdminRightDrawer.tsx` (dòng 277, 283) lại đọc field phẳng `shop.tableCount` / `shop.totalRevenue` → không tồn tại → hiển thị 0. Đây là lệch hợp đồng dữ liệu frontend ↔ backend; sửa một phía là xong (khuyến nghị frontend đọc `shop.metrics.*`). Ngoài hồ sơ + 2 con số (sai) + 3 nút, panel **không có** đơn hàng, doanh thu theo thời gian, nhân viên, danh sách bàn hay lịch sử của quán. Hộp thoại "Chỉnh sửa" chỉ có 4 trường (tên, SĐT, địa chỉ, mô tả) và hiển thị ID quán dạng UUID thô; không sửa được slug/chủ quán qua giao diện (API có hỗ trợ slug nhưng UI không exposing).

## B-05 · Phân quyền — màn hình mô phỏng, sót thuật ngữ template giáo dục
- 4 thẻ vai trò kèm số tài khoản (SUPERADMIN 1, ADMIN 3, CASHIER 4, WAITER 8) và ma trận 9 checkbox quyền trong 3 nhóm — nhưng **nhãn quyền không nhất quán giữa các vai trò** và còn nguyên thuật ngữ của một template quản lý giáo dục: nhóm quyền tên "QUẢN LÝ KHÓA HỌC & QUÁN ĂN", quyền "Quản lý học liệu / thực đơn", nhắc "khóa học".
- Màn này chỉ có vai trò: **không có danh sách 16 tài khoản người dùng, không gán vai trò cho từng người, không tạo/khóa tài khoản**. Đã xác minh trong code main mới nhất: danh sách vai trò là hằng số cứng `INITIAL_SYSTEM_ROLES` trong frontend (`AdminDashboard.tsx` dòng 211) và API không có endpoint nào cho vai trò — nút "Lưu thay đổi" của ma trận **không thể lưu xuống server**.

## B-06 · Lịch sử thao tác (Audit Trail)
Có phân trang (15 dòng/trang, 2 trang) nhưng **không tìm kiếm, không lọc** theo quán/người/loại hành động/khoảng ngày, không xuất log — với nội dung hiện tại (xem A-05) thì màn này chưa dùng được cho điều tra. Nút "Xem Diff" mở panel chứa **một khối JSON thô duy nhất** phải cuộn ngang, đề nhãn "BEFORE / AFTER" nhưng không phải bản so sánh trực quan hai cột.

## B-07 · Analytics — chỉ là các con số, không có phân tích
Màn "Báo cáo & Phân tích" lặp lại đúng 4 thẻ chỉ số của Dashboard cộng 2 con số (83 lượt gọi món, 15 hóa đơn tất toán). **Không có bất kỳ biểu đồ nào**, không chọn khoảng ngày, không so sánh kỳ trước, không tách theo quán, không nút xuất báo cáo — mặc dù màn Phân quyền nhắc tới quyền "Xuất dữ liệu".

## B-08 · Ba nút chết trên khung chính
Đã bấm thử: bánh răng **Cài đặt** (không mở gì — không tồn tại màn cài đặt nền tảng), chuông **Thông báo** (có chấm đỏ nhưng không mở danh sách nào), mục **Hỗ trợ** cuối sidebar (không phản hồi). Cả ba là phần tử trang trí chưa nối chức năng, tạo kỳ vọng sai cho người vận hành.

## B-09 · [HIGH — theo code] Form tạo quán đặt sẵn mật khẩu chủ quán là `admin123` cho mọi quán mới
Hộp thoại "Tạo Quán Mới" có khối tài khoản chủ quán (họ tên, email, mật khẩu khởi tạo) và trường mật khẩu **đã có sẵn giá trị điền trước**. Đã xác định trong code main mới nhất: `CreateShopModal.tsx` (dòng 18) khởi tạo trường này bằng chuỗi cứng `'admin123'` — tức mọi quán tạo qua admin đều bắt đầu với mật khẩu chủ quán mặc định `admin123` (trùng cả mật khẩu super admin) trừ khi người tạo tự sửa. Đây là kiểu lỗ hổng "mật khẩu mặc định đồng loạt": phải bỏ giá trị mặc định — bắt buộc nhập, hoặc sinh ngẫu nhiên và hiển thị một lần cho người tạo.

## Chưa kiểm chứng được (giới hạn phạm vi chỉ-quan-sát)
Theo code main mới nhất, hai nút "Tạm dừng"/"Lưu trữ" **có** hộp thoại xác nhận riêng (`LifecycleConfirmModal.tsx`). Chưa kiểm chứng được: luồng khóa quán có kiểm tra điều kiện trước khi thực thi (phiên đang mở, đơn đang xử lý, công nợ chưa tất toán) hay chỉ xác nhận là khóa ngay — cần kiểm chứng riêng vì đây là hành động ảnh hưởng quán đang hoạt động.

---

# PHẦN C — CHỨC NĂNG QUẢN LÝ CÒN THIẾU

Đối chiếu với nhu cầu vận hành một nền tảng nhiều quán, các nhóm chức năng sau **không tồn tại** ở cả giao diện lẫn API đã biết:

**Quản lý quán**
1. Chi tiết quán sâu hơn mức hồ sơ: API `GET /admin/shops/:id` và panel chi tiết đã có ở mức hồ sơ + chỉ số tổng (đang lỗi hiển thị — xem B-04); còn thiếu danh sách bàn + mã QR của quán, nhân viên của quán, đơn hàng/phiên gần đây, doanh thu theo ngày/tuần/tháng ngay trong khu vực admin.
2. Gán/thay đổi chủ quán cho quán đã tồn tại (hiện cả 2 quán "Chưa gán" và không có thao tác gán).
3. Đặt lại mật khẩu cho chủ quán/nhân viên khi họ khóa tài khoản.
4. Đăng nhập hộ (impersonation có ghi log) để hỗ trợ quán.
5. Sắp xếp theo cột và xuất danh sách quán (CSV); tìm kiếm hiện mới ở mức cơ bản (tên/slug/email) và phân trang phía API đã có ở main mới nhất nhưng giao diện chưa thấy điều khiển phân trang.

**Người dùng & phân quyền**
6. Màn quản lý người dùng toàn nền tảng: danh sách tài khoản, quán thuộc về, trạng thái, lần đăng nhập cuối; tạo/khóa/mở khóa tài khoản.
7. Gán vai trò cho từng người dùng cụ thể (màn Phân quyền hiện chỉ là ma trận vai trò mô phỏng).
8. Quản lý chính tài khoản admin: tạo thêm quản trị viên, **đổi mật khẩu** (hiện không thể — xem A-02), 2FA cho super admin.

**Dữ liệu & báo cáo**
9. Biểu đồ doanh thu/đơn theo thời gian, lọc khoảng ngày, so sánh kỳ, xếp hạng quán; xuất báo cáo.
10. Audit log dùng được ở giao diện: backend đã có lọc theo quán + loại hành động và phân trang — giao diện cần bổ sung bộ lọc (gồm cả theo người thực hiện và khoảng ngày), tìm kiếm, xuất log; và bao phủ thêm sự kiện đăng nhập + hành động quản trị (xem A-05).

**Vận hành & nền tảng**
11. Màn cài đặt nền tảng (nút Cài đặt hiện là nút chết): thông tin hệ thống, email gửi đi, chính sách mật khẩu, bật/tắt đăng ký.
12. Quản lý mẫu giao diện (templates): API chỉ có đọc danh sách; giao diện admin không có màn templates — không tạo/sửa/gán mẫu được, dù mỗi quán có "phiên bản giao diện".
13. Thông báo thật cho admin (chuông hiện là trang trí) và kênh hỗ trợ (mục Hỗ trợ là nút chết).
14. Quản lý gói cước/thu phí quán (chưa có khái niệm này ở bất cứ đâu) — cần khi thương mại hóa.
15. Trạng thái hệ thống: sức khỏe dịch vụ, phiên bản deploy, việc nền (đối soát/backup) — chưa có.

---

# PHẦN D — ƯU TIÊN XỬ LÝ ĐỀ XUẤT

- **P0 (trước go-live):** A-01 bỏ điền sẵn/in mật khẩu ở trang đăng nhập · đổi ngay mật khẩu super admin mặc định + xây chức năng đổi mật khẩu (tồn dư A-02) · A-03 sinh mã QR bàn không đoán được trong luồng tạo quán · B-09 bỏ mật khẩu `admin123` đặt sẵn cho chủ quán trong form tạo quán.
- **P1 (giai đoạn pilot):** sửa panel chi tiết quán nối sai dữ liệu (B-04) · gán chủ quán + đặt lại mật khẩu chủ quán (C-2, C-3) · audit log ghi đăng nhập + hành động quản trị và có bộ lọc (A-05, C-10) · quản lý người dùng cơ bản (C-6) · dọn các nút chết và nhãn tĩnh gây hiểu nhầm (B-02, B-08) · sửa lỗi giờ tương đối (B-02).
- **P2:** Analytics có biểu đồ + khoảng ngày + xuất báo cáo (B-07, C-9) · phân quyền nối backend thật và dọn thuật ngữ template (B-05) · cài đặt nền tảng, quản lý templates (C-11, C-12) · deep-link cho từng màn hình (B-01).

## Phụ lục — Minh bạch thao tác kiểm tra
- Trên bản deploy: chỉ đăng nhập và quan sát; mọi hộp thoại đóng bằng Hủy/X; không tạo/sửa/tạm dừng/lưu trữ quán nào; không bấm nút tạm dừng/lưu trữ; không xác nhận thanh toán nào.
- Qua API: 2 lần đăng nhập kiểm thử (nhân viên + super admin) và các request đọc/kiểm tra quyền (403/401/200) — không có request ghi nào thành công ngoài đăng nhập.
- Không có dữ liệu nào bị thay đổi trong quá trình kiểm tra phần này.
