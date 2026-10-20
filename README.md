# GAERU SOFT — Đặc tả V4 và code QR Order hiện tại

**Hệ thống đích:** [GAERU SOFT V4 Master](docs/specs/GAERU_SOFT_V4_MASTER.md) + [Bổ sung order tại bàn](docs/specs/GAERU_V4_TABLE_ORDER_ADDENDUM.md), do chủ dự án cung cấp, được lưu nguyên văn.

- Bắt đầu tại [docs/specs](docs/specs/README.md): thứ tự đọc, sai khác với code hiện tại và nguồn tài liệu.
- Theo dõi [25 module V4 và khoảng trống triển khai](docs/specs/V4_IMPLEMENTATION_MAP.md). Vá core/CMS hiện tại không đồng nghĩa hoàn tất V4.
- Quy tắc cộng tác: [AGENTS.md](AGENTS.md); [Karpathy skill trong repo](.agents/skills/karpathy-guidelines/SKILL.md), ghim nguồn và phiên bản.
- [EpicV4#50](https://github.com/dothuongton/order_app/issues/50) và [Sprint0#51](https://github.com/dothuongton/order_app/issues/51) theo dõi hệthốngđích; [#2](https://github.com/dothuongton/order_app/issues/2) chia ownership, [#24](https://github.com/dothuongton/order_app/issues/24) theo dõi core review, [#35](https://github.com/dothuongton/order_app/issues/35) chứa đánh giá Muse và kế hoạch liên quan. Spec Muse là đề xuất đối chiếu, không thay master/addendum.

Phần dưới giữ README của bản QRv1.2 để tra cứu code/cách chạy hiện hữu. Các giới hạn v1.2 không phải quyết định loại bỏ tính năng trong đặc tả V4. Trạng thái thực tế phải xem code/issue và bằng chứng review.

---

# QR Ordering PWA Multi-Tenant — v1.2

Hệ thống gọi món qua mã QR tại bàn dành cho nhà hàng/quán ăn (Multi-tenant), thiết kế Mobile-First theo tài liệu **Phân tích và Đặc tả v1.2**.

---

## 1. Điểm nổi bật & Triết lý v1.2

1. **Không tích hợp thanh toán trực tuyến:**
   - Hệ thống không kết nối cổng thanh toán, không webhook SePay/ngân hàng, không sinh VietQR động.
   - Tiền được xử lý ngoài đời (tiền mặt / chuyển khoản thủ công cho quán).
   - Thao tác **"Xác nhận đã thanh toán & kết thúc phiên"** là xác nhận thủ công của nhân viên, hoàn tất giao dịch và đóng phiên nguyên tử.
2. **Khách quét mã QR bằng camera điện thoại:**
   - Mở trực tiếp Web App qua HTTPS, không yêu cầu cấp quyền camera trong web.
   - Hỗ trợ nhiều thiết bị cùng bàn tham gia phiên đang mở.
3. **Luồng trạng thái món tinh gọn:**
   - `PENDING` (Chờ tiếp nhận) $\rightarrow$ `ACCEPTED` (Đã tiếp nhận) $\rightarrow$ `SERVED` (Đã phục vụ).
   - Hủy món: `CANCELLED` khi hết món/nguyên liệu (có lưu lý do và kiểm tra số lượng).
   - Hỗ trợ phục vụ/hủy một phần theo số lượng (ví dụ: gọi 3, phục vụ 2, hủy 1).
4. **Gọi món nhiều lần trong 1 phiên bàn:**
   - Lần 1, Lần 2, Lần 3... được lưu thành từng order riêng có idempotency key chống trùng.
   - Tổng bill tự động tính toán từ các món đã tiếp nhận/đã phục vụ (`ACCEPTED` hoặc `SERVED`).
   - Món chờ tiếp nhận (`PENDING`) được hiển thị riêng, chưa tính vào tổng.
   - Món đã hủy (`CANCELLED`) tính 0đ.
5. **Xác nhận thanh toán & kết thúc phiên nguyên tử (F10):**
   - Điều kiện bắt buộc: không còn món nào ở trạng thái `PENDING` hoặc `ACCEPTED`.
   - Một transaction duy nhất: Snapshot hóa đơn $\rightarrow$ Bill `CONFIRMED` $\rightarrow$ Session `CLOSED` $\rightarrow$ Thu hồi quyền khách $\rightarrow$ Bàn chuyển sang `Sẵn sàng` (READY).
   - Bản triển khai hiện tại cho phép mở lượt tiếp theo ngay sau khi đóng phiên (khác bước chờ dọn trong SPEC gốc).

---

## 2. Kiến trúc & Công nghệ

- **Mô hình:** Modular Monolith
- **Backend:** Node.js (TypeScript) + Express + Socket.IO + PostgreSQL 16
  - PostgreSQL Partial Unique Indexes (Đảm bảo tối đa 1 phiên OPEN trên bàn tại 1 thời điểm; tối đa 1 yêu cầu CHECKOUT đang mở)
  - Row Locking (`FOR UPDATE`) & Optimistic Locking (`settlement_version`)
  - Chống trùng lặp Idempotency bảng `idempotency_records`
- **Frontend:** React 18 + Vite + Tailwind CSS + Lucide Icons
  - Mobile-first (chuẩn 390px, hỗ trợ 360px - 430px và màn hình lớn)
  - PWA manifest
  - Web Audio API (chuông báo âm thanh đơn mới / yêu cầu hỗ trợ cho nhân viên)
- **Real-time:** Socket.IO phòng theo tenant và session + polling dự phòng 8-15s

---

## 3. Cài đặt & Khởi chạy

### Yêu cầu hệ thống
- Node.js >= 20
- PostgreSQL >= 16

### Bước 1: Cài đặt dependencies
```bash
npm run install:all
```

### Bước 2: Thiết lập cơ sở dữ liệu
Đảm bảo PostgreSQL đang chạy trên cổng 5432, sau đó chạy:
```bash
# Tạo schema và bảng dữ liệu
npm run db:migrate

# Nạp dữ liệu mẫu thử nghiệm (Tenants, nhân viên, bàn, menu)
npm run db:seed
```

### Bước 3: Khởi chạy môi trường phát triển
```bash
# Chạy đồng thời cả Backend (port 4000) và Frontend (port 5173)
npm run dev
```

Hoặc chạy riêng lẻ:
```bash
# Terminal 1: Backend
npm run dev:backend

# Terminal 2: Frontend
npm run dev:frontend
```

---

## 4. Tài khoản & Mã QR thử nghiệm

### Tài khoản nhân viên (Mật khẩu chung: `123456`)
| Vai trò | Email | Quyền hạn |
|---|---|---|
| **Quản lý (Manager)** | `admin@phoco.vn` | Toàn quyền: mở bàn, menu, báo cáo, thanh toán |
| **Phục vụ (Waiter)** | `phucvu@phoco.vn` | Mở bàn, tiếp nhận món, phục vụ, hủy món |
| **Thu ngân (Cashier)** | `thungan@phoco.vn` | Xem tổng bill, xác nhận thanh toán & kết thúc phiên |

Cổng nhân viên truy cập tại: [http://localhost:5173/staff](http://localhost:5173/staff)

### Đường dẫn quét mã QR tại bàn (Dành cho khách)
- **Bàn A01 (Phở Phố Cổ):** [http://localhost:5173/t/qr-phoco-a01](http://localhost:5173/t/qr-phoco-a01)
- **Bàn A02 (Phở Phố Cổ):** [http://localhost:5173/t/qr-phoco-a02](http://localhost:5173/t/qr-phoco-a02)
- **Bàn A03 (Phở Phố Cổ):** [http://localhost:5173/t/qr-phoco-a03](http://localhost:5173/t/qr-phoco-a03)

---

## 5. Chạy Kiểm thử Tự động (Acceptance Tests)

Bộ kiểm thử Vitest hiện có 68 test cho các luồng nghiệm thu chính và hồi quy bảo mật. Mỗi lượt chạy tạo cơ sở dữ liệu PostgreSQL tạm `qr_order_test_*`, không dùng DB ứng dụng để seed/truncate. Tài khoản test cần quyền tạo/xóa DB; có thể cấu hình `TEST_DATABASE_ADMIN_URL`.
```bash
npm test
```

### Các kịch bản được kiểm thử:
- `AT01 & AT02`: Khách xem thực đơn bàn công khai; bàn chưa mở phiên bị từ chối gọi món (`SESSION_NOT_OPEN`).
- `AT03`: Nhân viên mở phiên bàn; mở lặp lại trả về phiên hiện có (Partial Unique Index).
- `AT04 & AT09`: Khách gọi món nhiều lần (Lần 1, 2) với Idempotency Key; chống trùng lặp request.
- `AT05, AT06, AT07`: Tiếp nhận món, phục vụ một phần và hủy một phần do hết nguyên liệu; tính toán chuẩn theo công thức Mục 8.3.
- `AT10`: Khách bấm Yêu cầu thanh toán nhiều lần không bị spam thông báo.
- `AT12`: Chặn xác nhận thanh toán khi còn món chưa giải quyết (`UNRESOLVED_ITEMS`).
- `AT10, AT14, AT18, AT21`: Giao dịch xác nhận thanh toán nguyên tử (F10); thu hồi token khách; bàn chuyển sang sẵn sàng.
- `AT20`: Kết thúc phiên không phát sinh tiền 0đ (F12).

---

## 6. Cấu trúc Thư mục

```text
qr_order/
├── backend/
│   ├── src/
│   │   ├── config/             # Cấu hình biến môi trường
│   │   ├── db/                 # schema.sql, connection pool, migrate, seed
│   │   ├── middleware/         # Xác thực nhân viên & quyền truy cập khách
│   │   ├── modules/
│   │   │   ├── auth/           # Đăng nhập, thông tin tài khoản
│   │   │   ├── guest/          # Thực đơn công khai, đặt món, tổng bill khách
│   │   │   ├── staff/          # Quản lý bàn, phục vụ, hủy món, F10 thanh toán
│   │   │   └── reports/        # Báo cáo tổng tiền xác nhận, món phục vụ
│   │   ├── realtime/           # Socket.IO rooms & event broadcasters
│   │   ├── utils/              # Idempotency, token hashing, crypto
│   │   ├── app.ts              # Express application setup
│   │   ├── server.ts           # HTTP & Socket.IO server entrypoint
│   │   └── tests/              # Acceptance test suite (Vitest)
├── frontend/
│   ├── src/
│   │   ├── api/                # API client helper
│   │   ├── components/         # CartDrawer, QRModal, Navbars
│   │   ├── context/            # AuthContext, GuestContext, NotificationContext
│   │   ├── pages/
│   │   │   ├── guest/          # Landing, Menu, Orders, Bill Summary
│   │   │   └── staff/          # Login, Dashboard, TableDetail, Reports, Menu
│   │   ├── types/              # TypeScript models
│   │   ├── App.tsx             # Main routing & landing selector
│   │   └── main.tsx            # React entrypoint
│   ├── public/manifest.json    # PWA configuration
├── SPEC_v1.2.md                # Tài liệu đặc tả yêu cầu v1.2
└── README.md
```

## Đánh giá luồng và bảo mật ngày 19/10/2026

Xem [báo cáo kiểm tra và các giới hạn còn lại](security-flow-audit.md). Trước khi triển khai bản mới, chạy migration (có migration 003 cho thu hồi token), thay các secret mẫu, cấu hình FRONTEND_URL/CORS_ORIGINS đúng origin thực tế và rà lại quyền được cấp trong memberships. Production sẽ từ chối secret mẫu/khóa ngắn.
