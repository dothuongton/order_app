# Ma trận thực thi V4

Baseline kiểm kê: main1a773f7, core30981bc, nhánh CMS f386525 (20/10/2026). Đây là kiểm kê sơ bộ từ source/audit; không có module nào được bảng này tuyên bố Released theo V4. Các trạng thái In Progress chỉ nói có nền tảng một phần, chưa đạt DoD V4.

ID trong bảng là ID **module của spec**, khác với mã lỗi audit SEC/BUS/DATA cũ. Ưu tiên P0 trong master là ưu tiên giai đoạn sản phẩm, không phải tất cả là lỗ hổng P0 đang bị khai thác.

| ID | Module V4 | Trạng thái | Code/issue liên quan | Khoảng trống/điều kiện |
| --- | --- | --- | --- | --- |
| CORE-01 | SaaS & Subscription Billing | Planned | Chưa có plan/subscription/entitlement/billing V4 | Sprint0: domain/plan contract trước cấp module |
| CORE-02 | Identity, Staff & RBAC | In Progress — một phần | Auth/membership hiện có; #37–#40, #48 | Session/device/MFA/permission không đồng nghĩa V4 đủ |
| CORE-03 | Stores, Branding & Chains | In Progress — một phần | Tenant/CMS; #15–#19, #46–#47 | Brand/store/chain model cần design riêng |
| CORE-04 | Catalog & Channel Pricing | In Progress — một phần | Menu/options; #8 | Chưa có catalog đa kênh như spec |
| CORE-05 | Unified Order Service | In Progress — một phần | QR order/session; #9/#11/#27/#28 | Claim độc quyền, CHECKOUT_LOCKED, multi-channel còn thiếu |
| CORE-06 | Kitchen, Bar & Printing | Planned — partial serving có sẵn | Accept/serve từng phần hiện có | PrepTicket/trạm/PrintAgent/jobs/idempotency chưa nghiệm thu |
| CORE-07 | Realtime & Notification | In Progress — một phần | #21/#43, Socket.IO/PWA hiện có | Outbox/event IDs/replay/device tests còn phải kiểm chứng |
| CORE-08 | Payment & Invoice | Planned — manual settlement có sẵn | #11/#12/#27/#28/#31 | Payment độc lập/invoice provider chưa có; không fake verify |
| CORE-09 | Monitoring & Privacy | In Progress — một phần | #22/#23/#36/#41/#42 | Monitoring/privacy/outbox/retention phải theo full spec |
| POS-01 | POS & Offline Sync | Planned | Chưa có POS offline V4 | Device registration/idempotent sync trước bật offline |
| INV-01 | Inventory & Recipes | Planned | Chưa có kho/recipe V4 | Immutable stock ledger và order events |
| OPS-01 | Shift & Cash Control | Planned | Chưa có ca/quỹ V4 | Finance/permission trước cash close |
| ONL-01 | GAERU Online Marketplace | Planned | Chưa có marketplace V4 | Catalog/channel/entitlement; không tích hợp sàn món ngoài |
| DLV-01 | GAERU Ship & Store Delivery | Planned | Chưa có dispatch/shipping V4 | Coverage/assignment/COD có state/audit |
| CRM-01 | Customer Profile & Rewards | Planned | Chưa có loyalty V4 | Payment event idempotency/scope trước points |
| MKT-01 | Voucher & Campaigns | Planned — promotion đơn giản có sẵn | #9/#12/#28 | Không coi promotion hiện tại là campaign/voucher đủ |
| RES-01 | Reservation Management | Planned | Chưa có reservation V4 | Store/time/capacity contract |
| SUP-01 | Support & Disputes | Planned | Chưa có ticket/dispute V4 | Case-bound support và permission/audit |
| REV-01 | Ratings & Reviews | Planned | Chưa có verified review V4 | Order ownership/eligibility |
| HR-01 | Staff Scheduling & KPI | Planned | Chưa có scheduling/KPI V4 | Identity/store/shift contract |
| KSK-01 | Self-Order / Kiosk | Planned | Chưa có kiosk V4 | Channel/device/session scope |
| CHAIN-01 | Enterprise Chain Control | Planned | Chưa có chain V4 | Tenant/brand/store/data boundaries |
| AI-01 | GAERU AI Assistant | Planned | Chưa có assistant nghiệp vụ V4 | Read permissions/RLS/tool authorization trước AI |
| DATA-01 | Analytics & Reporting | In Progress — một phần | #13/#30/#44/#45 | Daily read-model không tự là profitability toàn V4 |
| OPS-02 | Platform Support & Operations | In Progress — một phần | #15–#19/#23/#35/#38/#46–#48 | Không tự cấp support quyền sửa tiền/reset owner/impersonate |

## Cổng Sprint0 trước chia triển khai full V4

- Quyết định cách đi từ QR hiện tại tới kiến trúc mục tiêu Next/Nest/Prisma: re-use/migrate từng module hay tạo nền V4 tách riêng, deployment/cutover và lý do. Không tự biến hotfix thành rewrite, không tự loại mục tiêu V4 khỏi backlog.
- Backup source/DB và kiểm kê contract/schema/data có thể tái sử dụng, điểm tenant→brand/store, migration ID reservation và owner file.
- Chốt MVP1 SaaS→QR/POS→Payment/Invoice và dependency; 25 module có epic/issue theo giai đoạn, không bật tất cả để hai người cùng sửa shared files.
- Chuẩn hóa OpenAPI/events/permissions/entitlements và read/write authority theo module. Core sở hữu shared contracts/schema; Sang sở hữu admin surfaces; mở thêm lane khi có người và ranh giới thật.
- Claim, checkout lock và payment state phải map theo addendum; đổi flow UX từ Muse cần ADR đối chiếu spec và xác nhận của chủ dự án trước bật.
- DoD từng module: schema/migration/rollback, API validation+scope+state, UI ngoại lệ, event/audit, tests và pilot/rollout thực. Mock/API giả không bằng Tested/Released.

## Nợ cần giải quyết trước nghiệm thu code hiện tại

#24 và các follow-up #27/#28/#29/#32/#34 vẫn còn acceptance chưa đạt ở re-review30981bc. #35 là roadmap đề xuất Muse đã hiệu chỉnh, không thay masterV4. Root docs/issue sẽ dẫn epicV4/Sprint0 riêng để theo dõi 25module.

## Theo dõi trênGitHub

- [EpicV4#50](https://github.com/dothuongton/order_app/issues/50) — hệthốngđích25module.
- [Sprint0#51](https://github.com/dothuongton/order_app/issues/51) — kiếntrúc/MVP/migration/owner.
- [Claim#52](https://github.com/dothuongton/order_app/issues/52) — requirementaddendum.
- [Checkout#53](https://github.com/dothuongton/order_app/issues/53) — requirementaddendum.
