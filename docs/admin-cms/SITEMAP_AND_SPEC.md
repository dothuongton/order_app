# Đặc Tả Sitemap, Luồng Người Dùng & Giao Diện Super Admin CMS

Tài liệu đặc tả kiến trúc điều hướng, cấu trúc màn hình, các trạng thái giao diện và ma trận phân quyền cho phân hệ Super Admin CMS.

---

## 1. Cấu Trúc Điều Hướng (Sitemap)

Phân hệ Super Admin vận hành tại tiền tố `/admin` với thanh điều hướng tối ưu hóa cho màn hình desktop và tablet:

```
/admin
├── Đăng nhập (AdminLogin) [Do Core sở hữu theo Issue #2]
└── Bảng điều khiển Quản trị (AdminDashboard)
    ├── Tab 1: Bảng Điều Khiển & Chỉ Số (Stats / Overview)
    │   ├── Thẻ chỉ số tổng quan (Tổng quán, Quán hoạt động, Quán tạm dừng, Doanh thu, Tổng đơn)
    │   └── Biểu đồ / Tỷ trọng phân bố trạng thái
    ├── Tab 2: Quản Lý Nhà Hàng (Shops Management)
    │   ├── Thanh công cụ: Tìm kiếm (Search), Bộ lọc trạng thái (Filter: All, Active, Suspended, Draft, Archived)
    │   ├── Nút hành động: "Tạo Quán Mới" (Mở Create Shop Modal)
    │   ├── Danh sách quán: Lưới thẻ (Card Grid) hoặc Bảng dữ liệu (Data Table) kèm phân trang (Pagination)
    │   ├── Modal Chi Tiết Quán (Shop Detail Modal / View)
    │   ├── Modal Chỉnh Sửa Quán (Edit Shop Modal)
    │   └── Hộp thoại Xác Nhận Vòng Đời (Lifecycle Confirmation Dialog)
    ├── Tab 3: Mẫu Giao Diện (Templates Registry)
    │   └── Danh mục template storefront mẫu kèm danh sách khối mặc định
    └── Tab 4: Nhật Ký Kiểm Toán (Audit Logs)
        ├── Bộ lọc theo Quán (Tenant filter) và Hành động (Action filter)
        └── Bảng nhật ký có phân trang (Timestamp, Actor, Action, Target, Details)
```

---

## 2. Đặc Tả Chi Tiết Các Màn Hình & Thành Phần Giao Diện

### 2.1. Thanh Điều Hướng Cố Định (Sticky Header)
- **Logo & Tiêu đề**: "QR Order Platform CMS" kèm nhãn huy hiệu nổi bật `SUPER ADMIN`.
- **Thông tin Người dùng**: Hiển thị họ tên và email của Super Admin đang đăng nhập (lấy từ auth token).
- **Nút Đăng xuất**: Gọi hàm đăng xuất, xóa token lưu trữ an toàn và chuyển hướng về màn hình đăng nhập.
- **Thanh Thông Báo Tác Vụ (Action Alert Banner)**: Hiển thị phản hồi sau mỗi thao tác (thành công hoặc lỗi) với nút đóng nhanh.

### 2.2. Tab 1: Tổng Quan Nền Tảng (Dashboard & Metrics)
Hiển thị 4-6 chỉ số thời gian thực được tổng hợp từ database:
1. **Tổng Số Quán**: Tổng số tenant trên toàn hệ thống kèm số quán đang `active`.
2. **Quán Tạm Dừng / Lưu Trữ**: Số lượng quán đang bị khóa tạo đơn (`suspended`) hoặc lưu trữ (`archived`).
3. **Doanh Thu Đã Chốt**: Tổng số tiền từ các phiên thanh toán đã được xác nhận thu (`manual_settlement_confirmations`), kèm tổng số lượt xác nhận.
4. **Tổng Lượt Đặt Món**: Tổng số đơn món đã được tạo trên toàn hệ thống.

### 2.3. Tab 2: Danh Sách & Quản Lý Nhà Hàng
- **Thanh tìm kiếm & lọc**:
  - Ô tìm kiếm hỗ trợ tra cứu: tên quán, slug URL, email chủ quán (tìm kiếm không phân biệt hoa thường).
  - Dropdown lọc trạng thái: `Tất cả`, `Đang hoạt động (active)`, `Tạm dừng (suspended)`, `Nháp (draft)`, `Đã lưu trữ (archived)`.
  - Phân trang: Điều khiển số trang hiện tại, tổng số trang, chuyển trang Trước / Sau và chọn kích thước trang (20 / 50 quán mỗi trang).
- **Thẻ thông tin Quán**:
  - Tiêu đề: Tên quán, Huy hiệu trạng thái màu sắc phân biệt (`active` xanh lá, `suspended` đỏ, `draft` vàng, `archived` xám).
  - Định danh: Đường dẫn slug dạng `/{slug}`.
  - Thông tin chủ quán: Họ tên, email chủ quán.
  - Cấu hình storefront: Template đang kích hoạt, phiên bản phát hành (`vX`).
  - Quy mô hoạt động: Số lượng bàn, tổng số đơn hàng đã phục vụ.
  - Doanh thu tích lũy: Tổng doanh thu đã xác nhận thanh toán (định dạng tiền tệ VNĐ).
  - Nút thao tác nhanh:
    - Nút Khóa / Mở Khóa quán (kích hoạt Modal xác nhận).
    - Nút Xem chi tiết / Chỉnh sửa.
    - Nút liên kết ngoài mở cổng nhân viên `/staff`.

### 2.4. Modal Khởi Tạo Quán Mới (Create Shop Modal)
- **Mục tiêu**: Tạo đồng thời quán mới, tài khoản chủ quán, giao diện khởi tạo và bàn mặc định trong một transaction duy nhất.
- **Các trường dữ liệu**:
  1. *Tên Quán Ăn* (Bắt buộc, tối đa 200 ký tự). Khi nhập tên quán, hệ thống tự động sinh slug tiếng Việt không dấu (ví dụ: "Cơm Niêu Ba Miền" -> "com-nieu-ba-mien").
  2. *Slug Định Danh URL* (Bắt buộc, tối đa 100 ký tự, định dạng kebab-case `^[a-z0-9]+(?:-[a-z0-9]+)*$`). Người dùng có thể chỉnh sửa thủ công.
  3. *Số Điện Thoại* & *Địa Chỉ* (Tùy chọn).
  4. *Họ Tên Chủ Quán* (Bắt buộc, tối đa 200 ký tự).
  5. *Email Đăng Nhập Chủ Quán* (Bắt buộc, định dạng email chuẩn, tối đa 254 ký tự).
  6. *Mật Khẩu Khởi Tạo* (Bắt buộc, tối thiểu 8 ký tự, tối đa 72 bytes theo giới hạn bcrypt).
- **Cơ chế An toàn**:
  - Client-side validation trước khi submit.
  - Vô hiệu hóa nút submit và hiển thị spinner để chống click kép (double-submit).
  - Giữ nguyên dữ liệu trên form nếu backend trả về lỗi (ví dụ: trùng slug hoặc trùng email).
  - Xóa trắng trường mật khẩu khỏi state ngay sau khi đóng modal hoặc tạo thành công.

### 2.5. Hộp Thoại Xác Nhận Chuyển Đổi Vòng Đời (Lifecycle Confirmation Dialog)
- Để tránh thao tác nhầm lẫn gây gián đoạn kinh doanh của nhà hàng, việc thay đổi trạng thái bắt buộc phải qua hộp thoại xác nhận chuyên biệt (không dùng `window.confirm` đơn thuần):
  - Hiển thị rõ tên quán đang thao tác.
  - Hiển thị trạng thái hiện tại $\rightarrow$ trạng thái dự kiến chuyển đổi.
  - Giải thích rõ hậu quả nghiệp vụ:
    - **Tạm dừng (`suspended`)**: Khách hàng quét QR sẽ không thể mở phiên hoặc gửi đơn mới. Các phiên đang mở của quán vẫn được phép thanh toán chốt tiền. Nhân viên vẫn đăng nhập được để đối soát.
    - **Mở lại (`active`)**: Quán mở lại hoạt động bình thường, mã QR hoạt động trở lại.
    - **Lưu trữ (`archived`)**: Đóng cửa quán vĩnh viễn, toàn bộ dữ liệu lịch sử (hóa đơn, doanh thu) được bảo tồn 100% để đối soát, không bị xóa bỏ.

### 2.6. Tab 3: Danh Mục Giao Diện Mẫu (Templates Registry)
- Hiển thị danh mục các template giao diện storefront dựng sẵn (`classic`, `modern_grid`, v.v.).
- Chi tiết từng template: Tên, định danh ID, mô tả ngắn, danh sách khối nội dung mặc định (`header`, `banners`, `promotions`, `product_grid`, `cart_footer`).

### 2.7. Tab 4: Nhật Ký Kiểm Toán Toàn Sàn (Audit Logs)
- Bảng nhật ký hiển thị các hành động nhạy cảm của Super Admin:
  - Thời gian (định dạng ngày giờ Việt Nam).
  - Tác nhân (Họ tên, email của Super Admin).
  - Hành động (`SUPER_ADMIN_CREATE_SHOP`, `SUPER_ADMIN_UPDATE_SHOP`, `SUPER_ADMIN_STATUS_CHANGE`).
  - Mục tiêu tác động (Tên quán, ID quán).
  - Chi tiết thay đổi (Dữ liệu trước/sau dạng tóm tắt, tự động ẩn các trường nhạy cảm như password/hash).
  - Phân trang để tải dữ liệu mượt mà, không gây chậm hệ thống khi số lượng log lớn.

---

## 3. Đặc Tả Các Trạng Thái Giao Diện (UI States)

Để đảm bảo trải nghiệm người dùng chuyên nghiệp và tin cậy theo chuẩn Karpathy / Clean Code:

| Trạng Thái | Biểu Hiện Giao Diện | Xử Lý Người Dùng |
| :--- | :--- | :--- |
| **Loading** | Skeleton loaders cho danh sách thẻ và bảng, spinner trên nút hành động. Không giật bố cục (FOUC). | Vô hiệu hóa các nút tương tác cho đến khi tải xong. |
| **Empty (Chưa có dữ liệu)** | Hiển thị biểu tượng minh họa kèm thông báo rõ ràng (ví dụ: "Chưa có quán nào trên hệ thống" hoặc "Không tìm thấy quán phù hợp với từ khóa"). | Nút hành động kêu gọi (Call-to-Action) như "Tạo quán đầu tiên" hoặc "Đặt lại bộ lọc". |
| **Error (Lỗi)** | Banner cảnh báo màu đỏ/cam phân biệt rõ: Lỗi mạng kết nối, Lỗi kiểm tra dữ liệu đầu vào (400), Lỗi quyền hạn (403), Lỗi máy chủ (500). | Nút "Thử lại" (Retry) để người dùng tải lại mà không cần F5 toàn trang. |
| **Forbidden (403)** | Thông báo lỗi không đủ thẩm quyền Super Admin. | Nút chuyển hướng về màn hình đăng nhập đúng quyền hạn. |
| **Success (Thành công)** | Banner thông báo màu xanh lá cây, tự ẩn sau 5 giây hoặc đóng thủ công. | Dữ liệu trên bảng tự động được làm mới (re-fetch). |

---

## 4. Bảng Ma Trận Phân Quyền (RBAC Matrix)

| Hành Động / Tài Nguyên | Super Admin (Platform) | Chủ Quán (Owner) | Nhân Viên (Staff) | Khách Hàng (Guest) |
| :--- | :---: | :---: | :---: | :---: |
| **Xem thống kê toàn sàn (Stats)** | ✅ Cho phép | ❌ Chặn | ❌ Chặn | ❌ Chặn |
| **Danh sách toàn bộ Quán (Shops List)** | ✅ Cho phép | ❌ Chặn | ❌ Chặn | ❌ Chặn |
| **Tạo Quán mới + Khởi tạo Owner** | ✅ Cho phép | ❌ Chặn | ❌ Chặn | ❌ Chặn |
| **Đổi trạng thái Quán (`active`/`suspended`/`archived`)** | ✅ Cho phép | ❌ Chặn | ❌ Chặn | ❌ Chặn |
| **Xem Nhật ký kiểm toán Super Admin** | ✅ Cho phép | ❌ Chặn | ❌ Chặn | ❌ Chặn |
| **Chỉnh sửa Menu/Món ăn của Quán** | ❌ Không can thiệp | ✅ Cho phép | ✅ Theo quyền | ❌ Chặn |
| **Xem Báo cáo Doanh thu nội bộ Quán** | ❌ Không can thiệp | ✅ Cho phép | ❌ Theo quyền | ❌ Chặn |
| **Mở phiên gọi món / Đặt món qua QR** | ❌ Không can thiệp | ❌ Không dùng | ❌ Không dùng | ✅ Cho phép |
| **Xác nhận thanh toán đơn của Quán** | ❌ Không can thiệp | ✅ Cho phép | ✅ Cho phép | ❌ Chặn |
