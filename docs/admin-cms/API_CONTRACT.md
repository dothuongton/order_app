# Đặc Tả Kỹ Thuật API Contract Phân Hệ Super Admin CMS

Tài liệu đặc tả các giao thức API, DTOs (Data Transfer Objects), phân trang (Pagination), mã lỗi và quy tắc bảo mật cho phân hệ Super Admin.

---

## 1. Nguyên Tắc Thiết Kế API

1. **Base URL**: `/api/v1/admin`
2. **Cơ Chế Xác Thực & Phân Quyền**:
   - Header bắt buộc: `Authorization: Bearer <jwt_token>`
   - Toàn bộ các route đều được bảo vệ bởi middleware `authenticateSuperAdmin`. Middleware này kiểm tra tính hợp lệ của token và cờ `is_platform_admin = true`.
   - Nếu không có token hoặc token sai $\rightarrow$ `401 UNAUTHORIZED`.
   - Nếu token hợp lệ nhưng không phải Super Admin $\rightarrow$ `403 FORBIDDEN`.
3. **Chống Tấn Công Dữ Liệu (Security & Validation)**:
   - Tất cả tham số `id` được kiểm tra UUID v4 hợp lệ bằng `adminRouter.param('id', ...)`.
   - Toàn bộ Request Body và Query String đều được validate nghiêm ngặt bằng thư viện Zod với chế độ `.strict()`, ngăn chặn triệt để kỹ thuật Mass Assignment (ví dụ: cấm gửi `is_platform_admin`, `role` hoặc can thiệp trường nội bộ).
   - Truy vấn cơ sở dữ liệu bắt buộc 100% sử dụng Parameterized Queries (`$1`, `$2`, ...) để loại trừ rủi ro SQL Injection.
   - Tuyệt đối không log hoặc trả về mật khẩu, `password_hash` hay secret trong response JSON.

---

## 2. Chuẩn Hóa Phản Hồi (Response & Error Envelopes)

### 2.1. Phản Hồi Thành Công
- **Dữ liệu đơn lẻ / Tác vụ**:
```json
{
  "message": "Thông điệp kết quả",
  "data": { ... }
}
```
*(Ghi chú: Giữ tương thích ngược với format hiện có: `{ message: string, shop: { ... } }`)*

- **Dữ liệu danh sách phân trang**:
```json
{
  "shops": [ { ... } ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### 2.2. Phản Hồi Lỗi Chuẩn Hóa
```json
{
  "error": "MÃ_LỖI_CHUẨN",
  "message": "Mô tả lỗi chi tiết cho người dùng",
  "details": [
    {
      "field": "slug",
      "issue": "Slug chỉ được chứa chữ cái thường, số và dấu gạch ngang"
    }
  ]
}
```

### 2.3. Bảng Danh Mục Mã Lỗi (Error Codes Catalog)

| HTTP Code | Error Code | Ý Nghĩa / Ngữ Cảnh Xảy Ra |
| :---: | :--- | :--- |
| **400** | `INVALID_ID` | Tham số ID trong URL không đúng định dạng UUID. |
| **400** | `VALIDATION_ERROR` | Dữ liệu đầu vào vi phạm quy tắc validate của schema Zod. |
| **401** | `UNAUTHORIZED` | Thiếu token đăng nhập, token sai hoặc đã hết hạn. |
| **403** | `FORBIDDEN` | Tài khoản không có cờ `is_platform_admin = true`. |
| **404** | `NOT_FOUND` | Không tìm thấy tài nguyên nhà hàng hoặc bản ghi tương ứng. |
| **409** | `SLUG_ALREADY_EXISTS` | Slug định danh URL đã được quán khác đăng ký trước đó. |
| **409** | `CONFLICT` | Xung đột tài nguyên dữ liệu trong quá trình thao tác. |
| **500** | `SERVER_ERROR` | Lỗi nội bộ máy chủ; không phơi bày stack trace hoặc thông tin nhạy cảm. |

---

## 3. Danh Mục Chi Tiết Các Endpoints

### 3.1. Thống Kê Tổng Quan Nền Tảng
- **Endpoint**: `GET /api/v1/admin/stats`
- **Mô tả**: Tổng hợp số liệu vận hành và doanh thu đã xác nhận trên toàn hệ thống.
- **Phản Hồi (200 OK)**:
```json
{
  "totalShops": 12,
  "activeShops": 10,
  "suspendedShops": 2,
  "archivedShops": 0,
  "totalRevenue": 154200000,
  "totalSettlements": 340,
  "totalOrders": 1250
}
```

---

### 3.2. Danh Sách Nhà Hàng Phân Trang & Lọc
- **Endpoint**: `GET /api/v1/admin/shops`
- **Query Parameters**:
  - `page` *(tùy chọn, số nguyên $\ge 1$, mặc định `1`)*: Số thứ tự trang cần lấy.
  - `limit` *(tùy chọn, số nguyên từ `1` đến `100`, mặc định `20`)*: Số lượng bản ghi trên một trang.
  - `search` *(tùy chọn, chuỗi, tối đa 100 ký tự)*: Từ khóa tìm kiếm theo tên quán, slug hoặc email chủ quán.
  - `status` *(tùy chọn, enum: `all`, `active`, `suspended`, `draft`, `archived`, mặc định `all`)*: Bộ lọc trạng thái.
  - `sortBy` *(tùy chọn, enum: `created_at`, `name`, `revenue`, `orders`, mặc định `created_at`)*.
  - `order` *(tùy chọn, enum: `asc`, `desc`, mặc định `desc`)*.
- **Phản Hồi (200 OK)**:
```json
{
  "shops": [
    {
      "id": "c1f7a28e-8a5f-4a5f-9e2c-3b1a4c5d6e7f",
      "name": "Bếp Cơm Niêu Sài Gòn",
      "slug": "bep-com-nieu-sai-gon",
      "status": "active",
      "phone": "0901234567",
      "address": "123 Nguyễn Huệ, Quận 1, TP.HCM",
      "activeTemplateId": "classic",
      "activePublishedVersion": 1,
      "createdAt": "2026-03-15T08:30:00.000Z",
      "owner": {
        "id": "e2a3b4c5-d6e7-8f9a-0b1c-2d3e4f5a6b7c",
        "email": "owner@comnieu.vn",
        "fullName": "Nguyễn Văn A"
      },
      "tableCount": 15,
      "orderCount": 320,
      "totalRevenue": 48500000
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### 3.3. Xem Chi Tiết Một Nhà Hàng
- **Endpoint**: `GET /api/v1/admin/shops/:id`
- **Path Parameters**:
  - `id` *(bắt buộc, định dạng UUID v4)*: Mã định danh của nhà hàng.
- **Phản Hồi (200 OK)**:
```json
{
  "shop": {
    "id": "c1f7a28e-8a5f-4a5f-9e2c-3b1a4c5d6e7f",
    "name": "Bếp Cơm Niêu Sài Gòn",
    "slug": "bep-com-nieu-sai-gon",
    "status": "active",
    "phone": "0901234567",
    "address": "123 Nguyễn Huệ, Quận 1, TP.HCM",
    "description": "Cơm niêu truyền thống Việt Nam",
    "activeTemplateId": "classic",
    "activePublishedVersion": 1,
    "createdAt": "2026-03-15T08:30:00.000Z",
    "updatedAt": "2026-03-15T09:00:00.000Z",
    "owner": {
      "id": "e2a3b4c5-d6e7-8f9a-0b1c-2d3e4f5a6b7c",
      "email": "owner@comnieu.vn",
      "fullName": "Nguyễn Văn A",
      "phone": "0901234567"
    },
    "metrics": {
      "tableCount": 15,
      "orderCount": 320,
      "totalRevenue": 48500000
    }
  }
}
```
- **Phản Hồi Lỗi**:
  - `400 INVALID_ID`: Nếu ID không phải UUID.
  - `404 NOT_FOUND`: Nếu không tìm thấy nhà hàng.

---

### 3.4. Khởi Tạo Nhà Hàng Mới (Create Shop Transactional)
- **Endpoint**: `POST /api/v1/admin/shops`
- **Request Body (JSON)**:
```json
{
  "name": "Trà Sữa Nhà Làm",
  "slug": "tra-sua-nha-lam",
  "phone": "0912345678",
  "address": "45 Lê Lợi, Quận 1, TP.HCM",
  "ownerFullName": "Trần Thị B",
  "ownerEmail": "owner@trasua.vn",
  "ownerPassword": "StrongPassword123!"
}
```
- **Quy Tắc Kiểm Tra (Zod Validation)**:
  - `name`: string, trimmed, độ dài từ 1 đến 200 ký tự.
  - `slug`: string, regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`, độ dài tối đa 100 ký tự.
  - `phone`: string tùy chọn, tối đa 30 ký tự.
  - `address`: string tùy chọn, tối đa 1000 ký tự.
  - `ownerFullName`: string, trimmed, độ dài từ 1 đến 200 ký tự.
  - `ownerEmail`: string, trimmed, chuyển sang chữ thường (lowercase), định dạng email chuẩn, tối đa 254 ký tự.
  - `ownerPassword`: string, tối thiểu 8 ký tự, tối đa 72 bytes.
- **Nghiệp Vụ Giao Dịch (Database Transaction)**:
  1. Kiểm tra slug đã tồn tại trong bảng `tenants` chưa. Nếu đã có $\rightarrow$ ném lỗi `409 SLUG_ALREADY_EXISTS`.
  2. Tạo bản ghi `tenants` mới với trạng thái ban đầu là `active`.
  3. Xử lý tài khoản chủ quán (`users`):
     - Băm mật khẩu bằng `bcrypt.hash(password, 10)`.
     - Nếu email chưa tồn tại: tạo mới user.
     - Nếu email đã tồn tại: tái sử dụng tài khoản hiện có, **tuyệt đối không ghi đè mật khẩu của tài khoản cũ** và không cấp thêm quyền hệ thống trái phép.
  4. Gán quyền chủ quán trong bảng `memberships`: `role = 'owner'` cho quán vừa tạo.
  5. Khởi tạo theme mặc định trong bảng `cms_drafts` và bản phát hành phiên bản 1 trong `cms_published_versions`.
  6. Tạo 5 bàn ăn mẫu mặc định (`Bàn 01` $\rightarrow$ `Bàn 05`) kèm mã QR công khai.
  7. Tạo 2 danh mục món ăn mẫu (`Món Ăn Nổi Bật`, `Đồ Uống & Tráng Miệng`).
  8. Ghi nhật ký vào bảng `audit_logs` với action `SUPER_ADMIN_CREATE_SHOP`.
  9. Nếu có bất kỳ lỗi nào trong các bước trên $\rightarrow$ ROLLBACK toàn bộ giao dịch.
- **Phản Hồi (201 Created)**:
```json
{
  "message": "Tạo quán thành công",
  "shop": {
    "id": "a9b8c7d6-e5f4-3a2b-1c0d-e9f8a7b6c5d4",
    "name": "Trà Sữa Nhà Làm",
    "slug": "tra-sua-nha-lam",
    "status": "active",
    "owner": {
      "id": "f1e2d3c4-b5a6-7890-1234-56789abcdef0",
      "email": "owner@trasua.vn",
      "fullName": "Trần Thị B"
    }
  }
}
```

---

### 3.5. Cập Nhật Thông Tin Hoặc Chuyển Đổi Vòng Đời Quán
- **Endpoint**: `PATCH /api/v1/admin/shops/:id`
- **Path Parameters**: `id` (UUID v4).
- **Request Body (JSON)**:
```json
{
  "name": "Trà Sữa Nhà Làm Premium",
  "slug": "tra-sua-nha-lam-premium",
  "phone": "0912345679",
  "address": "45-47 Lê Lợi, Quận 1, TP.HCM",
  "description": "Trà sữa sạch nguyên liệu tự nhiên",
  "status": "suspended"
}
```
- **Quy Tắc Kiểm Tra (Zod Validation)**:
  - `status`: enum `['draft', 'active', 'suspended', 'archived']` tùy chọn.
  - `slug`: regex kebab-case hợp lệ tùy chọn. Nếu đổi slug, kiểm tra trùng lặp với các quán khác (`id != :id`).
  - `name`, `phone`, `address`, `description`: chuỗi tùy chọn với giới hạn độ dài chặt chẽ.
- **Nghiệp Vụ Giao Dịch**:
  1. Kiểm tra quán tồn tại trong cơ sở dữ liệu.
  2. Thực hiện cập nhật các trường được gửi lên.
  3. Ghi vết vào `audit_logs` lưu lại thông tin trước và sau (`previous` / `updated`).
- **Phản Hồi (200 OK)**:
```json
{
  "message": "Cập nhật quán thành công",
  "shop": {
    "id": "a9b8c7d6-e5f4-3a2b-1c0d-e9f8a7b6c5d4",
    "name": "Trà Sữa Nhà Làm Premium",
    "slug": "tra-sua-nha-lam-premium",
    "status": "suspended",
    "updatedAt": "2026-03-15T10:00:00.000Z"
  }
}
```

---

### 3.6. Danh Sách Giao Diện Mẫu (Templates Registry)
- **Endpoint**: `GET /api/v1/admin/templates`
- **Mô tả**: Trả về danh sách template giao diện dựng sẵn có trong hệ thống (`cms_templates`).
- **Phản Hồi (200 OK)**:
```json
{
  "templates": [
    {
      "id": "classic",
      "name": "Giao Diện Cổ Điển",
      "description": "Bố cục thực đơn truyền thống, trực quan cho nhà hàng và quán cafe",
      "thumbnailUrl": null,
      "defaultBlocks": ["header", "banners", "promotions", "categories", "product_grid", "cart_footer"],
      "editableFields": { "primaryColor": true, "showBanner": true },
      "isActive": true
    }
  ]
}
```

---

### 3.7. Nhật Ký Kiểm Toán (Audit Logs)
- **Endpoint**: `GET /api/v1/admin/audit-logs`
- **Query Parameters**:
  - `page` *(tùy chọn, số nguyên $\ge 1$, mặc định `1`)*.
  - `limit` *(tùy chọn, số nguyên từ `1` đến `100`, mặc định `50`)*.
  - `tenantId` *(tùy chọn, định dạng UUID v4)*: Lọc theo quán mục tiêu.
  - `action` *(tùy chọn, chuỗi)*: Lọc theo loại hành động.
- **Phản Hồi (200 OK)**:
```json
{
  "logs": [
    {
      "id": "1",
      "tenantId": "a9b8c7d6-e5f4-3a2b-1c0d-e9f8a7b6c5d4",
      "tenantName": "Trà Sữa Nhà Làm Premium",
      "userId": "d7c6b5a4-9876-5432-10fe-dcba98765432",
      "userName": "Super Administrator",
      "userEmail": "superadmin@qrorder.vn",
      "action": "SUPER_ADMIN_UPDATE_SHOP",
      "resourceType": "tenant",
      "resourceId": "a9b8c7d6-e5f4-3a2b-1c0d-e9f8a7b6c5d4",
      "details": {
        "previous": { "status": "active" },
        "updated": { "status": "suspended" }
      },
      "createdAt": "2026-03-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### 3.8. Xuất Nhật Ký Kiểm Toán CSV (Export Audit Logs CSV - Issue #99)
- **Endpoint**: `GET /api/v1/admin/audit-logs/export`
- **Quyền hạn**: Bắt buộc Super Admin (`authenticateSuperAdmin`). Các vai trò khác hoặc người dùng chưa xác thực bị chặn (401/403). Không mở URL công khai.
- **Giới hạn số dòng**: Tối đa $\le 1.000$ bản ghi. Khi vượt quá 1.000 bản ghi, máy chủ trả mã lỗi `400 Bad Request` với mã lỗi `EXPORT_LIMIT_EXCEEDED` yêu cầu người dùng thu hẹp khoảng thời gian hoặc thêm bộ lọc; tuyệt đối không âm thầm cắt bớt dữ liệu.
- **Query Parameters**:
  - `tenantId` *(tùy chọn, định dạng UUID v4)*: Lọc theo quán mục tiêu.
  - `userId` *(tùy chọn, định dạng UUID v4)*: Lọc theo người thực hiện.
  - `action` *(tùy chọn, chuỗi)*: Lọc theo loại hành động.
  - `startDate` / `from` *(tùy chọn, YYYY-MM-DD hoặc ISO)*: Lọc từ ngày.
  - `endDate` / `to` *(tùy chọn, YYYY-MM-DD hoặc ISO)*: Lọc đến ngày.
- **Bảo mật & Chuẩn hóa CSV**:
  - **UTF-8 BOM**: Luôn gắn tiền tố `\uFEFF` (Byte Order Mark) để Microsoft Excel hiển thị đúng tiếng Việt có dấu mà không bị lỗi font (mojibake).
  - **Chống Formula Injection (CSV Injection)**: Mọi ô dữ liệu bắt đầu bằng các ký tự điều khiển/công thức nguy hiểm (`=`, `+`, `-`, `@`, `\t`, `\r`, `\0`, kể cả sau khoảng trắng đầu dòng) đều được tiền tố hóa bằng dấu nháy đơn `'` và bao bọc trong cặp ngoặc kép `""` theo chuẩn RFC 4180.
  - **Che giấu dữ liệu nhạy cảm (Redaction)**: Trường `details` tự động che giấu đệ quy các trường nhạy cảm như `password`, `hash`, `token`, `secret`, `cookie`, `ip`, `user_agent`, `credential` thành `"[REDACTED]"`.
  - **Timezone**: Cột thời gian hiển thị theo giờ Việt Nam `YYYY-MM-DD HH:mm:ss` (UTC+7).
- **Phản Hồi (200 OK)**:
  - Header: `Content-Type: text/csv; charset=utf-8`
  - Header: `Content-Disposition: attachment; filename="audit-logs-YYYYMMDD.csv"`
  - Header: `X-Total-Count: <total>`
  - Body: Nội dung file CSV kèm BOM.
