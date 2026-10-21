# Hướng dẫn Thiết lập Web Push VAPID trên Render (Operator Runbook)

Tài liệu hướng dẫn quản trị viên / chủ dự án (@dothuongton) cấu hình biến môi trường Web Push (RFC 8292 VAPID) cho dịch vụ `order-app` trên Render an toàn và đúng quy chuẩn.

---

## 1. Tổng quan & Cơ chế hoạt động

- Hệ thống sử dụng giao thức chuẩn **Web Push (RFC 8292)** để gửi thông báo đẩy tới trình duyệt và thiết bị nhân viên (Apple APNs cho iPhone iOS 16.4+ và Google FCM cho Android/Chrome).
- Khi server chưa cấu hình VAPID (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` trống), backend sẽ tự động tắt module Push một cách an toàn (`isPushEnabled = false`, reason `NOT_CONFIGURED`) mà không gây sập ứng dụng. Giao diện nhân viên sẽ nhận biết và hiển thị trạng thái "Máy chủ chưa kích hoạt" thay vì thông báo lỗi kỹ thuật.

---

## 2. Sinh cặp khóa VAPID (Chạy trên máy tính cá nhân)

Chạy lệnh sau trong terminal của máy tính cá nhân (không chạy trên server công khai):

```bash
npx web-push generate-vapid-keys
```

Kết quả sẽ in ra:
- **Public Key**: Chuỗi base64url dài ~87 ký tự (bắt đầu bằng `B...`).
- **Private Key**: Chuỗi base64url dài ~43 ký tự.

> [!CAUTION]
> **Nguyên tắc an toàn bí mật:**
> - Tuyệt đối **KHÔNG** commit khóa riêng (`VAPID_PRIVATE_KEY`) vào mã nguồn Git.
> - Tuyệt đối **KHÔNG** đưa khóa riêng vào GitHub Issue, Pull Request hoặc tin nhắn chat công khai.
> - Nếu môi trường production **đã có sẵn một cặp khóa VAPID hợp lệ đang hoạt động**, hãy **GIỮ NGUYÊN**, không tự ý sinh lại hoặc rotate để tránh làm mất kết nối của các thiết bị đã đăng ký trước đó.

---

## 3. Khai báo biến môi trường trên Render

1. Đăng nhập vào trang quản trị [Render Dashboard](https://dashboard.render.com).
2. Chọn Web Service `order-app`.
3. Vào tab **Environment**.
4. Thêm hoặc cập nhật 3 biến môi trường sau:

| Tên biến | Giá trị mẫu | Ghi chú |
| :--- | :--- | :--- |
| `VAPID_PUBLIC_KEY` | *(Khóa công khai vừa sinh ở Mục 2)* | Dùng để client trình duyệt khởi tạo subscription. |
| `VAPID_PRIVATE_KEY` | *(Khóa riêng vừa sinh ở Mục 2)* | Dùng để ký JWT VAPID gửi tới Apple APNs / Google FCM. |
| `VAPID_SUBJECT` | `mailto:contact@phoco.vn` | Địa chỉ mailto hoặc URL HTTPS liên hệ hợp lệ theo RFC 8292. |

5. Nhấn **Save Changes** để Render tự động redeploy với cấu hình mới.

---

## 4. Kiểm chứng và nghiệm thu trên thiết bị thật (iPhone / iOS)

Apple quy định điều kiện kích hoạt Web Push trên iOS (WebKit iOS 16.4+):

1. **HTTPS bắt buộc:** Web app phải được truy cập qua giao thức `https://` (domain mặc định của Render hoặc custom domain có chứng chỉ SSL).
2. **Cài đặt vào Màn hình chính (PWA):**
   - Mở Safari trên iPhone, truy cập trang đăng nhập nhân viên (`https://<domain>/staff/login`).
   - Nhấn vào biểu tượng **Chia sẻ (Share ⎋)** ở thanh dưới trình duyệt Safari.
   - Chọn **"Thêm vào Màn hình chính" (Add to Home Screen)**.
3. **Mở ứng dụng từ icon Màn hình chính:**
   - Đăng nhập tài khoản nhân viên.
   - Nhấn vào biểu tượng Chuông hoặc banner **"Bật thông báo Web Push ngay"** (phải xuất phát từ thao tác chạm trực tiếp của người dùng).
   - Chọn **Cho phép** khi iOS hiển thị hộp thoại xin quyền thông báo.
4. **Gửi thông báo thử nghiệm:**
   - Mở bảng cài đặt thông báo (nhấn biểu tượng Chuông ở header).
   - Nhấn **"Gửi thử 1 thông báo tới máy này"**.
   - Máy chủ sẽ gửi push notification tới chính endpoint của thiết bị hiện tại.
   - Khi API trả về thông báo tiếp nhận thành công, khóa màn hình iPhone hoặc chuyển sang ứng dụng khác để xác nhận chuông báo và banner hiển thị trên màn hình khóa.

---

## 5. Xử lý xoay vòng khóa (Key Rotation) & Thu hồi

- **Khi thay đổi cặp khóa VAPID:**
  - Thiết bị nhân viên sẽ tự động so khớp `applicationServerKey` của trình duyệt với `publicKey` mới từ máy chủ.
  - Nếu phát hiện khóa đã thay đổi, giao diện sẽ hiển thị trạng thái `Cần cập nhật khóa` và hướng dẫn nhân viên bấm **"Cập nhật và kết nối lại"** bằng một lần chạm để hủy subscription cũ và đăng ký subscription mới với khóa mới.
- **Tự động dọn dẹp subscription hết hạn:**
  - Khi thiết bị gỡ PWA hoặc hủy quyền thông báo, nhà cung cấp (Apple APNs / Google FCM) sẽ phản hồi mã lỗi `404 Not Found` hoặc `410 Gone`.
  - Hệ thống backend sẽ tự động xóa bản ghi subscription đó khỏi cơ sở dữ liệu để bảo đảm hiệu năng và tính toàn vẹn.
- **Đăng xuất (Logout):**
  - Khi nhân viên nhấn Đăng xuất, ứng dụng sẽ gửi yêu cầu `/staff/push/unsubscribe` tới máy chủ để hủy liên kết thiết bị với tài khoản và cửa hàng hiện tại.
