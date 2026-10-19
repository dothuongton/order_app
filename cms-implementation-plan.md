# KẾ HOẠCH TRIỂN KHAI MULTI-TENANT CMS (P0 SCOPE)

**Hệ thống:** QR Ordering PWA Multi-Tenant  
**Phiên bản đặc tả:** ANTIGRAVITY_MULTI_TENANT_CMS_SPEC.md  
**Phạm vi:** Ưu tiên triển khai P0 (Bắt buộc trước khi mở nhiều quán)

---

## 1. Phạm vi Triển khai (P0 Scope)

1. **Database Migration:**
   - Cập nhật bảng `tenants`: thêm `status` (`draft`, `active`, `suspended`, `archived`), `description`, `logo_url`, `cover_url`, `phone`, `address`, `opening_hours`, `theme_config`, `active_template_id`.
   - Tạo bảng `cms_templates`: danh mục mẫu dựng sẵn (Classic, Modern Grid, Compact List, Banner Featured).
   - Tạo bảng `cms_drafts`: lưu cấu hình nháp giao diện và content blocks của từng shop.
   - Tạo bảng `cms_published_versions`: lưu lịch sử các bản xuất bản để hỗ trợ rollback.
   - Tạo bảng `banners`: quản lý banner quảng cáo/sự kiện của từng shop.
   - Tạo bảng `promotions`: quản lý khuyến mãi (giảm % hoặc giảm tiền mặt, điều kiện tối thiểu, giới hạn giảm tối đa, ngân sách lượt dùng, thời gian bắt đầu/kết thúc).
   - Tạo bảng `promotion_redemptions`: theo dõi và khóa lượt dùng khuyến mãi atomic.
   - Cập nhật bảng `order_items`: thêm `discount_amount`, `applied_promotion_id`, `final_price` để snapshot bất biến giá trị ưu đãi.

2. **Backend Services & APIs:**
   - **Super Admin API (`/api/v1/admin/*`):**
     - Đăng nhập Super Admin (`is_platform_admin = true`).
     - Quản lý danh sách shop (lọc, tìm kiếm, tạo mới shop kèm tài khoản owner, sửa thông tin, khóa/mở shop `suspended`).
     - Giám sát toàn hệ thống: tổng số quán, quán hoạt động, tổng đơn và doanh thu *đã xác nhận thanh toán*.
     - Template registry: danh sách template chuẩn cho các shop.
     - Nhật ký kiểm toán Super Admin (`audit_logs`).
   - **Shop CMS API (`/api/v1/cms/*`):**
     - Cấu hình thông tin nhận diện (logo, cover, màu chủ đạo, layout).
     - Quản lý banner (CRUD, bật/tắt, thứ tự).
     - Quản lý khuyến mãi (CRUD, tính toán điều kiện, kích hoạt).
     - Cơ chế Draft / Preview / Publish / Rollback giao diện.
     - Phân quyền nghiêm ngặt theo `tenant_id` từ JWT token.
   - **Pricing Engine & Tenant Guard:**
     - Middleware kiểm tra trạng thái tenant (`status === 'active'`); nếu `suspended` thì chặn tạo đơn mới.
     - Bộ tính giá server-side tại thời điểm đặt món: kiểm tra điều kiện khuyến mãi hợp lệ, chọn ưu đãi tốt nhất (single best deal, không cộng dồn), snapshot chiết khấu vào đơn hàng.
   - **Storefront Client API:**
     - Trả về cấu hình template và theme token đã publish của shop khi khách quét mã QR.

3. **Frontend UI Components:**
   - **Super Admin Portal (`/admin`):**
     - Màn hình đăng nhập & dashboard tổng quan nền tảng.
     - Quản lý danh sách shop: tạo mới, sửa metadata, cấu hình owner, khóa/mở shop.
     - Quản lý templates và xem audit log nền tảng.
   - **Shop Admin CMS Module (`/staff/cms` hoặc tích hợp trong thanh điều hướng Staff):**
     - Tab Nhận diện & Giao diện: chọn màu, logo, ảnh bìa, template, thứ tự block.
     - Mobile Live Preview: màn hình giả lập điện thoại xem trước giao diện trước khi publish.
     - Nút Lưu Nháp (Save Draft), Xuất Bản (Publish) và Rollback phiên bản cũ.
     - Tab Quản lý Banner: danh sách banner, thêm/sửa, xem trước.
     - Tab Khuyến mãi: danh sách mã ưu đãi, thiết lập %, hạn mức, thời gian hiệu lực.
   - **Storefront Khách hàng (`/t/:qrId`):**
     - Đọc theme tokens và template đã publish của shop.
     - Hiển thị banner carousel, logo, màu chủ đạo, nhãn khuyến mãi trên món ăn.
     - Hiển thị chiết khấu minh bạch trên giỏ hàng và hóa đơn tạm tính.

4. **Automated Tests:**
   - Kiểm thử bảo mật cô lập đa quán (Cross-tenant isolation & IDOR prevention).
   - Kiểm thử phân quyền Super Admin vs Shop Owner vs Staff.
   - Kiểm thử bộ tính giá và khuyến mãi (giảm %, giảm tiền, không âm, chọn ưu đãi cao nhất, không cộng dồn).
   - Kiểm thử cơ chế Draft / Publish / Rollback giao diện.
   - Kiểm thử chặn đơn khi quán bị tạm dừng (`suspended`).

---

## 2. Kế hoạch File Thay đổi & Bổ sung

### Backend:
- `backend/src/db/migrations/002_cms_multitenant.sql`: Migration tạo các bảng CMS và cập nhật `tenants`, `order_items`.
- `backend/src/db/seed.ts`: Bổ sung tài khoản Super Admin mẫu (`superadmin@qrorder.vn` / `admin123`), template mẫu, banner và khuyến mãi mẫu.
- `backend/src/modules/admin/admin.routes.ts`: Định tuyến Super Admin.
- `backend/src/modules/admin/admin.service.ts`: Nghiệp vụ quản lý shop, template, thống kê platform.
- `backend/src/modules/cms/cms.routes.ts`: Định tuyến Shop CMS.
- `backend/src/modules/cms/cms.service.ts`: Nghiệp vụ lưu draft, publish, banner, promotion.
- `backend/src/modules/pricing/pricing.service.ts`: Pricing engine tính giá và chiết khấu an toàn.
- `backend/src/modules/guest/guest.service.ts`: Tích hợp Pricing engine và áp dụng theme publish.
- `backend/src/middleware/auth.ts`: Bổ sung `authenticateSuperAdmin` và `checkTenantStatus`.
- `backend/src/app.ts`: Đăng ký router `/api/v1/admin` và `/api/v1/cms`.

### Frontend:
- `frontend/src/types/cms.ts`: Định nghĩa types cho templates, theme tokens, drafts, banners, promotions.
- `frontend/src/pages/admin/AdminLogin.tsx`: Đăng nhập Super Admin.
- `frontend/src/pages/admin/AdminDashboard.tsx`: Bảng điều khiển Super Admin quản lý shop, template, số liệu.
- `frontend/src/pages/staff/StaffCmsManage.tsx`: Giao diện CMS của Quản lý shop (Giao diện, Preview, Banner, Khuyến mãi).
- `frontend/src/components/cms/MobilePreviewModal.tsx`: Giả lập xem trước giao diện mobile.
- `frontend/src/pages/guest/GuestMenu.tsx`: Cập nhật render theme tokens, banners và khuyến mãi.
- `frontend/src/App.tsx`: Định tuyến `/admin` và `/staff/cms`.

---

## 3. Quản lý Rủi ro & Chiến lược Rollback

1. **Rủi ro gián đoạn luồng đặt món hiện có:**
   - Khuyến mãi và theme CMS là tùy chọn. Nếu shop chưa cấu hình CMS hoặc không có khuyến mãi, hệ thống tự động fallback về theme mặc định và tính nguyên giá như hiện tại.
2. **Rủi ro xung đột dữ liệu cũ:**
   - Cột mới trong `tenants` và `order_items` đều có giá trị mặc định (`DEFAULT 'active'`, `DEFAULT 0`), đảm bảo 100% tương thích ngược với dữ liệu cũ.
3. **Chiến lược Rollback Database:**
   - Cung cấp file rollback script `backend/src/db/migrations/002_cms_multitenant_down.sql` để có thể đảo ngược migration bất kỳ lúc nào mà không mất dữ liệu các bảng cốt lõi.
