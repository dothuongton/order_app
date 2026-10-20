# GAERU SOFT V4.0 — Nền tảng SaaS F&B toàn diện

> **Tài liệu đặc tả tổng thể / Master Project README**  
> **Tên miền dự kiến:** https://soft.gaeru.com  
> **Phiên bản đặc tả:** V4.0 (hợp nhất V1.0–V3.2 và V4.0)  
> **Ngày cập nhật:** 19/10/2026  
> **Trạng thái:** Đã thống nhất phạm vi và định hướng kiến trúc. **Không đồng nghĩa các chức năng đã được lập trình, kiểm thử hoặc triển khai production.**

## 1. Tầm nhìn và phạm vi

GAERU SOFT là nền tảng **Software as a Service (SaaS)** do GAERU phát triển cho nhà hàng, quán cà phê và các doanh nghiệp F&B. Một chủ cửa hàng có thể tự đăng ký tài khoản, chọn gói dịch vụ, thiết lập thương hiệu, tạo nhân viên và vận hành đồng thời **QR Order tại bàn, POS, GAERU Online và GAERU Ship** trên cùng dữ liệu. V4.0 mở rộng thêm quản lý kho/giá vốn, khách hàng thân thiết, marketing, đặt bàn, quản lý chuỗi, kiosk, nhân sự và trợ lý AI.

### Nguyên tắc bất biến

1. **Một tenant, nhiều brand/chi nhánh:** không trộn dữ liệu giữa khách thuê.
2. **Một Product Catalog và Unified Order Engine:** QR, POS, Kiosk, Online cùng nguồn dữ liệu, nhưng giá, khả năng bán và cấu hình có thể khác theo kênh/chi nhánh.
3. **Chủ cửa hàng tự đăng ký dịch vụ:** entitlement từ subscription quyết định module được sử dụng; RBAC quyết định người nào được thao tác.
4. **GAERU Online là marketplace độc lập:** **không tích hợp sàn bán món bên thứ ba** như GrabFood/ShopeeFood; việc tích hợp ngân hàng, hóa đơn điện tử, dịch vụ bản đồ/OTP không được coi là kết nối sàn bán món.
5. **Giao hàng kết hợp:** nhân viên cửa hàng và đội GAERU Ship nội bộ; không cần API đặt ship của sàn bên ngoài.
6. **Vận hành có thể kiểm chứng:** đơn, tiền, kho, điểm thưởng, phiếu in và sự kiện phải có trạng thái, nhật ký và idempotency.
7. **Không triển khai giả:** thanh toán/hóa đơn/giao hàng production chỉ được đánh dấu hoàn tất khi được kiểm chứng từ các hệ thống thật tương ứng.

## 2. Các nhóm người dùng

| Nhóm | Vai trò |
|---|---|
| GAERU Platform Admin | Gói dịch vụ, tenant, marketplace, GAERU Ship, vận hành, hỗ trợ và giám sát |
| Chủ tenant/thương hiệu | Đăng ký/gia hạn gói, quản lý chi nhánh và người dùng theo phạm vi |
| Chủ cửa hàng / Quản lý | Cài đặt cửa hàng, nhân viên, menu, vận hành, doanh thu |
| Nhân viên phục vụ / Bếp / Bar / Thu ngân / Kho / Marketing / Kế toán | Thao tác theo role và permission đã cấp |
| Khách tại bàn | Quét QR, xem menu, gọi món và gọi thêm theo phiên bàn |
| Khách GAERU Online | Tìm quán theo địa chỉ, đặt món, thanh toán, theo dõi giao hàng |
| Tài xế cửa hàng / GAERU Ship | Nhận phân công, cập nhật hành trình và xác nhận giao |
| Nhân viên hỗ trợ | Xử lý ticket, khiếu nại với quyền truy cập hạn chế và có audit |

## 3. Các gói dịch vụ SaaS

| Gói mã hệ thống | Nội dung nền tảng |
|---|---|
| `QR_ORDER` | QR tại bàn, menu, order, TTS, Bếp/Bar, in, POS/thanh toán theo gói |
| `ONLINE_SELLING` | GAERU Online, giá online riêng, vùng giao, giao hàng nội bộ |
| `COMBO` | QR + Online + POS dùng chung catalog, đơn và báo cáo |
| `BUSINESS` | Đa chi nhánh, kho, nhân sự, marketing, quản trị nâng cao theo entitlement |

- Chủ cửa hàng **đăng ký, nâng cấp, hạ cấp, gia hạn hoặc hủy** trên `soft.gaeru.com`.
- Giá gói, giới hạn bàn/nhân viên/chi nhánh/km, số lượt và thời hạn dùng thử được cấu hình bằng `plans`, `features`, `plan_features`, không hard-code.
- Kích hoạt dịch vụ trả phí **chỉ sau khi xác minh thanh toán/điều kiện gói**; có chính sách `TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELED` và grace period.
- Nâng `QR_ORDER` lên `COMBO` không nhân bản menu, khách hàng hay đơn cũ. Hạ gói không xóa dữ liệu lịch sử; giới hạn các hành động phát sinh mới theo chính sách công khai.
- Subscription/feature guard và staff RBAC là **hai lớp kiểm tra độc lập**.

## 4. Chức năng đã chốt từ V1–V3.2

### 4.1. Branding và quản trị nhân viên

- Chủ cửa hàng cấu hình **tên hiển thị, logo tải lên, icon, màu chính/phụ**, địa chỉ, giờ hoạt động và thông tin pháp lý. Logo lưu Object Storage, xác minh loại file/kích thước, xử lý ảnh an toàn.
- Nhân viên được **mời, kích hoạt, khóa, phân vai trò** theo cửa hàng/chi nhánh; một người có thể nhiều vai trò và nhiều chi nhánh nhưng quyền khác nhau.
- Role gợi ý: `OWNER`, `MANAGER`, `WAITER`, `KITCHEN`, `BAR`, `CASHIER`, `ACCOUNTANT`, `INVENTORY`, `MARKETING`, `ONLINE_OPERATOR`, `DELIVERY_DISPATCHER`, `STORE_DRIVER`, `GAERU_DRIVER`, `SUPPORT`, `PLATFORM_ADMIN`.
- Chặn tự nâng quyền, ghi audit các thao tác nhạy cảm; quyền trên backend, không chỉ ẩn nút ở frontend.

### 4.2. QR Order tại bàn

1. Chủ cửa hàng tạo khu vực/bàn và in QR riêng (mã bàn không để lộ token bí mật lâu dài).
2. Khách mở menu trên điện thoại, không bắt buộc cài ứng dụng.
3. **Một thiết bị giữ quyền gọi món trong mỗi phiên bàn:** thiết bị đầu tiên nhấn *Bắt đầu gọi món* được cấp claim atomically; thiết bị khác có thể xem menu nhưng không gửi order.
4. Chủ phiên gọi món có thể đặt thêm nhiều lượt. Nhân viên có quyền được chuyển quyền/thu hồi khi khách đổi máy.
5. Sau khi đóng bàn, thu hồi token/claim; chống gửi trùng bằng `client_request_id` và kiểm tra phiên ở backend.
6. Cơ chế này giới hạn **thiết bị/phiên đặt món**, không xác minh duy nhất danh tính con người; cần OTP nếu yêu cầu xác minh cá nhân.

### 4.3. Realtime, TTS, xác nhận và in

- Sau `order.created` được commit, dashboard nhận thông báo thời gian thực qua WebSocket/Socket.IO.
- **Cấu hình TTS chính thức:** `enabled=true`, `mode=detail`, `language=vi-VN`, `volume=0.75`, mẫu:

  `Bàn {table} vừa gọi {quantity} món. Vui lòng kiểm tra và xác nhận đơn hàng.`

- `{table}` là số bàn; `{quantity}` là tổng số lượng món. Chống đọc trùng theo event/device; hàng đợi đọc; nhân viên phải bật âm thanh theo chính sách của trình duyệt.
- **Nhân viên xác nhận trước khi chế biến/in:** `PENDING_CONFIRMATION -> CONFIRMED/REJECTED`.
- Sau xác nhận, sinh `prep_tickets` tách **KITCHEN** và **BAR**, hỗ trợ món gọi thêm và ghi chú chế biến.
- `print_mode`: `AUTO` (in sau xác nhận), `MANUAL` (nhân viên bấm in), `DISABLED` (chỉ dùng màn hình Bếp/Bar).
- Print Agent qua máy tính/máy in LAN hỗ trợ ESC/POS 58/80 mm; queue, retry, audit, reprint có nhãn; trạng thái **đã gửi tới máy in** không đồng nghĩa giấy đã in thành công nếu phần cứng không xác nhận.

### 4.4. Thanh toán và hóa đơn

- POS hỗ trợ tiền mặt, VietQR và các phương thức được tích hợp hợp lệ; tạo payment intent với mã tham chiếu duy nhất.
- QR chuyển khoản **không tự chứng minh đã thu tiền**: phải có webhook/đối soát có xác thực, kiểm tra số tiền, mã giao dịch, idempotency; phân biệt chờ, một phần, đủ và hoàn tiền.
- Phiếu thanh toán nội bộ: in nhiệt/PDF; hóa đơn điện tử được phát hành qua nhà cung cấp phù hợp, quản lý trạng thái và dữ liệu tra cứu.
- Không xem phiếu bán hàng nội bộ là hóa đơn điện tử hợp pháp; quy trình thời điểm lập, ký/phát hành, điều chỉnh/thay thế cần được rà soát theo quy định hiện hành cho từng loại cửa hàng.

### 4.5. GAERU Online — không kết nối sàn bên thứ ba

- Chủ cửa hàng đang hoạt động bật `online_enabled=true` bằng cách đăng ký gói Online/Combo.
- **Phạm vi giao hàng tự cài theo km cho từng cửa hàng**, mặc định **15 km**; giới hạn tối đa có thể khác theo `plan_features`/chính sách GAERU.
- Tìm kiếm/quét vùng phục vụ bằng tọa độ và chính sách vùng. Phân biệt bán kính địa lý với quãng đường di chuyển thực tế khi tính thời gian/phí giao.
- Đồng bộ menu nội bộ **tự động**: tên, ảnh, danh mục, tùy chọn và trạng thái bán. **Giá online riêng**, không bị ghi đè khi sửa giá tại quán.
- Đơn Online đi vào **Unified Order Service** cùng dashboard nhân viên; chế biến/in theo Bếp/Bar; không áp dụng QR claim của bàn cho khách đặt online.
- GAERU Marketplace do GAERU tự vận hành; không có GrabFood/ShopeeFood connector hay API đồng bộ sàn ngoài.

### 4.6. GAERU Ship — giao kết hợp

- `delivery_mode=HYBRID_INTERNAL`: nhân viên giao của cửa hàng hoặc tài xế GAERU Ship.
- Phân vùng giao, báo phí, điều phối, nhận đơn, lấy hàng, đang giao, hoàn thành/thất bại, hoàn hàng, chứng cứ giao và đối soát COD.
- Một yêu cầu giao không được có hai phân công tài xế đang hiệu lực. Thao tác fallback phải được kiểm soát để tránh tạo hai vận đơn.
- Theo dõi vị trí tài xế phải được bật theo mục đích, quyền đồng ý và chính sách lưu giữ phù hợp.

## 5. Mười lăm nhóm tính năng V4.0 đã chốt

1. **Kho, định lượng và giá vốn:** nguyên liệu, BOM/recipe versions, nhập-xuất-kiểm kê, sổ kho, hao hụt, COGS.
2. **Loyalty & Rewards:** hồ sơ khách đa kênh, điểm thưởng, hạng, đổi/hoàn điểm, sổ điểm idempotent.
3. **POS offline & sync:** thiết bị đã đăng ký, local outbox, đồng bộ có kiểm tra xung đột, hiển thị chưa đối soát.
4. **Quản lý ca và chống thất thoát:** quỹ tiền, mở/đóng ca, chênh lệch, phê duyệt hủy/giảm/hoàn.
5. **Đặt bàn trước:** lịch bàn, giới hạn sức chứa, đặt cọc khi có, check-in, no-show.
6. **Voucher & Marketing:** voucher, combo, giờ vàng, miễn ship, giới hạn ngân sách, chống lạm dụng.
7. **GAERU Ship nâng cao:** tối ưu điều phối, bằng chứng giao, quản trị đội và hoàn hàng.
8. **Đánh giá và khiếu nại:** đánh giá từ đơn hợp lệ, phản hồi, báo cáo vi phạm, điều tra tranh chấp.
9. **Quản lý chuỗi:** thương hiệu/chi nhánh, catalog chung/override, phân quyền và báo cáo hợp nhất.
10. **Self-order / Kiosk:** menu cảm ứng, phiên kiosk, số thứ tự, thanh toán phù hợp.
11. **GAERU AI Assistant:** phân tích số liệu được phân quyền, gợi ý tồn kho/kinh doanh, phê duyệt khi hành động.
12. **Chấm công, lịch ca và KPI:** lịch làm, check-in/out, checklist, thống kê hiệu suất theo vai trò.
13. **Monitoring, backup & privacy:** log/tracing/alerts, backup, diễn tập restore, chính sách dữ liệu.
14. **Subscription Billing tự động:** thu phí/gia hạn, thay đổi gói, hóa đơn dịch vụ, dunning/grace period.
15. **Support & Dispute Center:** ticket hỗ trợ, SLA, chứng cứ, điều phối giải quyết.

## 6. Kiến trúc kỹ thuật mục tiêu

| Lớp | Đề xuất |
|---|---|
| Frontend | Next.js + TypeScript, thiết kế responsive/PWA |
| Backend | NestJS Modular Monolith, REST/OpenAPI |
| Database | PostgreSQL, Prisma + SQL migration đặc biệt |
| Realtime / Worker | Socket.IO, Redis, BullMQ, transactional outbox |
| Storage | S3-compatible object storage cho logo/ảnh/chứng từ |
| Auth | Session/short-lived JWT, refresh rotation, MFA cho quyền nhạy cảm |
| Printing | GAERU Print Agent + ESC/POS |
| POS offline | IndexedDB + device registration + sync endpoint |
| Observability | Logs, metrics, tracing, incident management |
| Deployment | Docker, CI/CD, staging/production, TLS, backups |

**Không triển khai microservice tràn lan ở giai đoạn đầu.** Giữ module boundaries, contracts, event IDs; tách worker/agent khi cần xử lý nền hoặc giao tiếp thiết bị.

### Cấu trúc monorepo đề xuất

```text
gaeru-soft/
├── apps/
│   ├── web/                    # SaaS & Store Admin
│   ├── marketplace/            # GAERU Online
│   ├── pos/                    # POS PWA & offline
│   ├── kiosk/                  # Self-order kiosk
│   ├── driver/                 # GAERU Ship / Store Driver
│   ├── api/                    # NestJS API
│   ├── workers/                # Printing / payments / notifications / billing
│   └── print-agent/            # Thiết bị cửa hàng
├── packages/
│   ├── database/               # Prisma schema + migrations
│   ├── contracts/              # API DTOs, event schemas
│   ├── permissions/            # RBAC, entitlements
│   ├── ui/                     # Design system, branding
│   ├── business-rules/
│   └── config/
├── infra/
│   ├── docker/
│   ├── environments/
│   ├── observability/
│   └── backups/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   ├── offline/
│   └── performance/
└── docs/
    ├── architecture/
    ├── database/
    ├── api/
    ├── security/
    ├── operations/
    └── roadmap/
```

## 7. Thiết kế dữ liệu / Database domains

**Nguyên tắc:** `tenants -> brands -> stores`; quyền dữ liệu theo tenant/store; `products` và `orders` dùng chung; dữ liệu giao dịch ghi lịch sử bất biến hoặc bút toán đảo; tiền dùng integer VND/decimal, không dùng floating-point.

| Domain | Bảng dữ liệu trọng tâm |
|---|---|
| Tenant & SaaS | `tenants`, `brands`, `stores`, `plans`, `features`, `plan_features`, `subscriptions`, `subscription_events`, `billing_accounts`, `subscription_invoices`, `subscription_payments` |
| Identity & RBAC | `users`, `auth_sessions`, `staff_invitations`, `store_members`, `brand_members`, `roles`, `permissions`, `member_roles`, `role_permissions` |
| Branding | `store_brands`, `store_settings`, `store_assets`, `notification_settings` |
| Catalog | `categories`, `products`, `product_options`, `product_option_values`, `channel_prices`, `online_product_listings` |
| QR & Table | `tables`, `table_sessions`, `table_device_claims`, `table_session_tokens` |
| Orders & Kitchen | `orders`, `order_items`, `order_status_history`, `prep_stations`, `prep_tickets`, `prep_ticket_items` |
| Printing & Events | `printers`, `printer_routes`, `print_jobs`, `print_attempts`, `notification_events`, `outbox_events` |
| Payment & Invoices | `checkouts`, `checkout_orders`, `payments`, `payment_events`, `refunds`, `invoices`, `invoice_items`, `e_invoice_requests` |
| Online & Delivery | `online_store_settings`, `delivery_zones`, `delivery_addresses`, `online_order_details`, `delivery_requests`, `delivery_quotes`, `driver_profiles`, `driver_availability`, `delivery_assignments`, `shipment_events`, `delivery_proofs`, `driver_settlements` |
| Inventory | `ingredients`, `units`, `unit_conversions`, `recipes`, `recipe_versions`, `recipe_items`, `inventory_locations`, `stock_movements`, `stock_counts`, `inventory_cost_layers`, `cost_snapshots` |
| Customer & Growth | `customers`, `loyalty_accounts`, `loyalty_transactions`, `promotions`, `vouchers`, `voucher_redemptions`, `reviews`, `review_replies`, `review_reports` |
| POS & Shifts | `devices`, `device_sessions`, `sync_batches`, `sync_conflicts`, `shifts`, `cash_drawers`, `cash_movements`, `shift_closures` |
| Reservation & Kiosk | `reservations`, `reservation_events`, `reservation_deposits`, `kiosk_devices`, `kiosk_sessions` |
| HR & Enterprise | `work_schedules`, `attendance_records`, `staff_checklists`, `brand_catalog_items` |
| Support, AI, Ops | `support_tickets`, `ticket_messages`, `dispute_cases`, `case_evidence`, `ai_conversations`, `ai_insights`, `ai_action_approvals`, `audit_logs`, `system_incidents`, `integration_health`, `backup_runs` |

### Constraints quan trọng

- Unique `store_members(store_id,user_id)`; `tables(store_id,code)`; `orders(store_id,client_request_id)`; `print_jobs(job_key)`.
- Một bàn chỉ một session đang mở và một active claim hợp lệ trong session (partial unique index/atomic transaction).
- Một order không được ghi nhận cùng một payment event hai lần; webhook có unique `(provider,provider_event_id)`.
- Một delivery request chỉ có một assignment active; hủy/tái phân công trong transaction.
- Một voucher redemption/loyalty posting/stock movement phải có source idempotency key.
- Snapshot giá món, thuế, công thức và giá vốn theo thời điểm; không sửa lịch sử đơn khi thay đổi menu.
- Các mối quan hệ gán quyền và tham chiếu dữ liệu phải được kiểm tra trong cùng phạm vi tenant/store, kể cả khi ID hợp lệ.

## 8. Luồng nghiệp vụ cốt lõi

### QR tại bàn

`Scan QR -> Claim table session -> Menu/cart -> order.created -> Realtime/TTS -> Staff CONFIRM -> Kitchen/Bar tickets -> AUTO/MANUAL/DISABLED printing -> Serve -> Checkout -> Payment reconciliation -> Receipt/E-Invoice -> Close table session`

### Online

`Store subscribes ONLINE/COMBO -> Enable online -> Publish catalog (price override) -> Customer checks coverage -> Cart/Quote -> Order -> Staff confirmation -> Kitchen/Bar -> Pack -> Store driver or GAERU Ship -> Delivery tracking -> Settlement -> Review/Rewards`

### POS offline

`Registered device -> Local permitted order with UUID -> Pending sync -> Reconnect -> Server dedup & conflict validation -> Accepted/Needs review -> Reconcile financial status`

Không được giả định giao dịch thanh toán ngân hàng thành công khi thiết bị offline.

### Kho & điểm thưởng

- Order được xử lý theo chính sách giữ hàng/xuất kho; ghi bút toán kho và bút toán đảo khi hủy.
- Điểm thưởng tính theo giao dịch đủ điều kiện; hoàn/trừ điểm bằng bút toán mới, không xóa lịch sử.
- Voucher có thời gian, điều kiện kênh/chi nhánh, hạn mức và số lần sử dụng atomic.

## 9. API contract cấp module

Tiền tố `/api/v1` (chỉ là **đề xuất**, cần chuẩn hóa bằng OpenAPI khi triển khai).

| Module | API ví dụ | Quyền/điều kiện |
|---|---|---|
| Auth | `POST /auth/register`, `POST /auth/login` | Rate limit, verify |
| SaaS | `GET /plans`, `POST /subscriptions`, `PATCH /subscriptions/:id` | Owner + subscription guards |
| Store | `PATCH /stores/:id/brand`, `POST /stores/:id/assets/logo` | `store.brand.update` |
| Staff | `POST /stores/:id/staff/invitations`, `PUT /stores/:id/staff/:memberId/roles` | `staff.invite`, `roles.assign` |
| Catalog | `POST /stores/:id/products`, `PATCH /stores/:id/products/:id` | `catalog.manage` |
| QR | `POST /public/table-sessions/claim`, `POST /public/orders` | QR token + claim + idempotency |
| Orders | `POST /stores/:id/orders/:orderId/confirm` | `orders.confirm` |
| Printing | `GET /stores/:id/print-jobs`, `POST /stores/:id/print-jobs/:id/retry` | `printing.view/retry` |
| Online | `PATCH /stores/:id/online/settings`, `GET /marketplace/stores`, `POST /marketplace/orders` | Entitlement + auth/rate limit |
| Delivery | `POST /delivery/coverage-check`, `POST /delivery/requests/:id/dispatch` | Customer session / `delivery.dispatch` |
| Payment | `POST /stores/:id/payments`, `POST /webhooks/payments/:provider` | `payments.collect` / signed webhook |
| Invoice | `POST /stores/:id/invoices/:id/issue` | `invoices.issue` |
| Inventory | `POST /stores/:id/inventory/receipts`, `POST /stores/:id/inventory/adjustments` | `inventory.receive/adjust` |
| Recipes | `PUT /stores/:id/recipes/:id` | `recipes.manage` |
| Loyalty | `GET /customers/me/loyalty`, `POST /stores/:id/loyalty/adjustments` | Customer / `loyalty.adjust` |
| Marketing | `POST /stores/:id/promotions` | `promotions.manage` |
| Offline | `POST /pos/devices/:id/sync` | Device + staff authorization |
| Shifts | `POST /stores/:id/shifts/open`, `POST /stores/:id/shifts/:id/close` | `shifts.open/close` |
| Reservations | `POST /public/stores/:slug/reservations` | Protected public API |
| Reviews | `POST /orders/:id/reviews` | Verified order owner |
| Support | `POST /support/tickets` | Authenticated/case permission |
| AI | `POST /stores/:id/ai/query` | `ai.use` + row-level scopes |
| Reports | `GET /stores/:id/reports/profitability` | `reports.profitability.view` |
| Admin | `GET /admin/platform/health` | `platform.monitor` |

### Phân quyền bắt buộc

- **Feature guard:** Subscription cho phép `QR_ORDER`, `ONLINE_SELLING`, `INVENTORY`, `REWARDS`, `BUSINESS`, ...
- **RBAC:** người dùng có permission (`orders.confirm`, `inventory.adjust`, `payments.refund`, `invoices.issue`, `delivery.dispatch`, ...).
- **Scope:** bản ghi phải thuộc store/brand/tenant được cấp quyền.
- **State guard:** thao tác được phép ở trạng thái hiện tại (vd. chỉ xác nhận order chờ duyệt).
- Đổi tài khoản ngân hàng, refund, hủy hóa đơn, gán quyền quản lý và hỗ trợ truy cập dữ liệu cần audit/MFA hoặc phê duyệt tăng cường.

## 10. Danh mục 25 module backlog

| ID | Module | Ưu tiên mục tiêu |
|---|---|---|
| CORE-01 | SaaS & Subscription Billing | P0 |
| CORE-02 | Identity, Staff & RBAC | P0 |
| CORE-03 | Stores, Branding & Chains | P0 lõi / P2 chuỗi |
| CORE-04 | Catalog & Channel Pricing | P0 |
| CORE-05 | Unified Order Service | P0 |
| CORE-06 | Kitchen, Bar & Printing | P0 |
| CORE-07 | Realtime & Notification | P0 |
| CORE-08 | Payment & Invoice | P0 |
| CORE-09 | Monitoring & Privacy | P0 xuyên suốt |
| POS-01 | POS & Offline Sync | P0 POS / P1 offline mở rộng |
| INV-01 | Inventory & Recipes | P1 |
| OPS-01 | Shift & Cash Control | P0 lõi / P1 nâng cao |
| ONL-01 | GAERU Online Marketplace | P0 giai đoạn Online |
| DLV-01 | GAERU Ship & Store Delivery | P0 giai đoạn Online |
| CRM-01 | Customer Profile & Rewards | P1 |
| MKT-01 | Voucher & Campaigns | P1 |
| RES-01 | Reservation Management | P1 |
| SUP-01 | Support & Disputes | P1 |
| REV-01 | Ratings & Reviews | P1 |
| HR-01 | Staff Scheduling & KPI | P2 |
| KSK-01 | Self-Order / Kiosk | P2 |
| CHAIN-01 | Enterprise Chain Control | P2 |
| AI-01 | GAERU AI Assistant | P2 |
| DATA-01 | Analytics & Reporting | P1 |
| OPS-02 | Platform Support & Operations | P0 |

Mỗi issue nên chứa: mô tả nghiệp vụ, điều kiện tiên quyết, DB migrations, API/DTO, quyền, giao diện, event, acceptance criteria, unit/integration/E2E tests, logging và tài liệu.

## 11. Migration roadmap

**Lưu ý:** các số `001`–`043` là **kế hoạch đặt tên**, không phải migration đã tồn tại. Phải kiểm kê database/repo trước khi áp dụng.

### Nền tảng V2 / V3

| Nhóm | Migration dự kiến |
|---|---|
| Core & SaaS | `001_core_tenants`, `002_auth_identity`, `003_rbac`, `004_store_customization` |
| QR + Orders | `005_catalog`, `006_tables_qr`, `007_order_core`, `008_kitchen_bar`, `009_notifications`, `010_printing` |
| Finance | `011_checkout_payment`, `012_invoicing`, `013_reporting_audit` |
| GAERU Online | `014_online_settings`, `015_online_catalog`, `016_online_orders`, `017_delivery_coverage` |
| Delivery | `018_delivery_drivers`, `019_delivery_dispatch`, `020_delivery_tracking`, `021_delivery_finance` |
| Permissions & Reporting | `022_online_permissions`, `023_online_reporting` |

`outbox_events` phải được tạo **ngay trước module đầu tiên phát event**, không chờ đến migration 013 theo thứ tự tên.

### V4.0

| Migration | Mục đích |
|---|---|
| `024_brand_hierarchy` | Brand/chi nhánh và quyền cấp thương hiệu |
| `025_inventory_master` | Nguyên liệu, đơn vị, kho |
| `026_recipes` | Công thức, định lượng, phiên bản |
| `027_stock_ledger` | Sổ kho và giá vốn |
| `028_customers_loyalty` | Khách hàng, tài khoản điểm |
| `029_loyalty_ledger` | Tích/đổi/hoàn điểm |
| `030_promotions` | Voucher/khuyến mãi |
| `031_offline_devices` | Thiết bị và phiên offline |
| `032_offline_sync` | Đồng bộ và conflict |
| `033_shift_cash` | Ca làm và quỹ |
| `034_reservations` | Đặt bàn, đặt cọc |
| `035_delivery_advanced` | Driver telemetry / proof |
| `036_reviews` | Đánh giá |
| `037_support_disputes` | Hỗ trợ và tranh chấp |
| `038_kiosk` | Kiosk và phiên mua |
| `039_staff_scheduling` | Nhân sự, chấm công, KPI |
| `040_billing` | Subscription Billing |
| `041_ai_assistant` | AI, insights, approvals |
| `042_observability` | Incidents, backup metadata |
| `043_reporting` | Index/read models |

Áp dụng **expand → backfill → verify → switch → contract**, không reset production. Cần xem lại thứ tự riêng của các module liên quan: Subscription Billing thực tế có thể cần tạo sớm ở MVP, trước migration 040.

## 12. Roadmap triển khai 8 giai đoạn / 12–18 tháng (tham chiếu)

| Giai đoạn | Mốc thời gian | Phạm vi | Đầu ra cần nghiệm thu |
|---|---|---|---|
| **GĐ0** Foundation | Tháng 1 | Kiểm kê repo, backup, monorepo, DB, RBAC sơ khởi, staging, CI/CD | Môi trường chạy được, migration/test cơ bản |
| **GĐ1** SaaS & Store | Tháng 2–3 | Đăng ký, subscription, branding, nhân viên, role/permission, GAERU Admin | Chủ cửa hàng tự mở gói và quản trị |
| **GĐ2** QR/POS MVP | Tháng 4–5 | Menu, QR, một thiết bị/bàn, Order, TTS, Bếp/Bar, in, POS, payment, e-invoice, ca cơ bản | Pilot tại quán end-to-end |
| **GĐ3** Online & Ship | Tháng 6–7 | Marketplace GAERU, menu/giá online, bán kính riêng, hybrid ship, COD | Khách đặt online và giao hàng thành công |
| **GĐ4** Kho & Offline | Tháng 8–9 | Kho, công thức, giá vốn, POS offline, conflict, chống thất thoát | Báo cáo kho đúng, sync phục hồi an toàn |
| **GĐ5** Growth | Tháng 10–11 | Loyalty, voucher, đặt bàn, đánh giá, support/disputes | Khách nhận/đổi thưởng, chủ quán chăm sóc khách |
| **GĐ6** Enterprise | Tháng 12–14 | Chuỗi, chấm công/KPI, kiosk, GAERU Ship nâng cao | Nhiều chi nhánh và mô hình vận hành |
| **GĐ7** AI & Scale | Tháng 15–18 | AI Assistant, tối ưu, security/load, runbooks, mở rộng | GAERU V4.0 nghiệm thu tổng thể |

### Các mốc phát hành

- **R0 Foundation Ready:** Staging, CI/CD, database, basic auth/RBAC và backup.
- **R1 QR/POS MVP:** Chu trình từ QR order tới in, thanh toán và hóa đơn vận hành được.
- **R2 GAERU Online Launch:** Marketplace độc lập + hybrid delivery.
- **R3 Operations & Growth:** Kho, offline, Rewards, marketing và support.
- **R4 Enterprise & AI:** Chuỗi, kiosk, nhân sự, AI, tối ưu và vận hành nhiều cửa hàng.

Thời gian phụ thuộc năng lực đội phát triển, tình trạng mã `gaeruvn/qrorder`, thiết bị và quyền tích hợp ngân hàng/hóa đơn; **không phải cam kết lịch phát hành**.

## 13. Definition of Done và bộ kiểm thử

### Definition of Done cho từng module

- Data model + migration có kiểm thử và kế hoạch rollback hợp lý.
- API validation, auth, entitlement, RBAC, tenant/store scoping.
- Frontend/kiosk/driver flow phù hợp module; xử lý trạng thái lỗi và retry.
- Audit cho nghiệp vụ nhạy cảm; logs, metrics, trace IDs.
- Unit, integration, E2E, security tests; OpenAPI/docs; checklist nghiệm thu sản phẩm.

### Test kịch bản ưu tiên

| ID | Kiểm thử | Tiêu chí đạt |
|---|---|---|
| SAAS-01 | Từ QR_ORDER nâng COMBO | Giữ nguyên menu, nhân viên, lịch sử |
| SEC-01 | Store A truy cập dữ liệu Store B | Bị từ chối ở backend |
| RBAC-01 | Nhân viên tự nâng quyền Owner | Bị từ chối, có audit |
| QR-01 | Hai thiết bị claim cùng bàn | Chỉ một claim thành công |
| ORD-01 | Nhấn đặt/xác nhận nhiều lần | Một đơn / một bộ ticket hợp lệ |
| TTS-01 | Bàn 05 gọi 3 món | Đọc chính xác mẫu `vi-VN`, volume 0.75 |
| PRINT-01 | Đơn có món Bếp và Bar | In đúng tuyến sau xác nhận |
| PRINT-02 | Máy in offline | Job không mất, retry/reprint có kiểm soát |
| PAY-01 | Webhook giao dịch gửi trùng | Không ghi nhận tiền hai lần |
| INVOICE-01 | Nhà cung cấp hóa đơn trả lỗi | Không báo đã phát hành |
| ONLINE-01 | Sửa giá online | Không đổi giá tại quán |
| ZONE-01 | Địa chỉ ngoài vùng km cửa hàng | Không cho đặt giao tận nơi |
| SHIP-01 | Hai tài xế nhận cùng một vận đơn | Tối đa một assignment active |
| STOCK-01 | Đơn hủy sau xuất kho | Bút toán điều chỉnh đúng |
| LOYALTY-01 | Payment event lặp | Không cộng điểm hai lần |
| OFFLINE-01 | POS sync lại batch cũ | Không nhân đôi đơn |
| VOUCHER-01 | Sử dụng quá giới hạn | Server ngăn chặn atomic |
| BACKUP-01 | Phục hồi backup | Dữ liệu và ràng buộc nhất quán |
| AI-01 | User truy vấn dữ liệu ngoài quyền | Không được phép |

## 14. Bảo mật, quyền riêng tư và tuân thủ

- TLS bắt buộc; token bí mật và credential chỉ lưu dưới dạng hash/mã hóa tham chiếu phù hợp.
- Cookie QR dùng `HttpOnly`, `Secure`, `SameSite` phù hợp; kiểm tra replay và rate limit.
- Webhook ngân hàng/hóa đơn/đối tác hạ tầng được xác minh chữ ký, nguồn và idempotency.
- Chủ cửa hàng không thể truy cập dữ liệu hệ thống của tenant khác. GAERU support cần quyền tạm thời và nhật ký truy cập khi xử lý dữ liệu nhạy cảm.
- Lưu trữ địa chỉ, số điện thoại, vị trí tài xế, lịch sử giao dịch theo mục đích sử dụng và quy định bảo vệ dữ liệu cá nhân áp dụng; thiết kế retention/xóa/ẩn danh khi được phép.
- Thông tin pháp lý trên hóa đơn tách khỏi brand display name. Rà soát nghiệp vụ hóa đơn điện tử và quy định thuế với nhà cung cấp/cố vấn trước production.
- Có backup, diễn tập restore, giám sát queue và hàng đợi dead-letter, runbook khắc phục sự cố, feature flags và kế hoạch roll back.

## 15. Vận hành và triển khai

### Môi trường

- `development`: dữ liệu giả lập, cổng thanh toán/hóa đơn sandbox.
- `staging`: chạy migration, integration/E2E, thử thiết bị và diễn tập phát hành.
- `production`: tên miền thật, TLS, monitoring, backup, secret store, quyền truy cập hạn chế.

### Điều kiện trước khi đưa vào production

1. Quyền truy cập domain/DNS `soft.gaeru.com`, cấu hình hosting và HTTPS.
2. Backup nguyên trạng dự án QR Order cũ và dữ liệu hiện hữu; migration được kiểm chứng.
3. Chính sách gói, thu phí, hoàn/hủy và xử lý hết hạn được phê duyệt.
4. Thiết bị máy in K58/K80 và GAERU Print Agent thử nghiệm thành công.
5. Đối soát ngân hàng, hóa đơn điện tử và xác thực thanh toán thử nghiệm đạt.
6. Chính sách giao hàng, phí ship, COD, bảo vệ dữ liệu khách và tài xế hoàn thiện.
7. Bảo mật, kiểm thử tải, giám sát và quy trình incident/rollback được nghiệm thu.

## 16. Sprint 0 — Công việc đầu tiên

- [ ] Kiểm kê repository `https://github.com/gaeruvn/qrorder` và phiên bản đang triển khai.
- [ ] Sao lưu source/database và lập danh mục phần có thể tái sử dụng.
- [ ] Thống nhất scope MVP 1: SaaS → QR/POS → thanh toán/hóa đơn.
- [ ] Khởi tạo monorepo, CI/CD, staging và công cụ quản lý secret.
- [ ] Hoàn thiện schema `tenant/brand/store/user/member/role/plan/subscription`.
- [ ] Thiết kế `Product Catalog`, `Unified Order`, event/outbox, idempotency.
- [ ] Seed quyền hệ thống, kiểm thử truy cập khác tenant.
- [ ] Chuẩn hóa OpenAPI và hợp đồng event giữa apps/workers.
- [ ] Chạy integration test, dựng pilot cửa hàng đầu tiên.

## 17. Trạng thái triển khai và nguyên tắc cập nhật README

**Đã xác định:** phạm vi sản phẩm V1–V4, nguyên tắc đồng bộ QR/POS/Online, cấu hình TTS và in, subscription self-service, schema và roadmap ở mức thiết kế.  
**Chưa được xác minh trong tài liệu này:** trạng thái mã nguồn GitHub, schema thực tế, endpoint production, tích hợp ngân hàng/hóa đơn, máy in, tài xế, thời gian triển khai.  

Khi phát triển thật, cập nhật bảng tiến độ module (`Planned / In Progress / Tested / Released`), liên kết PR/migration/OpenAPI, hướng dẫn chạy local thực tế và release notes. **Không đánh dấu “hoàn thành” khi chỉ có mockup, README hoặc API giả lập.**

---

**GAERU SOFT V4.0** — Một nền tảng SaaS, một nguồn dữ liệu kinh doanh, nhiều kênh bán hàng và dịch vụ mở rộng cho hệ sinh thái F&B.
