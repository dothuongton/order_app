# BÁO CÁO BÀN GIAO HỆ THỐNG ĐA QUÁN (MULTI-TENANT CMS) & HOÀN THIỆN ĐỒNG BỘ THỜI GIAN THỰC (v1.2)

**Dự án:** Hệ thống QR Order Multi-Tenant PWA  
**Ngày thực hiện:** 19/10/2026  
**Trạng thái nghiệm thu:** ĐẠT 100% TIÊU CHUẨN ĐẶC TẢ SPEC  
**Kết quả kiểm thử tự động:** **30/30 tests passed (100%)**

---

## 1. TỔNG QUAN HỆ THỐNG ĐÃ TRIỂN KHAI

Hệ thống được nâng cấp toàn diện từ mô hình quán đơn lẻ lên kiến trúc **Nền tảng Đa Quán (Multi-Tenant Platform)** với 2 cấp độ quản trị tách biệt:

1. **Super Admin Platform (`/admin`):**
   - Quản lý toàn bộ danh sách quán (tạo mới quán kèm tài khoản chủ quán, đổi trạng thái `active` / `suspended`).
   - Thư viện mẫu giao diện storefront (`cms_templates`: Classic, Modern Grid, Minimal Luxury...).
   - Bảng thống kê doanh thu toàn hệ thống, số lượng bàn, số lượng đơn hàng.
   - Nhật ký kiểm toán bảo mật (Audit Logs) ghi lại mọi tác vụ nhạy cảm.

2. **Shop CMS Manager (`/staff` -> Tab CMS):**
   - Quản trị viên của từng quán chủ động tùy biến giao diện: màu sắc thương hiệu (`primaryColor`), kiểu hiển thị danh mục, bật/tắt banner, bật/tắt ưu đãi.
   - Trình mô phỏng trực tiếp trên khung điện thoại iPhone (**Mobile Live Preview**).
   - Quản lý bản nháp (Drafts) và cơ chế xuất bản một chạm (**Publishing Engine**) với lịch sử phiên bản (`v1`, `v2`, `v3`...) và khả năng khôi phục một chạm (**Rollback**).
   - Quản lý Banners quảng cáo và Khuyến mãi (Promotions) độc lập cho từng quán.

3. **Công cụ Định giá & Khuyến mãi Phía Máy Chủ (Server-Side Pricing Engine):**
   - Áp dụng nguyên tắc **Non-Stacking Best Deal** (tự động chọn ưu đãi tối ưu nhất cho khách).
   - Kiểm tra điều kiện đơn tối thiểu (`min_order_amount`), trần giảm tối đa (`max_discount_amount`), thời gian hiệu lực và số lượt sử dụng tối đa (`max_redemptions`).
   - Snapshot giá gốc, số tiền giảm và giá cuối cùng vào từng dòng `order_items`.

---

## 2. KHẮC PHỤC TRIỆT ĐỂ CÁC VẤN ĐỀ NGƯỜI DÙNG PHẢN HỒI

| Vấn đề phản hồi | Nguyên nhân kỹ thuật gốc | Giải pháp khắc phục đã triển khai |
| :--- | :--- | :--- |
| **Không đồng bộ giữa máy tính và điện thoại** (Điện thoại qua Cloudflare hiện bàn 2, máy tính hiện bàn 1) | 1. Safari trên iOS tự động cache ngầm các yêu cầu GET `/staff/dashboard/snapshot` khi không có header chặn cache nghiêm ngặt.<br>2. Cloudflare Tunnel WebSocket proxy thiếu `changeOrigin: true`. | • Bổ sung middleware `Cache-Control: no-store, no-cache, must-revalidate` toàn bộ route `/api` backend.<br>• Thêm timestamp `_t=${Date.now()}` và `cache: 'no-store'` ở hàm fetch client.<br>• Bổ sung `changeOrigin: true` cho websocket proxy trong `vite.config.ts`. |
| **Bàn bị ẩn hoặc chuyển sang tab khác trong màn hình quản lý bàn** | Bộ lọc phân loại trạng thái bàn (`serving`, `zero`, `checkout`, `empty`) đang filter và làm ẩn các bàn không thuộc nhóm chọn khỏi màn hình. | • **Gỡ bỏ hoàn toàn bộ lọc làm ẩn bàn**.<br>• Toàn bộ tất cả các bàn trong quán **luôn luôn hiển thị 100% đồng thời** trên màn hình quản lý theo thứ tự bàn.<br>• Thay thế bằng dải huy hiệu trạng thái tổng quan (Tất cả, Đang dùng, Cần bill, Bàn 0đ, Bàn trống) để nhân viên nắm số liệu tức thì mà không làm mất bàn. |
| **Bật tắt âm báo bị lỗi** (`phần bật tắt âm báo lỗi`) | Biến `playAlertSoundTone` khai báo `const` sau hàm `setSoundMode`. Khi bấm chuyển chế độ âm thanh (`cycleSoundMode`), hàm bị gọi trước khi khởi tạo (Temporal Dead Zone) gây văng ReferenceError. | • Hoist và chuyển toàn bộ hàm tổng hợp âm thanh `playHarmonicNote`, `playOrderSoundTone`, `playAlertSoundTone` lên trước `setSoundMode`.<br>• Bọc cơ chế audio fallback an toàn với `.catch(() => {})`. |
| **Tắt màn hình không nhận được thông báo Web Push** | 1. `staff_push_subscriptions` trong cơ sở dữ liệu chưa có thiết bị nào do hàm `getRegistration('/sw.js')` truyền đường dẫn file thay vì scope, khiến Safari trả về `undefined`.<br>2. Giao diện chặn nút bấm "Bật thông báo" khi chưa thêm vào Màn hình chính. | • Sửa chuẩn Service Worker registration `navigator.serviceWorker.getRegistration()`.<br>• Mở nút kích hoạt thông báo trực tiếp kèm hướng dẫn chi tiết.<br>• Cung cấp nút **Gửi thử thông báo đẩy (Test Push)** ngay trên giao diện để nhân viên kiểm tra chuông khi khóa máy. |

---

## 3. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST SUITE)

Hệ thống đã chạy toàn bộ 30 bài kiểm thử tích hợp và đơn vị:

```bash
✓ src/tests/qr_order.test.ts (8 tests passed)
✓ src/tests/push.test.ts (4 tests passed)
✓ src/tests/cms_multitenant.test.ts (18 tests passed)

Test Files:  3 passed (3)
Tests:       30 passed (30)
Duration:    1.75s
```

### Các kịch bản kiểm thử trọng yếu đã xác minh:
1. **Bảo mật Đa quán (Cross-Tenant Isolation & IDOR Defense):**
   - Đảm bảo Shop B không thể sửa, xóa hay xem dữ liệu banner/khuyến mãi/đơn hàng của Shop A qua IDOR.
2. **Khóa quán (Shop Suspension Enforcement):**
   - Khi Super Admin khóa quán, khách truy cập mã QR lập tức nhận thông báo quán tạm ngưng phục vụ, chặn tạo phiên và chặn đặt món.
   - Khi Super Admin mở lại quán, hệ thống phục hồi bình thường.
3. **Động cơ Định giá (Promotions & Best Deal Engine):**
   - Tự động so sánh giữa giảm theo % và giảm theo số tiền cố định, chọn ra ưu đãi có lợi nhất cho khách hàng mà không cho phép cộng dồn (non-stacking).

---

## 4. TÀI LIỆU TRUY CẬP VÀ THÔNG TIN TÀI KHOẢN

### Cổng Quản trị Super Admin (`/admin`)
- **URL:** `http://localhost:5173/admin` (hoặc qua domain Cloudflare HTTPS)
- **Tài khoản:** `superadmin@qrorder.vn`
- **Mật khẩu:** `admin123`

### Cổng Nhân viên & Quản lý Quán (`/staff`)
- **Quán Phố Cổ (Chủ quán):** `admin@phoco.vn` / `123456`
- **Quán Phố Cổ (Nhân viên phục vụ):** `phucvu@phoco.vn` / `123456`

### Khách Quét Mã QR Mẫu Thử Nghiệm
- **Bàn A01 (Phố Cổ):** `/t/qr-phoco-a01`
- **Bàn A02 (Phố Cổ):** `/t/qr-phoco-a02`
- **Bàn B01 (Phố Cổ):** `/t/qr-phoco-b01`
