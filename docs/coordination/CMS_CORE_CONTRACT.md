# Hợp Đồng Tích Hợp CMS Super Admin – Core & Chính Sách Trạng Thái Quán (Issue #6)

Tài liệu này xác lập hợp đồng kỹ thuật giữa module **CMS Super Admin** (`@SangVuxx`) và **Core** (`@dothuongton`), có hiệu lực kể từ commit `396e7cc`.

---

## 1. Chuẩn Contract API Super Admin (SA-01)

### 1.1 Envelope định dạng thành công
Tất cả các API quản lý trong `/api/v1/admin/**` tuân thủ cấu trúc chuẩn:

- **Danh sách / Phân trang:**
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

- **Chi tiết / Thao tác đơn lẻ:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Thao tác thành công"
}
```

### 1.2 Envelope định dạng lỗi
```json
{
  "error": "ERROR_CODE",
  "message": "Mô tả lỗi dễ hiểu cho người dùng",
  "details": [ ... ]
}
```

---

## 2. Vòng Đời & Ma Trận Trạng Thái Quán (Tenant Lifecycle Matrix)

Cột `tenants.status` bao gồm 4 trạng thái: `draft`, `active`, `suspended`, `archived`.

| Trạng thái | Ý nghĩa | Quyền Guest (Khách quét QR) | Quyền Staff (Nhân viên / Quản lý) | Quyền Super Admin |
|---|---|---|---|---|
| **`draft`** | Quán mới khởi tạo, đang setup menu/bàn, chưa khai trương | ❌ Chặn (`SHOP_NOT_READY`) | ⚠️ Cho phép setup menu, cấu hình quán | ✅ Toàn quyền chỉnh sửa, duyệt mở quán |
| **`active`** | Đang hoạt động bình thường | ✅ Đặt món, gọi phục vụ, xem bill | ✅ Phục vụ, quản lý, thu ngân, đổi menu | ✅ Xem thống kê, giám sát |
| **`suspended`** | Quán bị tạm đình chỉ (vi phạm, nợ phí, bảo trì) | ❌ Chặn đặt món mới (`SHOP_SUSPENDED`) | ⚠️ **Chặn thêm món/mở bàn mới**.<br>✅ **Được phép thu tiền & đóng bàn đang mở** (`/pay`, `/serve`) để không kẹt tiền của khách & quán.<br>✅ Xem lịch sử, xuất báo cáo | ✅ Toàn quyền tạm ngưng hoặc mở khóa trở lại `active` |
| **`archived`** | Quán đã đóng cửa hoàn toàn / lưu trữ | ❌ Chặn hoàn toàn | ❌ Chặn truy cập (`SHOP_ARCHIVED`).<br>⚠️ Ngoại lệ an toàn: cho phép xem bill summary và tất toán/đóng các phiên bàn còn tồn đọng (`/pay`, `/close-without-charge`) để giải phóng bàn và ghi ledger | ✅ Xem lịch sử lưu trữ.<br>❌ **Không xóa cứng tenant, bills, ledger** để bảo toàn lịch sử kế toán.<br>✅ Có thể khôi phục về `active`. |

### 2.1 Chính sách Lưu trữ Quán khi còn Phiên Hoạt động (Issue #6, Issue #19)
Khi Super Admin thực hiện lưu trữ quán (`status: 'archived'`):
1. **Phía Super Admin API (`@SangVuxx`)**:
   - Trước khi cập nhật quán sang `archived`, API cần kiểm tra xem quán còn phiên bàn nào đang `OPEN` hoặc chưa thanh toán hay không.
   - Nếu còn phiên mở, Super Admin API khuyến nghị cảnh báo hoặc chặn với mã `409 SHOP_HAS_OPEN_SESSIONS`: `"Không thể lưu trữ quán ăn khi vẫn còn bàn chưa hoàn tất thanh toán. Vui lòng đóng tất cả bàn trước khi lưu trữ."`
2. **Phía Core Auth & Session (`@dothuongton`)**:
   - Trong trường hợp quán bị lưu trữ khẩn cấp trong khi vẫn còn phiên bàn dang dở, middleware `authenticateStaff` bảo đảm không làm kẹt luồng tài chính:
     - Guest bị chặn hoàn toàn (`403 SHOP_ARCHIVED`).
     - Staff bị chặn mở bàn mới, đặt món, gọi món, cập nhật menu (`403 SHOP_ARCHIVED`).
     - Staff **được phép** gọi `/sessions/:id/bill-summary`, `/sessions/:id/confirm-payment-and-close`, và `/sessions/:id/close-without-charge` để tất toán dứt điểm hóa đơn, ghi nhận ledger kế toán và đóng phiên an toàn.

---

## 3. Quy Trình Đề Xuất & Triển Khai Schema / Migration

1. **Tuyệt đối cấm**: `@SangVuxx` (lane CMS Super Admin) không được tự ý sửa đổi file trong `backend/src/db/**`, `backend/src/middleware/auth.ts`, `backend/src/config/**`.
2. **Quy trình khi cần thêm cột / bảng mới**:
   - Bước 1: Sang tạo file đề xuất tại `docs/admin-cms/RFC_<tên_tính_năng>.md` nêu rõ:
     - Tên bảng / cột cần thêm, kiểu dữ liệu, ràng buộc (foreign key, index, default value).
     - Lý do nghiệp vụ và kịch bản truy vấn.
   - Bước 2: `@dothuongton` review, tạo migration file có số thứ tự kế tiếp trong `backend/src/db/migrations/`, kiểm thử rollback và cập nhật schema.
   - Bước 3: Thông báo commit SHA để Sang kéo về làm việc tiếp.
