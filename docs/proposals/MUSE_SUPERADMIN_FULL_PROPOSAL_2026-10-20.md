# Super Admin — Báo cáo pentest, mô tả hiện trạng & đề xuất xây dựng năng lực quản trị toàn diện

**Đối tượng:** khu vực Super Admin `https://order-app-ddho.onrender.com/admin`, repo `dothuongton/order_app`.
**Cơ sở:** code **nhánh main mới nhất — commit `aceb906` (2026-10-20 15:15)**, đã kéo về và đối chiếu toàn bộ (server deploy từ main mới nhất; main không có commit mới hơn tại thời điểm viết). Kết hợp kiểm chứng trực tiếp trên bản deploy cùng ngày.
**Tài liệu này bổ sung và thay thế phần đề xuất trong** `order_app_admin_review_2026-10-20.md` (báo cáo pentest/UI-UX admin buổi chiều) — các phát hiện ở đó vẫn giữ nguyên hiệu lực trừ khi mục dưới đây ghi khác.
**Yêu cầu của chủ hệ thống (nguyên văn ý):**
1. Super admin phải **quản lý được tất cả thông tin của quán**.
2. Hệ thống phải **ghi log để xử lý các trường hợp phát sinh**.
3. Super admin cần **đồng bộ dữ liệu của quán, thêm/sửa/xóa được mọi thứ trong quán để hỗ trợ quán**.
4. Đề xuất phải bao quát **UI, UX, design system, kiến trúc** để Codex triển khai.

---

# PHẦN A — PENTEST (trạng thái tại main @ aceb906)

| Mã | Mức độ | Trạng thái | Phát hiện & bằng chứng |
|---|---|---|---|
| P-01 | CRITICAL | **Còn mở** | Trang đăng nhập `/admin` điền sẵn cả email + mật khẩu và in công khai dòng tài khoản mẫu `superadmin@qrorder.vn / admin123` (`frontend/src/pages/admin/AdminLogin.tsx` dòng 10–11, 99). Đã xác minh trên bản deploy. |
| P-02 | HIGH | **Còn mở** | Form tạo quán đặt sẵn mật khẩu chủ quán là chuỗi cứng `admin123` cho mọi quán mới (`frontend/src/components/admin/CreateShopModal.tsx` dòng 18). Mật khẩu mặc định đồng loạt, trùng cả mật khẩu super admin. |
| P-03 | HIGH | **Còn mở** | `AdminService.createShop` sinh 5 bàn mặc định với mã QR đoán được `qr-{slug}-b1..b5` (`backend/src/modules/admin/admin.service.ts` dòng 291), trong khi luồng tạo bàn phía quán đã có hậu tố ngẫu nhiên. |
| P-04 | MEDIUM | **Còn mở** | `createShop`: email chủ quán đã tồn tại → gán vai trò owner cho tài khoản có sẵn và bỏ qua mật khẩu khởi tạo (dòng 252, 265 — `ON CONFLICT DO UPDATE` no-op + upsert membership owner). Nhầm lẫn sở hữu/quán bị gán cho người khác. |
| P-05 | MEDIUM | **Còn mở** | Toàn hệ thống không có chức năng đổi mật khẩu cho bất kỳ vai trò nào (đã rà toàn repo). Super admin đang dùng mật khẩu mặc định đã công khai (P-01) và không tự đổi được qua giao diện/API. |
| P-06 | MEDIUM | **Còn mở** | Nhật ký kiểm toán bao phủ ~5/41 endpoint ghi dữ liệu (chi tiết Phần C.2): không ghi đăng nhập (kể cả đăng nhập thất bại), không ghi thay đổi giá món, hủy món, tất toán, quản lý tài khoản nhân viên. Không đáp ứng yêu cầu "ghi log để xử lý phát sinh". |
| P-07 | MEDIUM | **Còn mở** | Token super admin (JWT 7 ngày) được lưu đồng thời ở cookie HttpOnly **và** localStorage (`AdminLogin.tsx` dòng 30). Bản sao localStorage làm mất ý nghĩa của HttpOnly: một lỗ XSS bất kỳ trong khu vực admin là lộ token toàn quyền 7 ngày. Nên chỉ dùng cookie cho khu vực admin. |
| P-08 | LOW | **Còn mở** | Một số route admin trả `err.message` thô trong response 500 (lộ chi tiết lỗi nội bộ/DB). |
| P-09 | LOW | Mới | Các thao tác ghi phía admin không có rate limit riêng: `loginLimiter` (20 lần/15 phút) chỉ phủ đăng nhập; `staffMutationLimiter` chỉ áp cho router staff. Token admin bị lộ (P-07) là có thể ghi hàng loạt không bị throttle. |
| — | — | **Đã sửa** | Cơ chế ghi đè mật khẩu super admin về `admin123` mỗi lần khởi động đã bị gỡ (commit `6672ae6`); super admin chỉ còn được tạo ở `seed.ts`. Xem báo cáo admin buổi chiều, mục A-02. |

**Đã kiểm chứng đạt (live, 2026-10-20, trên bản deploy = main @ aceb906):**
- Ranh giới quyền trên cả endpoint mới `GET /admin/shops/:id`: super admin → 200, token nhân viên quán → 403, không token → 401. Middleware `authenticateSuperAdmin` kiểm tra lại cờ `is_platform_admin` trong DB ở mỗi request (thu hồi quyền hiệu lực ngay).
- Chống SQL injection tại ô tìm kiếm quán: chuỗi `' OR '1'='1` trả về 0 quán — truy vấn tham số hóa đúng.
- Header bảo mật trên `/admin`: HSTS 1 năm, X-Frame-Options DENY, CSP dạng Report-Only với chính sách hợp lý (`default-src 'self'`, `frame-ancestors 'none'`) — còn thiếu: chuyển CSP sang enforce.
- Cookie `admin_token`/`staff_token`: HttpOnly + Secure (production) + SameSite=Lax, 7 ngày; JWT có `jti` và hệ thống có bảng thu hồi token; có middleware chặn thao tác ghi cross-site theo Origin (`protectOrigin`); giới hạn đăng nhập 20 lần/15 phút.
- Frontend không dùng `dangerouslySetInnerHTML` ở bất cứ đâu — nội dung CMS của quán không tạo được XSS khi super admin xem.

---

# PHẦN B — HIỆN TRẠNG NĂNG LỰC QUẢN TRỊ (ma trận thực thể)

Hệ thống có 31 bảng dữ liệu. Cột "Phía quán" = nhân viên quán tự làm được; "Super Admin" = khả năng hiện tại qua khu vực admin.

| Nhóm dữ liệu | Phía quán | Super Admin hiện tại |
|---|---|---|
| Quán (tenants): hồ sơ, trạng thái | Xem/cập nhật hồ sơ của mình | ✅ Danh sách + chi tiết + tạo + sửa hồ sơ/trạng thái |
| Tài khoản người dùng (users) | Quản lý nhân viên trong quán (qua staff) | ❌ Không danh sách, không xem, không khóa, không đặt lại mật khẩu |
| Vai trò trong quán (memberships) | Gán trong phạm vi quán | ❌ Không xem/không gán — cả 2 quán mẫu đang hiện "Chưa gán chủ quán" và không có thao tác gán |
| Bàn & mã QR (tables) | Tạo/sửa/xóa bàn, mở bàn | ❌ Chỉ được tạo tự động 5 bàn khi tạo quán (mã đoán được — P-03); không xem/sửa/xóa từng bàn |
| Thực đơn (categories, items, variants, option groups/options) | Tạo/sửa/xóa món, đổi giá, bật/tắt hết món | ❌ Không truy cập được |
| Đơn & món đã gọi (orders, order_items, parts, events) | Tiếp nhận/phục vụ/hủy theo món | ❌ Không xem được đơn của quán |
| Phiên bàn (table_sessions, guest_sessions) | Mở/đóng phiên, chốt tiền | ❌ Không xem/không can thiệp được |
| Thanh toán (bills, bill_lines, manual_settlement_confirmations) | Xác nhận tất toán thủ công | ⚠️ Chỉ thấy tổng gộp toàn nền tảng ở trang thống kê; không xem theo quán, không xác nhận/đảo tất toán |
| Khuyến mãi (promotions, redemptions) | Tạo/sửa/xóa qua CMS | ❌ Không truy cập được |
| CMS quán (drafts, published versions, banners) | Soạn/xuất bản/rollback, banner | ⚠️ Chỉ có danh sách mẫu giao diện (templates) dạng đọc; không xem/sửa/xuất bản hộ quán |
| Yêu cầu hỗ trợ (service_requests) | Tiếp nhận/hoàn tất | ❌ Không xem được |
| Nhật ký kiểm toán (audit_logs) | — | ⚠️ Có danh sách + lọc theo quán/loại hành động ở API; giao diện chưa có bộ lọc; nội dung bao phủ rất hẹp (Phần C.2) |
| Ảnh tải lên (uploaded_images) | Tải lên qua CMS (có kiểm tra magic bytes, ≤5MB) | ❌ Không quản lý được |

**Kết luận Phần B:** ngoài hồ sơ quán ở mức nông, super admin hiện **không quản lý được thông tin vận hành nào bên trong quán** — chưa đạt yêu cầu 1 và 3 của chủ hệ thống. Đây là khoảng trống năng lực chính cần xây, không phải lỗi lặt vặt.

---

# PHẦN C — ĐỀ XUẤT THEO 3 YÊU CẦU CỐT LÕI

## C.1 · Quản lý toàn bộ thông tin quán (yêu cầu 1 + 3)

Nguyên tắc kiến trúc bắt buộc:
- **Không viết logic nghiệp vụ song song cho admin.** Mọi thao tác của admin lên dữ liệu quán phải đi qua chính service mà phía quán đang dùng (staff/cms/guest services), bọc thêm: (a) xác thực platform admin thay vì membership của quán, (b) cờ `actor=platform_admin` + lý do hỗ trợ (bắt buộc nhập khi can thiệp vận hành), (c) ghi audit (Phần C.2). Viết đường riêng sẽ tạo hai nguồn sự thật và lỗi lệch hành vi.
- **Hủy bỏ theo tầng:** mặc định **lưu trữ/mềm** (trạng thái archived / is_active=false) và khôi phục được; **xóa cứng chỉ cho dữ liệu chưa phát sinh giao dịch** (bàn chưa từng có phiên, món chưa từng được gọi, quán nháp) và phải qua xác nhận 2 bước. Dữ liệu tài chính (bills, settlements) **không bao giờ xóa cứng** — chỉ đảo bút toán bằng bản ghi đối ứng.
- Cấu trúc API đề xuất (mở rộng module admin hiện tại, giữ nguyên quy ước phân trang/lọc đã có):
  - `GET /admin/shops/:id/overview|tables|menu|orders|sessions|staff|settlements|cms|audit`
  - `POST|PATCH|DELETE /admin/shops/:id/tables[/:tableId]`, `.../menu/...`, `.../staff/...` — ánh xạ 1-1 với năng lực phía quán (ma trận Phần B), cộng `POST /admin/shops/:id/staff/:userId/reset-password`, `POST /admin/shops/:id/assign-owner`, `POST /admin/shops/:id/cms/publish|rollback`.
- Mọi thao tác can thiệp vận hành trực tiếp (hủy món hộ, đóng phiên hộ, đảo tất toán) yêu cầu **lý do** (text, lưu vào audit) và hiển thị phía quán là "được Super Admin thực hiện" — minh bạch hai chiều.

## C.2 · Ghi log để xử lý các trường hợp phát sinh (yêu cầu 2)

Hiện trạng đo được: toàn hệ thống có ~41 endpoint ghi dữ liệu (staff 20, cms 11, push 3, guest 3, auth 2, admin 2) nhưng chỉ **5 vị trí ghi audit** (2 ở admin service: tạo/sửa quán; 3 ở cms service: sửa hồ sơ, xuất bản, rollback CMS). Không có helper ghi log dùng chung — mỗi nơi tự viết INSERT.

Đề xuất:
1. **Một helper ghi audit duy nhất** (`audit.record(...)`) dùng cho mọi module; quy tắc bao phủ bắt buộc: *mọi thao tác ghi dữ liệu đều ghi audit* — kèm test tự động liệt kê endpoint ghi nào chưa qua helper.
2. **Sự kiện bắt buộc bổ sung ngay:** đăng nhập thành công/thất bại, đăng xuất, đổi/đặt lại mật khẩu; mọi CRUD của admin (Phần C.1); phía quán: đổi giá món, hủy món/đơn, đóng phiên không thu tiền, xác nhận/đảo tất toán, tạo/khóa tài khoản nhân viên, thay đổi quyền. (Đơn khách đặt món là dữ liệu vận hành, đã có order_item_events — không cần nhân đôi vào audit.)
3. **Mở rộng schema audit_logs:** thêm `actor_role` (super_admin/owner/manager/staff/guest/system), `ip_address`, `user_agent`; `details` JSONB chuẩn hóa dạng `{before, after, reason}` cho mọi thao tác sửa/xóa. Hiển thị diff dạng trực quan hai cột ở UI (thay khối JSON thô hiện tại).
4. **Bất biến thật:** không tồn tại endpoint sửa/xóa audit; ở tầng DB, thu quyền UPDATE/DELETE trên bảng `audit_logs` khỏi tài khoản ứng dụng (hoặc trigger chặn) — hiện "append-only" mới là khẩu hiệu trên giao diện.
5. **Tra cứu:** giao diện audit bổ sung bộ lọc theo quán/người thực hiện/loại hành động/khoảng ngày + tìm kiếm + xuất CSV (API đã có nền lọc tenantId/action + phân trang). Đề xuất thời hạn lưu: tối thiểu 12 tháng trực tuyến (cần chủ hệ thống chốt — xem câu hỏi mở).

## C.3 · Đồng bộ dữ liệu (yêu cầu 3)

- **Một nguồn sự thật duy nhất:** dữ liệu quán nằm ở DB dùng chung; khu vực admin không có bản sao/cache riêng. Mọi sửa đổi của admin có hiệu lực ngay cho phía quán và phía khách ở lần tải dữ liệu kế tiếp.
- **Đồng bộ thời gian thực:** hệ thống đã có cổng phát sự kiện tập trung (`backend/src/realtime/socket.ts`, có kiểm tra quyền người nhận). Mọi mutation từ admin phải phát **đúng sự kiện** mà mutation tương đương phía quán phát (đổi menu → sự kiện menu; đổi trạng thái bàn/phiên → sự kiện tương ứng) để cổng staff và màn hình khách đang mở tự cập nhật, không cần tải lại. Tiêu chí nghiệm thu cho từng issue CRUD: sửa ở admin → màn hình staff đang mở thay đổi trong vài giây.
- **Chống xung đột sửa đồng thời:** dùng mẫu sẵn có của CMS (draft/phiên bản published + rollback) cho nội dung giao diện; với hồ sơ/menu dùng kiểm tra `updated_at` (optimistic locking) — ai lưu sau trên dữ liệu đã cũ sẽ nhận lỗi 409 kèm bản mới nhất để đối chiếu, không ghi đè âm thầm.
- **CMS qua admin** vẫn phải đi đường draft → publish như quán tự làm (không ghi thẳng bản published) để giữ khả năng rollback và tính nhất quán phiên bản.

---

# PHẦN D — UI/UX & DESIGN SYSTEM

**Hiện trạng (đã kiểm chứng live + code tại main @ aceb906):**
- Khu vực admin dùng hệ màu slate + điểm nhấn indigo/xanh dương, layout desktop sidebar + panel trượt; cổng staff/khách dùng cam thương hiệu (`#ea580c`). **Hai ngôn ngữ thiết kế tách rời**, không có thư viện component/token dùng chung (admin có 12 component riêng trong `frontend/src/components/admin/`).
- Lỗi đã biết cần xử lý trong quá trình xây: panel chi tiết quán luôn hiện 0 bàn/0đ do lệch hợp đồng dữ liệu (API trả `metrics.tableCount/totalRevenue` lồng, giao diện đọc field phẳng — sửa frontend + thêm contract test); 3 nút chết (Cài đặt/Thông báo/Hỗ trợ); màn Phân quyền là dữ liệu cứng phía frontend kèm thuật ngữ sót của template giáo dục ("khóa học", "học liệu"); Analytics không biểu đồ/khoảng ngày/xuất dữ liệu; hiển thị giờ tương đối sai (cùng một mục nhảy 6h ↔ 22h); danh sách quán chưa dùng phân trang mà API đã hỗ trợ; toàn bộ admin là SPA một URL — không deep-link tới từng quán/màn hình.

**Đề xuất thiết kế:**
1. **Không gian làm việc theo quán (Shop Workspace):** từ danh sách quán, mở quán thành một workspace có tab: Tổng quan · Bàn & QR · Thực đơn · Đơn & Phiên · Nhân viên · CMS · Tất toán · Nhật ký — mỗi tab ánh xạ 1-1 ma trận Phần B/C.1. Deep-link dạng `/admin/shops/:id/:tab`.
2. **Design system tối thiểu dùng chung:** bộ token (màu trạng thái dùng chung toàn hệ thống: chờ/chấp nhận/hoàn tất/hủy phải cùng một màu ở admin, staff và khách; khoảng cách; cỡ chữ; bo góc) + các component chuẩn: bảng dữ liệu (sắp xếp/lọc/phân trang), thanh lọc, ngăn chi tiết, hộp xác nhận hành động phá hủy (ghi rõ hệ quả + yêu cầu lý do khi can thiệp vận hành), badge trạng thái, trạng thái rỗng/đang tải/lỗi. Admin có thể giữ tông slate trung tính, nhưng token trạng thái và component phải dùng chung với phía quán.
3. **Mẫu thao tác nguy hiểm thống nhất:** hành động không hoàn tác được → hộp xác nhận nêu rõ đối tượng + hệ quả + nút màu đỏ; hành động can thiệp vận hành → thêm ô lý do bắt buộc (đi vào audit C.2); mọi thao tác xong có toast + mục tương ứng xuất hiện ngay trong tab Nhật ký của quán.
4. **Trạng thái giao diện đầy đủ** cho mọi màn mới: skeleton khi tải, rỗng có hướng dẫn, lỗi có nút thử lại — theo chuẩn đã áp dụng ở các issue CMS hiện tại.

---

# PHẦN E — KIẾN TRÚC & LỘ TRÌNH

- **Module admin mở rộng theo sub-resource** như C.1; service nghiệp vụ dùng chung; một `audit.record` dùng chung (C.2); phát sự kiện qua cổng realtime hiện có (C.3). Tôn trọng kỷ luật lane của repo (boundary check) — issue thuộc lane nào ghi rõ lane đó, thay đổi Core/shared đi qua issue điều phối như quy trình hiện tại.
- **Phân quyền trong khu vực admin (đề xuất):** hai cấp — `super_admin` (toàn quyền) và `support` (xem + hỗ trợ giới hạn, không xóa/không đảo tất toán/không quản lý tài khoản admin). Cần chủ hệ thống chốt (câu hỏi mở 2).
- **Lộ trình:** P0 vá bảo mật (Phần F, SA-01→05) → P1 nền audit + workspace đọc (SA-06→10) → P2 CRUD hỗ trợ + đồng bộ realtime (SA-11→15) → P3 hoàn thiện (SA-16→20). Mỗi issue: một nhánh, một PR, có acceptance criteria và kiểm chứng boundary/build như quy trình hiện hành; không tự merge.

---

# PHẦN F — DANH MỤC ISSUE ĐỀ XUẤT CHO CODEX

**P0 — Bảo mật nền tảng**
- **SA-01** Bỏ điền sẵn + dòng in thông tin đăng nhập ở trang admin; bỏ mọi tài khoản mẫu khỏi giao diện đăng nhập. *Nghiệm thu:* trang đăng nhập trống hoàn toàn; grep frontend không còn chuỗi mật khẩu mặc định. (P-01)
- **SA-02** Bỏ mật khẩu cứng `admin123` trong form tạo quán: sinh mật khẩu ngẫu nhiên một lần, hiển thị đúng một lần cho người tạo, chủ quán buộc đổi ở lần đăng nhập đầu. (P-02)
- **SA-03** Dùng một hàm sinh mã QR bàn không đoán được cho mọi đường tạo bàn (gồm createShop). (P-03)
- **SA-04** createShop từ chối email đã tồn tại (hoặc luồng mời/ xác nhận sở hữu riêng); không gán owner âm thầm. (P-04)
- **SA-05** Chức năng đổi mật khẩu cho super admin + cơ chế "buộc đổi mật khẩu mặc định ở lần đăng nhập đầu" cho mọi tài khoản được cấp. (P-05)

**P1 — Nền log & không gian quản trị**
- **SA-06** Helper `audit.record` dùng chung + bao phủ: sự kiện đăng nhập (thành công/thất bại), mọi thao tác ghi phía admin, các thao tác nhạy cảm phía quán (giá, hủy, tất toán, tài khoản); mở rộng schema (actor_role, ip, user_agent, before/after/reason); chặn UPDATE/DELETE audit ở tầng DB. (P-06, C.2)
- **SA-07** Giao diện nhật ký: lọc theo quán/người/hành động/khoảng ngày, tìm kiếm, xuất CSV, diff trực quan hai cột. (C.2)
- **SA-08** Shop Workspace (chỉ-đọc ở giai đoạn này): các tab Tổng quan/Bàn/Thực đơn/Đơn & Phiên/Nhân viên/Tất toán/Nhật ký dùng service phía quán với phạm vi platform; deep-link theo quán + tab. (C.1, D.2)
- **SA-09** Sửa lỗi panel chi tiết hiện 0 (đọc `metrics.*`) + thêm contract test cho các response admin để không tái diễn lệch field. (D)
- **SA-10** Quản lý người dùng & vai trò trong quán: danh sách users toàn nền tảng, xem membership, gán/thay chủ quán, khóa/mở tài khoản, đặt lại mật khẩu (kèm audit). (B, C.1)

**P2 — CRUD hỗ trợ quán & đồng bộ**
- **SA-11** Admin CRUD bàn & QR (tạo/sửa/lưu trữ, cấp lại mã QR) + phát sự kiện realtime; màn staff đang mở cập nhật không cần tải lại. (C.1, C.3)
- **SA-12** Admin CRUD thực đơn (danh mục/món/biến thể/topping, giá, hết món) qua service menu phía quán + audit before/after cho thay đổi giá. (C.1)
- **SA-13** Hỗ trợ vận hành trực tiếp: xem phiên/đơn đang mở của quán; hủy món/đóng phiên hộ với lý do bắt buộc; phía quán thấy rõ "Super Admin đã thực hiện". (C.1)
- **SA-14** Hỗ trợ CMS: xem draft/bản published của quán, publish/rollback hộ qua đúng luồng draft→publish; quản lý mẫu giao diện (tạo/sửa/kích hoạt template). (C.1, C.3)
- **SA-15** Tất toán theo quán: danh sách phiên tất toán, chi tiết bill, xác nhận/đảo tất toán bằng bút toán đối ứng (không xóa cứng) + audit đầy đủ. (C.1)

**P3 — Hoàn thiện**
- **SA-16** Màn Cài đặt nền tảng thật (thông tin hệ thống, chính sách mật khẩu/phiên) và xử lý dứt điểm 3 nút chết: nối chức năng hoặc gỡ khỏi giao diện.
- **SA-17** Phân quyền nối backend thật (vai trò nền tảng super_admin/support) hoặc gỡ ma trận mô phỏng hiện tại; dọn thuật ngữ template giáo dục.
- **SA-18** Analytics: biểu đồ theo thời gian, lọc khoảng ngày, tách theo quán, xuất báo cáo.
- **SA-19** Design system: token trạng thái + component chuẩn dùng chung admin/staff; sửa lỗi hiển thị giờ tương đối; danh sách quán dùng phân trang của API.
- **SA-20** Chuẩn hóa lỗi API admin (không lộ `err.message`) + rate limit cho thao tác ghi phía admin + admin chỉ dùng cookie HttpOnly (bỏ bản sao token ở localStorage). (P-07, P-08, P-09)

## Câu hỏi mở — chủ hệ thống chốt, Codex không tự quyết
1. Chính sách xóa: chấp nhận "lưu trữ mềm là mặc định, xóa cứng chỉ cho dữ liệu chưa phát sinh giao dịch" như C.1 không?
2. Có cần vai trò `support` chỉ-xem/hạn chế trong khu vực admin không, hay mọi quản trị viên đều toàn quyền?
3. Admin có được **đăng nhập hộ (impersonation)** vào cổng staff của quán để hỗ trợ không? (Nếu có: bắt buộc ghi log + banner cảnh báo trong suốt phiên hộ.)
4. Thời hạn giữ audit log tối thiểu bao lâu (đề xuất 12 tháng)?
5. Giao diện admin giữ tông slate/indigo riêng hay hợp nhất hẳn về cam thương hiệu theo design system chung (D.2)?

## Phụ lục — Minh bạch kiểm tra
- Code: đã kéo main mới nhất (`aceb906`) trước khi viết; mọi trích dẫn file/dòng theo bản này.
- Live: đăng nhập super admin + tài khoản nhân viên để kiểm tra ranh giới (200/403/401), thử chuỗi SQL injection ở ô tìm kiếm (an toàn), kiểm tra bộ lọc audit theo quán và header bảo mật. Không tạo/sửa/xóa bất kỳ dữ liệu nào; vòng kiểm tra giao diện admin trực tiếp trước đó cùng ngày (trên cùng bản deploy) ở chế độ chỉ quan sát.
