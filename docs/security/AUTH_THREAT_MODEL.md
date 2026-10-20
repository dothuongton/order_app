# Báo Cáo Phân Tích Threat Model: HttpOnly Cookies, CSP và Tenant Quotas (Issue #22)

## 1. Hiện trạng và Đánh giá Rủi ro (Threat Model)

### 1.1 Cơ chế Xác thực Staff & Admin
- **Hiện tại**:
  - Backend đã hỗ trợ và tự động phát hành đồng thời cả `staff_token` và `admin_token` dưới dạng **HttpOnly, SameSite=Lax, Secure** (trong production) cookies khi người dùng đăng nhập qua `/api/v1/auth/login`.
  - Đồng thời backend trả về Bearer token trong response JSON body để tương thích với các client hoặc SPA hiện tại (`localStorage.getItem('staff_token')`).
  - Khi gửi request tới backend, middleware `authenticateStaff` ưu tiên kiểm tra Header `Authorization: Bearer <token>` trước, sau đó fallback sang `req.cookies.staff_token`.
- **Rủi ro Threat Model**:
  - Nếu token chỉ lưu trong `localStorage`, bất kỳ lỗ hổng XSS nào cũng có thể trích xuất token trực tiếp.
  - Tuy nhiên, chuyển đột ngột sang 100% pure Cookie HttpOnly mà không có kế hoạch chuyển tiếp sẽ làm gián đoạn Socket.IO handshake, PWA standalone mode trên một số trình duyệt, và đặc biệt là giao diện Admin (`AdminDashboard.tsx`) đang được lane Sang phát triển.
- **Kế hoạch chuyển tiếp an toàn (Phối hợp Issue #6 & #19)**:
  1. Giữ cơ chế Dual-Auth: Backend chấp nhận cả HttpOnly cookie lẫn Bearer header.
  2. Middleware `protectOrigin` chặn đứng CSRF từ cross-site origin đối với cookie-authenticated writes.
  3. Sau khi lane Sang hoàn tất SA-05 và bàn giao `AdminDashboard.tsx`, chuyển toàn bộ frontend staff/admin sang ưu tiên cookie HttpOnly có SameSite=Lax và CSRF token header nếu cần.

### 1.2 Content Security Policy (CSP)
- Triển khai header `Content-Security-Policy-Report-Only`:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline'`
  - `style-src 'self' 'unsafe-inline'`
  - `font-src 'self' data:`
  - `img-src 'self' data: blob:`
  - `connect-src 'self' ws: wss:`
  - `frame-ancestors 'none'`
- Đảm bảo không phá vỡ:
  - Khả năng in mã QR (`blob:`, `data:`).
  - Tải âm thanh WebAudio và Service Worker (`sw.js`).
  - Kết nối Realtime WebSocket qua Socket.IO (`ws:`, `wss:`).

### 1.3 Tenant Upload Storage Quotas & Mutation Rate Limits
- **Upload Quota**: Giới hạn tối đa **50MB** dung lượng ảnh tổng cộng cho mỗi tenant trong bảng `uploaded_images`. Khi vượt quá, API trả về HTTP 413 `STORAGE_QUOTA_EXCEEDED` thay vì cho phép lạm dụng bộ nhớ database.
- **Rate Limiting theo Tenant / User**: Thay vì chỉ dùng IP đơn thuần (khiến toàn bộ nhân viên/khách trong quán cùng dùng một mạng Wi-Fi bị block nhầm), rate limiter được định danh theo `userId`/`tenantId` cho nhân viên, và theo `guestToken` cho khách hàng.
