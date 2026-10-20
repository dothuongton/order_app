# Báo Cáo Phản Hồi & Nghiệm Thu Codex Review (Core Lane Handoff)

> **Repository:** `dothuongton/order_app`  
> **Nhánh:** `codex/core-audit-fixes`  
> **Commit xuất phát được review:** `3bd9b31ce22b7bca1ea51c6f0ab50c9ecf032ed3`  
> **Head commit sau sửa:** `98b3588` (và commit báo cáo này)  
> **Đối chiếu base:** `origin/main@1a773f7a428ca8756c9bce3a6e388cdc4ea21312`  
> **Tác giả:** Antigravity (Đại diện kỹ thuật `lane:core`)  
> **Kính gửi:** Codex Independent Reviewer & `@dothuongton`  
> **Ngày:** 20/10/2026  
> **Trạng thái:** **SẴN SÀNG CHO CODEX REVIEW LẠI (READY FOR RE-REVIEW)** — Chưa merge vào `main`, chưa deploy production.

---

## 1. Tuyên Bố Ranh Giới & Thỏa Ước Điều Phối (Issue #2, #5, #24)

1. **Phạm vi sở hữu (`lane:core`):** Toàn bộ các thay đổi chỉ nằm trong phạm vi nghiệp vụ core (bàn, phiên, menu, khách, bếp, thanh toán, push, báo cáo, hạ tầng bảo mật).
2. **Bảo vệ tuyệt đối làn của Sang (`lane:admin`):**
   - Không chạm, không sửa, không đổi bất kỳ tệp nào trong `backend/src/modules/admin/**` và `frontend/src/pages/admin/**` (ngoại trừ duy nhất `AdminLogin.tsx` thuộc Core Identity theo thỏa ước).
   - Gate kiểm tra tại `scripts/check-file-boundaries.mjs` đã được nâng cấp thành **kiểm tra hai chiều (bidirectional)**, tự động fail nếu Core chạm vào file của Sang hoặc Sang chạm vào file của Core.
3. **Diff hygiene:** Không có `debugger;`, không có `console.log` chứa secret, không hardcode khóa riêng VAPID hay credential trong mã nguồn.

---

## 2. Giải Trình & Bằng Chứng Chi Tiết Cho 10 Điểm Review (R1 → R10)

### R1 — P1 — Loại bỏ hoàn toàn credential mặc định của Super Admin khỏi schema & migration (Issue #25 / #3)
- **Vấn đề Codex chỉ ra:** Migration `004_superadmin_user.sql` và `schema.sql` vẫn chứa lệnh `INSERT` Super Admin với hash mặc định `admin123`. Trên DB production mới chưa có admin, migration tự tạo tài khoản này.
- **Giải pháp:**
  - Xóa bỏ hoàn toàn câu lệnh `INSERT INTO users ... superadmin@qrorder.vn` khỏi cả `backend/src/db/migrations/004_superadmin_user.sql` và `backend/src/db/schema.sql`.
  - Cập nhật test `backend/src/tests/core-audit/sec01_superadmin_persist.test.ts` để kiểm chứng: DB mới khi chạy migration production **không tự tạo bất kỳ tài khoản admin mặc định nào** (`productionMigrationCreatesAdmin: false`, `acceptsPublishedDefault: false`).
- **Kết quả review harness:**
  ```json
  {"id":"R1-default-admin","productionMigrationCreatesAdmin":false,"acceptsPublishedDefault":false}
  ```

---

### R2 — P1 — Promotion cấp phiên: tính đúng cho multi-round, phần trăm và cap (Issue #28 / #9)
- **Vấn đề Codex chỉ ra:** 
  1. `GuestService.createOrder` trừ lượt `current_redemptions` ngay khi khách đặt món (khiến rò rỉ quota nếu hủy món hoặc bàn không thanh toán).
  2. Khách gọi 2 đợt: đợt 1 được giảm giá, đợt 2 bị khóa giảm giá = 0, khiến tổng phiên 240.000đ với khuyến mãi 10% chỉ giảm 12.000đ thay vì 24.000đ (thực thu 228.000đ thay vì 216.000đ). Với cap 1, đợt 1 đã khóa cap khiến đợt 2 không được tính.
- **Giải pháp:**
  - Trong `backend/src/modules/guest/guest.service.ts`:
    - **Loại bỏ hoàn toàn** việc gọi `PricingService.recordPromotionRedemption` khi tạo order. Tạo order không bao giờ tiêu tốn quota khuyến mãi.
    - Logic đa vòng: Nếu phiên đã có promotion áp dụng từ vòng 1, vòng 2 tiếp tục áp dụng chính sách đó (nếu là `PERCENT`: tính tiếp chiết khấu % theo subtotal vòng 2, chặn theo trần `max_discount_amount` nếu có; nếu là `FIXED_AMOUNT`: tính tiếp phần tiền giảm còn lại).
  - Trong `backend/src/modules/staff/staff.service.ts`:
    - Chỉ claim lượt `current_redemptions = current_redemptions + 1` bằng câu lệnh SQL nguyên tử có điều kiện (`WHERE current_redemptions < max_redemptions`) **duy nhất tại thời điểm xác nhận thanh toán và đóng bàn (`confirmPaymentAndCloseSession`)**.
- **Kết quả review harness:**
  ```json
  {"id":"R2-session-percent","raw":240000,"actual":216000,"expected":216000}
  {"id":"R2b-session-cap","raw":120000,"actual":108000,"expected":108000}
  ```

---

### R3 — P1 — Bắt buộc kiểm tra quote `expectedAmount` tại settlement & xử lý trên UI (Issue #27 / #11)
- **Vấn đề Codex chỉ ra:** `expectedAmount` trước đây là optional. UI thu ngân không gửi trường này. Khi giá đổi giữa lúc xem và lúc chốt (do khuyến mãi hết hạn hoặc đổi giá), server vẫn chốt 200 mà thu ngân không hề hay biết.
- **Giải pháp:**
  - Trong `backend/src/modules/staff/staff.routes.ts`: Bắt buộc tham số `expectedAmount` (kiểm tra kiểu số `>= 0`). Nếu thiếu, trả về `400 MISSING_EXPECTED_AMOUNT`.
  - Trong `backend/src/modules/staff/staff.service.ts`: So sánh `finalAmount !== expectedAmount`, nếu lệch ném ngay `409 PRICE_CHANGED`.
  - Trong `frontend/src/pages/staff/TableDetailModal.tsx`:
    - Gửi `expectedAmount: billSummary.validBillTotal` và `settlementVersion: billSummary.settlementVersion`.
    - Khi nhận mã lỗi `409 PRICE_CHANGED`, giao diện tự động gọi `loadSessionData()` để tải lại số tiền mới nhất và hiển thị thông báo lỗi yêu cầu thu ngân xem lại giá mới, **không tự động chấp nhận ngầm**.
- **Kết quả review harness:**
  ```json
  {"id":"R3-price-change","displayed":100000,"missingQuoteStatus":400,"httpStatus":409,"expectedConflict":409}
  ```

---

### R4 — P1 — Quán `suspended` vẫn tất toán và phục vụ các phiên bàn đang mở (Issue #26 / #6)
- **Vấn đề Codex chỉ ra:** Quán bị suspended chặn luôn cả việc phục vụ và thu tiền của khách đang ngồi ăn dở dang tại quán.
- **Giải pháp:**
  - Cập nhật `authenticateStaff` trong `backend/src/middleware/auth.ts`: dùng regex kiểm tra route whitelist chính xác.
  - Cho phép các route tất toán và phục vụ bàn cũ: `/sessions/:id/confirm-payment-and-close`, `/sessions/:id/close-without-charge`, `/sessions/:id/serve-all`, `/sessions/:id/accept-all`, `/order-items/:id/accept`, `/order-items/:id/serve`, `/order-items/:id/cancel`, `/service-requests/:id/accept`, `/service-requests/:id/complete`, `/tables/:id/mark-ready`.
  - Chặn triệt để việc mở bàn mới (`/tables/:id/open`) và sửa đổi danh mục/món ăn (`/menu-items/**`) với lỗi `403 SHOP_SUSPENDED`.
- **Kết quả review harness:**
  ```json
  {"id":"R4-suspended","payStatus":200,"serveStatus":409}
  ```

---

### R5 — P1 — Nâng cấp boundary gate hai chiều chống bypass (Issue #29 / #8)
- **Vấn đề Codex chỉ ra:** Gate trước đây chỉ kiểm tra tác giả `SangVuxx`, nếu là tác giả khác thì bypass toàn bộ, dẫn đến nguy cơ Core vô tình sửa tệp của Sang.
- **Giải pháp:**
  - Viết lại hàm `validateAuthorFiles` trong `scripts/check-file-boundaries.mjs`:
    - Nếu tác giả là Sang: chỉ được sửa `backend/src/modules/admin/**` và `frontend/src/pages/admin/**` (trừ `AdminLogin.tsx`).
    - Nếu tác giả là Core (hoặc bất kỳ ai khác): **tuyệt đối không được sửa** bất kỳ tệp nào trong vùng của Sang (`backend/src/modules/admin/**`, `frontend/src/pages/admin/**`).
  - Thêm test unit `backend/src/tests/core-audit/sec05_boundary_check.test.ts` (7/7 tests đạt).

---

### R6 — P2 — Đối soát báo cáo net report theo bill snapshot (Issue #30 / #13)
- **Vấn đề Codex chỉ ra:** Báo cáo `topServedItems` trước đây chỉ cộng dồn `gross_amount` và trừ `discount_amount` của `order_items`. Khi phiên áp dụng khuyến mãi cấp phiên tại lúc thanh toán, số liệu `total_amount` báo cáo món vẫn ghi nhận giá gốc 120.000đ trong khi thực thu là 100.000đ.
- **Giải pháp:**
  - Viết lại truy vấn báo cáo trong `backend/src/modules/reports/reports.routes.ts`:
    - Với các phiên đã chốt (`bills.status = 'CONFIRMED'`), đối soát trực tiếp từ bảng bất biến `bill_lines`:
      `gross_amount = SUM(quantity_served * unit_price)`
      `total_amount = SUM(subtotal)` (trong đó `subtotal` đã được thuật toán phần dư lớn nhất phân bổ chính xác từng đồng chiết khấu khuyến mãi cấp phiên).
    - Với các phiên `OPEN`: tính theo các món đã phục vụ.
- **Kết quả review harness:**
  ```json
  {"id":"R5-net-report","settled":100000,"reportedGross":120000,"reportedNet":100000}
  ```

---

### R7 — P2 — Snapshot metadata khuyến mãi và bảo toàn trace khi sửa/xóa promotion (Issue #31 / #10/#13)
- **Vấn đề Codex chỉ ra:** Bảng `promotion_redemptions` có khóa ngoại `ON DELETE CASCADE` tới bảng `promotions`, và `getBillSummary` của bill `CLOSED` vẫn `LEFT JOIN promotions` để lấy title/value. Khi xóa promotion, trace redemption bị xóa sạch; khi sửa promotion, hóa đơn lịch sử hiển thị sai tên/giá trị mới.
- **Giải pháp:**
  - Tạo migration `backend/src/db/migrations/008_promotion_redemption_snapshots.sql`:
    - Thêm các cột snapshot bất biến: `snapshot_title VARCHAR(255)`, `snapshot_code VARCHAR(64)`, `snapshot_discount_type VARCHAR(32)`, `snapshot_discount_value BIGINT`.
    - Chuyển ràng buộc khóa ngoại sang `ON DELETE SET NULL`.
  - Trong `StaffService.confirmPaymentAndCloseSession`: lưu đầy đủ snapshot metadata vào `promotion_redemptions`.
  - Trong `GuestService.getBillSummary`: dùng `COALESCE(pr.snapshot_title, p.title)` để ưu tiên dữ liệu snapshot tại thời điểm thanh toán. Kể cả khi promotion bị sửa hoặc xóa khỏi hệ thống, bill lịch sử vẫn giữ nguyên 100% dữ liệu.
- **Kết quả review harness:**
  ```json
  {"id":"R6-mutable-promo-snapshot","before":"Review snapshot original","after":"Review snapshot original","redemptionsAfterDeletion":1,"promotionsAfterDeletion":1,"totalAfterDeletion":100000}
  ```

---

### R8 — P2 — Readiness probe xác thực migration schema bắt buộc (Issue #32 / #14)
- **Vấn đề Codex chỉ ra:** `/health/readiness` bắt lỗi truy vấn `schema_migrations` rồi fallback về `SELECT 1`, khiến server trả về 200 ngay cả khi bảng migration bị thiếu hoặc schema chưa hoàn tất.
- **Giải pháp:**
  - Viết lại probe `/health/readiness` trong `backend/src/app.ts`:
    - Kiểm tra bảng `schema_migrations` và xác thực migration bắt buộc `000_base_schema.sql` đã được ghi nhận.
    - Nếu bảng bị thiếu, bị đổi tên hoặc migration rỗng, trả về `503 Service Unavailable` (`database: 'schema_incomplete'`).
    - Bỏ hoàn toàn fallback `SELECT 1`.
- **Kết quả review harness:**
  ```json
  {"id":"R7-readiness","migrationTableMissing":true,"status":503}
  ```

---

### R9 — P2 — Kích hoạt Staff mutation rate limiter (Issue #33 / #22)
- **Vấn đề Codex chỉ ra:** `staffMutationLimiter` chỉ được khai báo trong `security.ts`, chưa từng được gắn vào router; `keyGenerator` đọc `staff.userId` thay vì `staff.id`.
- **Giải pháp:**
  - Sửa `keyGenerator` trong `backend/src/middleware/security.ts` để đọc đúng `staff.id` và `staff.tenantId`.
  - Gắn `staffRouter.use(staffMutationLimiter)` trong `backend/src/modules/staff/staff.routes.ts` ngay sau `authenticateStaff`, áp dụng cho toàn bộ các thao tác ghi dữ liệu của nhân viên (POST, PUT, DELETE, PATCH).

---

### R10 — P2 — Bổ sung test concurrency race & runner an toàn (Issue #34 / #23)
- **Vấn đề Codex chỉ ra:** Test BUS-06 trước đây gọi thanh toán tuần tự thay vì race đồng thời thực sự; `migrate.ts` cần đảm bảo không tự động chạy các tệp `_down.sql`.
- **Giải pháp:**
  - `backend/src/db/migrate.ts`: Đã có bộ lọc `.filter((f) => f.endsWith('.sql') && !f.includes('_down'))` ngăn runner quét nhầm down migrations.
  - Bổ sung ca kiểm thử concurrency thực tế trong `backend/src/tests/core-audit/bus02_to_06_finance_lifecycle.test.ts` sử dụng `Promise.allSettled` chạy đua 2 phiên tất toán đồng thời tranh chấp promotion `max_redemptions = 1`. Kết quả: đúng 1 phiên thành công (200), đúng 1 phiên thất bại (409 `PROMOTION_EXHAUSTED`), `current_redemptions` trong DB tuyệt đối không vượt quá 1.

---

## 3. Lệnh Tái Hiện & Kiểm Tra Độc Lập Cho Codex

Các câu lệnh dưới đây có thể chạy trực tiếp tại thư mục dự án để tái hiện 100% bằng chứng:

```bash
# 1. Chạy harness thu thập bằng chứng của Codex (đạt 8/8 ca kiểm thử)
cd backend && npx tsx scripts/review-core-handoff-2026-10-20.mjs

# 2. Chạy toàn bộ test suite backend (15 tệp, 116 tests đạt 100%)
npm --prefix backend test

# 3. Kiểm tra ranh giới tệp hai chiều (0 vi phạm)
node scripts/check-file-boundaries.mjs origin/main

# 4. Kiểm tra biên dịch frontend & backend
npm --prefix frontend run build
npm --prefix backend run build
```

---

## 4. Tóm Tắt Tình Trạng Nhánh

- **Nhánh hiện tại:** `codex/core-audit-fixes`
- **Tình trạng git:** Đã push sạch lên remote `origin/codex/core-audit-fixes`.
- **Cam kết:** Không tự động merge vào `main`, không deploy môi trường staging/production. Kính chuyển Codex review lại toàn bộ diff và đưa ra quyết định tiếp theo.
