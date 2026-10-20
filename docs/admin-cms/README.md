# Phân Hệ Super Admin CMS (Platform Management)

Tài liệu thiết kế, đặc tả sitemap, API contract và lộ trình triển khai phân hệ Quản trị Nền tảng (Super Admin CMS) cho hệ thống QR Ordering Multi-Tenant.

---

## 1. Bối cảnh và Ranh giới Dự án

- **Issue liên kết**: [#15 [CMS-01] Chốt đặc tả, sitemap và API contract Super Admin quản lý quán](https://github.com/dothuongton/order_app/issues/15)
- **Assignee**: `@SangVuxx`
- **Nhánh triển khai**: `codex/super-admin-cms-sangvuxx` (tạo từ commit `main@1a773f7a428ca8756c9bce3a6e388cdc4ea21312`)
- **Quy tắc sở hữu tệp & Phối hợp**: Tuân thủ nghiêm ngặt theo đặc tả phân công tại [#2](https://github.com/dothuongton/order_app/issues/2) và hợp đồng tích hợp tại [#6](https://github.com/dothuongton/order_app/issues/6).

### Phân định Ranh giới Phân hệ:
1. **Super Admin CMS (Nền tảng - do `@SangVuxx` phụ trách)**:
   - Quản trị toàn sàn: thống kê tổng quan (stats), danh sách nhà hàng (tenants), vòng đời quán (`draft` / `active` / `suspended` / `archived`), khởi tạo quán + tài khoản chủ quán (owner), quản lý kho giao diện mẫu (templates), nhật ký kiểm toán nền tảng (audit logs).
   - Tuyệt đối không can thiệp vào nghiệp vụ bán lẻ trực tiếp: không sửa đơn món, không thu tiền thay quán, không giả lập (impersonation), không tự ý reset mật khẩu tài khoản người dùng khác.
2. **Shop CMS & Staff Portal (do `@dothuongton` / Core phụ trách)**:
   - Thuộc phạm vi `backend/src/modules/cms/**`, `frontend/src/pages/staff/**`, các luồng gọi món `guest`, thanh toán `pricing`, báo cáo bán hàng, cơ chế authentication và database migrations.

---

## 2. Mục tiêu Phân hệ Pha này

Cung cấp công cụ quản trị tập trung, tin cậy và bảo mật cao cho Quản trị viên Nền tảng (Super Admin):
- **Bảng điều khiển (Dashboard)**: Theo dõi sức khỏe nền tảng (số lượng quán theo trạng thái, tổng đơn hàng, doanh thu đã xác nhận thanh toán).
- **Quản lý Nhà hàng (Tenant Management)**:
  - Danh sách phân trang, tìm kiếm theo tên, slug, email chủ quán, lọc theo trạng thái.
  - Xem thông tin chi tiết từng quán (metadata, chủ quán, quy mô bàn, số đơn, doanh thu).
  - Khởi tạo quán mới kèm chủ quán ban đầu theo giao dịch an toàn (transactional), đảm bảo tính duy nhất của slug và email.
  - Cập nhật thông tin quán và điều hướng vòng đời (kích hoạt, tạm dừng, lưu trữ).
- **Kho Giao diện Mẫu (Template Registry)**: Xem danh mục layout chuẩn áp dụng cho storefront của các nhà hàng.
- **Nhật ký Kiểm toán (Audit Logs)**: Ghi vết và đối soát toàn bộ thao tác nhạy cảm của Super Admin trên hệ thống.

---

## 3. Cấu trúc Tài liệu Đặc tả

Hệ thống tài liệu tại `docs/admin-cms/` được chia thành các phần chuyên biệt:

1. [SITEMAP_AND_SPEC.md](./SITEMAP_AND_SPEC.md): Đặc tả sitemap, luồng người dùng (User Flows), các trạng thái giao diện (Loading, Empty, Error, Forbidden) và ma trận phân quyền RBAC.
2. [API_CONTRACT.md](./API_CONTRACT.md): Toàn bộ đặc tả API Contract chi tiết: DTOs, quy tắc validation, phân trang (pagination), định dạng lỗi chuẩn và danh mục mã lỗi.
3. [LIFECYCLE_AND_POLICIES.md](./LIFECYCLE_AND_POLICIES.md): Đặc tả vòng đời nhà hàng (`draft`, `active`, `suspended`, `archived`), ma trận quyền hạn, chính sách bảo toàn ledger (Zero Hard-Delete) và các đề xuất phối hợp với Core ([#6](https://github.com/dothuongton/order_app/issues/6)).
4. [ROADMAP_AND_IMPLEMENTATION.md](./ROADMAP_AND_IMPLEMENTATION.md): Danh sách tệp được phép sửa (allowlist), kế hoạch triển khai theo các issue [#16](https://github.com/dothuongton/order_app/issues/16) → [#19](https://github.com/dothuongton/order_app/issues/19), checklist Karpathy & Clean Code và tiêu chí nghiệm thu Codex Review.

---

## 4. Nguyên tắc Kỹ thuật (Karpathy-Inspired Guidelines)

1. **Think Before Coding**:
   - Xác định rõ giả định, ranh giới và ràng buộc trước khi viết bất kỳ dòng mã nào.
   - Bất kỳ yêu cầu thay đổi schema DB hoặc shared middleware/auth đều phải gửi đề xuất qua [#6](https://github.com/dothuongton/order_app/issues/6), không tự ý sửa đổi ngoài allowlist.
2. **Simplicity First**:
   - Sử dụng giải pháp đơn giản nhất đáp ứng đúng yêu cầu. Giữ nguyên stack công nghệ hiện có (React, Vite, Express, PostgreSQL, TailwindCSS). Không đưa thêm framework hoặc thư viện nặng không cần thiết.
3. **Surgical Changes**:
   - Chỉ chỉnh sửa các tệp trong allowlist được cấp phép. Giữ nguyên định dạng và phong cách mã nguồn hiện có.
4. **Goal-Driven Execution & Verification**:
   - Mọi chức năng API và giao diện đều phải có kiểm thử tự động (Unit / Integration / E2E) chứng minh hoạt động trước khi bàn giao review.
