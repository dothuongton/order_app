# Kế hoạch Triển khai Thử nghiệm Luồng Gaeru (P0 & P1)

- **Ngày lập:** 21/10/2026
- **Trạng thái:** P0 Approved & Inventory Ready → Bắt đầu P1 Implementation
- **Nhánh thực hiện:** `codex/gaeru-01-request-claim`
- **Target PR base:** `codex/gaeru-flow-experiment`
- **Owner:** `dothuongton/Core` (tuân thủ ranh giới AGENTS.md, không chạm CMS SangVuxx)

---

## 1. Mục tiêu Pha P0 & P1

### 1.1 Mục tiêu Pha P0 (Inventory & Contract)
1. Xác lập ranh giới cô lập tuyệt đối: Sandbox database riêng biệt, không dùng biến môi trường hay dữ liệu production.
2. Ánh xạ toàn diện Schema, State Machine, Error Codes, Lock Order, API DTO giữa `order_app` baseline (`92f81cb`) và luồng Gaeru.
3. Kế hoạch Migration & Rollback hai chiều không nuốt lỗi và an toàn dữ liệu.
4. Ma trận kiểm thử hồi quy bao quát các ca EX01–EX04, EX08–EX09, EX13–EX15.

### 1.2 Mục tiêu Pha P1 (Yêu cầu Mở bàn → Staff Duyệt → Claim 1 Thiết bị)
1. **Public QR Mode:** Trình duyệt quét QR chỉ thấy thông tin bàn tối thiểu (số bàn, tên quán, trạng thái trống/chờ/có khách) và menu xem món. Không trả về guest_name, session_id của nhóm khác, bills, orders hoặc token.
2. **Device Cookie & Hash:** Tạo cookie `__Host-order-device` (hoặc `order_device` trên localhost non-https) ngẫu nhiên 32 bytes (Secure, HttpOnly, SameSite=Lax). Lưu dạng SHA-256 hash trên server; không bao giờ phơi bày secret trong JavaScript hay log.
3. **Pending Approval Lifecycle (15 phút):**
   - Khách nhập tên (tối đa 80 ký tự đã trim) gửi yêu cầu mở bàn với `request_id` (UUID).
   - Tối đa 1 phiên chờ hoặc mở trên 1 bàn tại một thời điểm (ràng buộc DB Postgres).
   - Pending tự động hết hạn sau 15 phút trên server; Staff hoặc khách có thể reject/withdraw; chỉ một kết quả duy nhất thắng giữa approve / reject / withdraw / expire trong transaction có lock.
   - Giới hạn tần suất: tối đa 6 yêu cầu mới / 10 phút / device hash.
4. **Staff Approval & Single Device Claim:**
   - Nhân viên duyệt yêu cầu mở bàn: chuyển trạng thái sang `OPEN`, tạo Bill duy nhất, gán `claimed_device_hash` cho thiết bị gửi yêu cầu, khởi tạo `claim_version = 1`.
   - Thiết bị được duyệt trở thành thiết bị độc quyền giữ quyền đặt món (`ORDERING_MODE=approved_single_device`).
   - Các thiết bị khác quét cùng bàn chỉ có quyền xem menu (Read-Only Mode); nếu cố tình gọi API gửi đơn hoặc socket bypass sẽ bị chặn với HTTP 403 `DEVICE_NOT_CLAIMED`.
5. **Reload / Multi-tab & Release / Reassign:**
   - Cùng browser cookie: reload trang hoặc mở nhiều tab vẫn giữ nguyên claim.
   - Xóa cookie hoặc mở tab ẩn danh mới: không thể chiếm claim của bàn đang phục vụ.
   - Nhân viên có chức năng Giải phóng Claim (`release-claim`) khi khách hết pin/rời bàn, tăng `claim_version` và thu hồi token cũ.

---

## 2. Inventory Schema & Migration Plan

### 2.1 Thay đổi Schema (`table_sessions`)
Bổ sung các cột phục vụ vòng đời yêu cầu và claim vào bảng `table_sessions`:
- `status`: Thêm trạng thái `'PENDING_APPROVAL'` bên cạnh `'OPEN'` và `'CLOSED'`.
- `requested_at`: `TIMESTAMPTZ` — Thời điểm khách gửi yêu cầu mở bàn.
- `approved_at`: `TIMESTAMPTZ` — Thời điểm Staff duyệt yêu cầu.
- `approved_by`: `UUID REFERENCES users(id)` — Nhân viên phê duyệt.
- `expires_at`: `TIMESTAMPTZ` — Thời điểm hết hạn của phiên pending (NOW() + 15 phút).
- `requester_guest_name`: `VARCHAR(80)` — Tên khách hiển thị (đã trim, sanitize).
- `requester_device_hash`: `VARCHAR(128)` — SHA-256 hash của device cookie.
- `claimed_device_hash`: `VARCHAR(128)` — SHA-256 hash của thiết bị nắm giữ quyền đặt món.
- `claim_version`: `INT NOT NULL DEFAULT 1` — Version của claim, tăng khi giải phóng/đổi thiết bị.
- `close_reason`: `VARCHAR(64)` — Lý do đóng phiên (`'NORMAL'`, `'STAFF_REJECTED'`, `'EXPIRED'`, `'CUSTOMER_WITHDRAWN'`, `'CLOSED_WITHOUT_CHARGE'`).
- `request_id`: `VARCHAR(128)` — Idempotency key của yêu cầu mở bàn.

### 2.2 Ràng buộc Toàn vẹn & Index Duy nhất (PostgreSQL)
- **Baseline:** `idx_unique_open_session_per_table ON table_sessions (table_id) WHERE status = 'OPEN';`
- **Migration `010_gaeru_session_request_claim.sql`:**
  1. *Preflight:* Kiểm tra không có bàn nào đang tồn tại nhiều hơn 1 phiên có trạng thái `IN ('PENDING_APPROVAL', 'OPEN')`. Nếu có, fail-fast và yêu cầu xử lý trước.
  2. Drop index cũ `idx_unique_open_session_per_table`.
  3. Tạo index duy nhất mới:
     ```sql
     CREATE UNIQUE INDEX idx_unique_active_session_per_table
     ON table_sessions (table_id)
     WHERE status IN ('PENDING_APPROVAL', 'OPEN');
     ```
  4. Tạo index hỗ trợ tra cứu device và expiry:
     ```sql
     CREATE INDEX idx_table_sessions_pending_expiry
     ON table_sessions (expires_at)
     WHERE status = 'PENDING_APPROVAL';

     CREATE INDEX idx_table_sessions_requester_device
     ON table_sessions (tenant_id, requester_device_hash)
     WHERE status = 'PENDING_APPROVAL';
     ```
  5. *Postcondition:* Xác minh index tồn tại và ngăn chặn triệt để 2 phiên cùng active trên 1 bàn.

### 2.3 Rollback Plan (`010_gaeru_session_request_claim_down.sql`)
1. Đóng toàn bộ các phiên `PENDING_APPROVAL` thành `CLOSED` với `close_reason = 'MIGRATION_ROLLBACK'`.
2. Drop index `idx_unique_active_session_per_table`.
3. Khôi phục index ban đầu `idx_unique_open_session_per_table ON table_sessions (table_id) WHERE status = 'OPEN'`.
4. Drop các cột mới thêm nếu cần phục hồi nguyên trạng schema baseline.

---

## 3. Thứ tự Khóa & Chống Deadlock (Lock Ordering Matrix)

Mọi thao tác thay đổi trạng thái bàn/phiên phải tuân thủ nghiêm ngặt thứ tự khóa sau:
1. **Tenant Check:** Xác minh tenant hợp lệ (Read-only hoặc FOR SHARE).
2. **Table Row Lock:** `SELECT id, tenant_id FROM tables WHERE id = $1 FOR UPDATE` (Khóa cấp bàn trước).
3. **Session Row Lock:** `SELECT id, status, settlement_version, claim_version, expires_at FROM table_sessions WHERE id = $1 FOR UPDATE` (Khóa phiên sau).
4. **Sub-entities (Orders, Bills, Service Requests):** Chỉ thực hiện sau khi đã nắm giữ Table/Session lock.

Quy tắc:
- Không bao giờ khóa ngược từ Session về Table.
- Khi truy vấn nhiều bảng/phiên, sắp xếp thứ tự theo `UUID` tăng dần để tránh cyclic deadlock.
- Các thao tác đọc kiểm tra quyền đặt món dùng `SELECT ... FOR SHARE` trên `table_sessions`.

---

## 4. Đặc tả Hợp đồng API (API Contracts & DTOs)

### 4.1 Khách / Công khai (`/api/v1/guest/*`)

#### A. `GET /api/v1/guest/table/:qrId/bootstrap`
- **Mô tả:** Lấy thông tin trạng thái bàn và thiết bị của khách khi quét QR.
- **Headers/Cookies:** Nhận diện hoặc tự sinh cookie `__Host-order-device`.
- **Phản hồi Công khai (Khách lạ chưa claim):**
  ```json
  {
    "table": {
      "id": "uuid",
      "table_number": "A01",
      "tenant_name": "Phố Cổ Quán",
      "ordering_mode": "approved_single_device"
    },
    "table_status": "VACANT | PENDING | OCCUPIED",
    "device_state": "IDLE | REQUESTER | CLAIMED | VIEWER",
    "can_order": false,
    "can_request": true
  }
  ```
  *Bảo mật:* Tuyệt đối không chứa `guest_name` của người khác, không có `token`, không có `orders`, không có `bill`.

- **Phản hồi Thiết bị Gửi Yêu cầu (`device_state = 'REQUESTER'`):**
  ```json
  {
    "table_status": "PENDING",
    "device_state": "REQUESTER",
    "request": {
      "request_id": "uuid",
      "guest_name": "Anh Ba",
      "requested_at": "ISO-8601",
      "expires_at": "ISO-8601",
      "remaining_seconds": 840
    },
    "can_order": false,
    "can_withdraw": true
  }
  ```

- **Phản hồi Thiết bị Nắm Claim (`device_state = 'CLAIMED'`):**
  ```json
  {
    "table_status": "OCCUPIED",
    "device_state": "CLAIMED",
    "session_id": "uuid",
    "token": "guest_token_string",
    "claim_version": 1,
    "can_order": true,
    "bill": { ... },
    "orders": [ ... ]
  }
  ```

- **Phản hồi Thiết bị Khác khi Bàn Đang Mở (`device_state = 'VIEWER'`):**
  ```json
  {
    "table_status": "OCCUPIED",
    "device_state": "VIEWER",
    "can_order": false,
    "message": "Bàn đang có khách đặt món bởi thiết bị khác. Bạn chỉ có thể xem thực đơn."
  }
  ```

#### B. `POST /api/v1/guest/table/:qrId/request-open`
- **Mô tả:** Gửi yêu cầu mở bàn chờ nhân viên duyệt.
- **Body:** `{ "request_id": "UUID", "guest_name": "String (1-80 ký tự)" }`
- **Xử lý:**
  - Kiểm tra rate limit: tối đa 6 request/10 phút theo device hash và IP.
  - Transaction với `TABLE FOR UPDATE`:
    - Nếu bàn đang `OPEN`: trả về `409 TABLE_ALREADY_OCCUPIED`.
    - Nếu bàn đang `PENDING_APPROVAL`:
      - Nếu `expires_at <= NOW()`: tự động expire phiên cũ, tạo phiên mới.
      - Nếu trùng `request_id` và cùng device hash: trả về 200 idempotent.
      - Ngược lại: trả về `409 TABLE_REQUEST_PENDING`.
    - Tạo `table_sessions` với `status = 'PENDING_APPROVAL'`, `expires_at = NOW() + 15 phút`.
  - Phát sự kiện socket `table_session:requested` tới Staff room.
- **Phản hồi (201):**
  ```json
  {
    "status": "PENDING_APPROVAL",
    "request_id": "uuid",
    "guest_name": "Anh Ba",
    "expires_at": "ISO-8601"
  }
  ```

#### C. `POST /api/v1/guest/table/:qrId/withdraw-request`
- **Mô tả:** Khách tự hủy yêu cầu mở bàn của mình.
- **Body:** `{ "request_id": "UUID" }`
- **Xử lý:** Xác minh device hash khớp với `requester_device_hash`, chuyển trạng thái sang `CLOSED`, `close_reason = 'CUSTOMER_WITHDRAWN'`.

---

### 4.2 Nhân viên / Phê duyệt (`/api/v1/staff/*`)

#### A. `POST /api/v1/staff/tables/:id/approve-session`
- **Quyền:** `session.open` hoặc `manager`.
- **Body:** `{ "session_id": "UUID", "expected_version": 1 }`
- **Xử lý (Atomic Transaction):**
  1. Khóa Session `FOR UPDATE`.
  2. Xác minh `status = 'PENDING_APPROVAL'`.
  3. Kiểm tra `expires_at > NOW()`. Nếu đã hết hạn: cập nhật `status = 'CLOSED', close_reason = 'EXPIRED'`, rollback và trả về `409 REQUEST_EXPIRED`.
  4. Cập nhật `status = 'OPEN'`, `approved_at = NOW()`, `approved_by = staff.id`, `claimed_device_hash = requester_device_hash`, `claim_version = 1`.
  5. Tạo Bill rỗng duy nhất cho phiên.
  6. Tạo token phiên khách trong `guest_sessions` gắn với device hash.
  7. Commit và bắn realtime socket: `table_session:approved` tới bàn và `table:updated` tới toàn quán.
- **Phản hồi (200):**
  ```json
  {
    "status": "OPEN",
    "session_id": "uuid",
    "table_id": "uuid",
    "claimed_device_hash": "hash"
  }
  ```

#### B. `POST /api/v1/staff/tables/:id/reject-session`
- **Quyền:** `session.open` hoặc `manager`.
- **Body:** `{ "session_id": "UUID", "reason": "Bàn đã có người đặt trước" }`
- **Xử lý:** Cập nhật `status = 'CLOSED'`, `close_reason = 'STAFF_REJECTED'`. Phát socket `table_session:rejected`.

#### C. `POST /api/v1/staff/tables/:id/release-claim`
- **Quyền:** `session.open` hoặc `manager`.
- **Mô tả:** Giải phóng thiết bị claim khi khách hết pin hoặc gặp sự cố.
- **Xử lý:** Cập nhật `claimed_device_hash = NULL`, tăng `claim_version = claim_version + 1`, thu hồi toàn bộ token trong `guest_sessions`. Bàn vẫn ở trạng thái `OPEN`.

---

### 4.3 Kiểm soát Đặt món Chặt chẽ (Write Guard)
Tại `POST /api/v1/guest/orders`:
- Khi `ORDERING_MODE === 'approved_single_device'`:
  - Kiểm tra device cookie `__Host-order-device`.
  - Trong transaction đặt món:
    ```sql
    SELECT status, claimed_device_hash, claim_version
    FROM table_sessions
    WHERE id = $session_id FOR SHARE;
    ```
  - Nếu `claimed_device_hash IS NULL` hoặc `claimed_device_hash != hash(cookie)`:
    - Trả về HTTP 403:
      ```json
      {
        "error": "DEVICE_NOT_CLAIMED",
        "code": "DEVICE_NOT_CLAIMED",
        "message": "Thiết bị này không có quyền đặt món cho bàn này. Chỉ thiết bị giữ quyền mới có thể đặt món."
      }
      ```
- Chặn mọi nỗ lực dùng token cũ (legacy join bypass) hoặc tự tạo session để gửi đơn.

---

## 5. Danh mục Mã lỗi (Error Contract)

| Mã HTTP | Error Code | Ý nghĩa |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | Tên khách trống hoặc vượt quá 80 ký tự; request_id không phải UUID |
| 403 | `DEVICE_NOT_CLAIMED` | Thiết bị không nắm giữ claim của phiên bàn hiện tại |
| 403 | `CLAIM_REVOKED` | Quyền claim đã bị thu hồi hoặc phiên đã chuyển claim_version |
| 404 | `TABLE_NOT_FOUND` | Bàn không tồn tại hoặc sai tenant |
| 409 | `TABLE_ALREADY_OCCUPIED` | Bàn đang có khách phục vụ (`status = 'OPEN'`) |
| 409 | `TABLE_REQUEST_PENDING` | Bàn đang có yêu cầu mở khác đang chờ duyệt |
| 409 | `REQUEST_EXPIRED` | Yêu cầu mở bàn đã hết hạn 15 phút trước khi duyệt |
| 409 | `REQUEST_ALREADY_RESOLVED`| Yêu cầu đã được duyệt hoặc từ chối bởi thao tác đồng thời khác |
| 429 | `RATE_LIMIT_EXCEEDED` | Thiết bị vượt quá 6 yêu cầu mở bàn trong 10 phút |

---

## 6. Ranh giới Tệp và Phân công Quyền sở hữu (Ownership)

| Đường dẫn tệp | Trách nhiệm | Ghi chú |
|---|---|---|
| `backend/src/db/migrations/010_*.sql` | `dothuongton/Core` | Migration tạo cột, index, preflight & postcondition |
| `backend/src/db/auto-migrate.ts` | `dothuongton/Core` | Áp dụng migration tự động khi boot server sandbox |
| `backend/src/db/schema.sql` | `dothuongton/Core` | Cập nhật schema chuẩn khớp migration |
| `backend/src/modules/guest/guest.routes.ts` | `dothuongton/Core` | Endpoint bootstrap, request, withdraw, single-device guard |
| `backend/src/modules/guest/guest.service.ts` | `dothuongton/Core` | Logic hash cookie, transaction request bàn, expiry |
| `backend/src/modules/staff/staff.routes.ts` | `dothuongton/Core` | Endpoint approve, reject, release-claim |
| `backend/src/modules/staff/staff.service.ts` | `dothuongton/Core` | Logic phê duyệt nguyên tử, bàn giao claim |
| `backend/src/realtime/socket.ts` | `dothuongton/Core` | Phân vùng socket room công khai vs riêng tư, emit sự kiện |
| `frontend/src/context/GuestContext.tsx` | `dothuongton/Core` | Quản lý state claim, requester, viewer, fallback an toàn |
| `frontend/src/pages/guest/*` | `dothuongton/Core` | UI hiển thị trạng thái chờ, thông báo chỉ xem, form yêu cầu |
| `frontend/src/pages/staff/StaffDashboard.tsx` | `dothuongton/Core` | Tab / Banner duyệt yêu cầu mở bàn với đếm ngược 15p |
| `backend/src/modules/admin/**` | `SangVuxx` | **TUYỆT ĐỐI KHÔNG CHẠM** (Tuân thủ ranh giới CMS) |
| `frontend/src/pages/admin/**` | `SangVuxx` | **TUYỆT ĐỐI KHÔNG CHẠM** (trừ AdminLogin.tsx) |

---

## 7. Ma trận Kiểm thử Nghiệm thu (Test Matrix)

### 7.1 Backend Automated Tests (`backend/src/tests/gaeru_request_claim.test.ts`)
1. **EX01 — Concurrency Tranh chấp Bàn (Hai Device + Staff):**
   - Device 1 và Device 2 cùng gửi request mở bàn tại thời điểm gần như trùng nhau qua 2 connection.
   - Kết quả: Đúng 1 request thành công tạo `PENDING_APPROVAL` (201); request thứ 2 nhận 409 `TABLE_REQUEST_PENDING`. Không có lỗi 500.
2. **EX02 — Hết hạn 15 phút & Ranh giới Thời gian:**
   - Tạo request với `expires_at = NOW() - 1s`.
   - Gọi `approve-session`: Bị từ chối với 409 `REQUEST_EXPIRED`, phiên chuyển thành `CLOSED` (`close_reason = 'EXPIRED'`).
   - Gửi request mới trên bàn đó: Thành công 201 (bàn đã được giải phóng).
   - Test Server Restart: Hạn 15 phút lưu trong DB không bị reset khi server khởi động lại.
3. **EX03 — Privacy & Chống Rò rỉ Dữ liệu:**
   - Gọi `GET /api/v1/guest/table/:qrId/bootstrap` từ thiết bị lạ:
     - Trạng thái `OCCUPIED` hoặc `PENDING`.
     - Phản hồi KHÔNG chứa `guest_name` của người khác.
     - KHÔNG chứa `token` hoặc session secret.
     - KHÔNG thể đọc `bills` hoặc `orders` của bàn khi chưa có claim.
4. **EX04 — Độc quyền Claim & Chặn Thiết bị Thứ hai:**
   - Staff approve request của Device 1: Device 1 nắm claim.
   - Device 1 gửi đơn (`POST /api/v1/guest/orders`): Thành công 201.
   - Device 2 cố tình gửi đơn (`POST /api/v1/guest/orders`): Bị chặn với HTTP 403 `DEVICE_NOT_CLAIMED`.
   - Device 1 mở nhiều tab / reload: Vẫn giữ claim nhờ cookie hash hợp lệ.
   - Device 2 xóa cookie / profile mới: Vẫn không thể chiếm claim khi bàn đang `OPEN`.
5. **EX04b — Giải phóng Claim (Release) & Thu hồi Token:**
   - Staff gọi `release-claim`: `claim_version` tăng, `claimed_device_hash = NULL`.
   - Device 1 gửi đơn tiếp: Bị chặn với 403 `CLAIM_REVOKED`.
6. **EX08 — Race Approve vs Reject vs Withdraw:**
   - Dùng 2 kết nối độc lập và barrier mô phỏng khách bấm withdraw đúng tích tắc Staff bấm approve.
   - Kết quả: Chỉ 1 thao tác thắng và commit; thao tác thua nhận 409 conflict rõ ràng, DB luôn ở trạng thái nhất quán.
7. **EX09 — Legacy Token Bypass Protection:**
   - Cố tình dùng token của phiên trước hoặc token mint giả để gọi API đặt món: Bị từ chối ngay lập tức.
8. **EX13 — Tính tương thích & Suite Gốc:**
   - Khi `ORDERING_MODE=multi_device` (mặc định của main), toàn bộ test suite gốc vẫn chạy xanh 100%.

### 7.2 Browser E2E & Realtime Verification (`scripts/verify-gaeru-flow-browser.mjs`)
- Kịch bản 1: Device A quét QR bàn trống → Điền tên "Khách VIP" → Gửi yêu cầu → Hiển thị màn hình chờ với đồng hồ đếm ngược.
- Kịch bản 2: Device B quét cùng bàn → Thấy thông báo bàn đang chờ nhân viên duyệt → Chỉ xem được Menu.
- Kịch bản 3: Nhân viên trên Staff Dashboard nhận thông báo realtime → Bấm "Duyệt yêu cầu".
- Kịch bản 4: Device A tự động chuyển sang trạng thái đã duyệt → Đặt món thành công.
- Kịch bản 5: Device B thử đặt món → Giao diện hiển thị Read-Only, nút đặt món bị vô hiệu hóa.
- Kịch bản 6: Mobile viewport emulation (iPhone PWA 390x844 & 360x640).

---

## 8. Bàn giao & Kế hoạch Tiếp theo

1. **Hoàn thành Pha P0:** Tài liệu kế hoạch này được commit vào nhánh `codex/gaeru-01-request-claim`.
2. **Triển khai Pha P1:**
   - Migration `010` & Schema update.
   - Backend routes & services (Guest & Staff).
   - Frontend GuestContext & UI components.
   - Bộ test tự động backend `gaeru_request_claim.test.ts` và browser script.
3. **Mở Pull Request:** Hướng vào base `codex/gaeru-flow-experiment` kèm đầy đủ bằng chứng kiểm thử, logs và screenshots để Codex review độc lập.
