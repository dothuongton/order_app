# Báo cáo UI & Responsive — QR Order app

**Đối tượng:** https://order-app-ddho.onrender.com (repo `dothuongton/order_app`, v1.2) — cổng khách `/t/:qrId` và cổng nhân viên `/staff`.
**Ngày kiểm tra:** 2026-10-20 · **Phạm vi:** giao diện (UI), tính đáp ứng (responsive) trên điện thoại, tablet, desktop và màn hình máy POS. Không bao gồm khu vực super admin.
**Tài liệu liên quan:** `order_app_ux_review_for_codex.md` (Phần 4 chứa các issue R-01 → R-06 rút ra từ báo cáo này, sẵn sàng để tạo issue).

## 1. Phương pháp và giới hạn

- Kiểm tra trực tiếp trên hệ thống đang chạy bằng tài khoản mẫu (quản lý) và trang khách tại bàn "Bàn AKA Vip" (qr-phoco-a01), kết hợp đọc mã nguồn giao diện để xác định cơ chế layout.
- **Giới hạn phải ghi rõ:** môi trường kiểm tra không thay đổi được kích thước viewport theo ý muốn. Các quan sát trực tiếp được thực hiện ở cửa sổ desktop màn hình rộng; nhận định cho các kích thước 390×844 (điện thoại), 768×1024 (tablet) và 1366×768 (POS ngang) là **suy luận từ kiến trúc layout đã quan sát trực tiếp + bằng chứng trong code**. Kết luận về cấu trúc (app khóa cứng bề rộng cột) là chắc chắn vì giới hạn nằm trực tiếp trong mã nguồn. Kiểm chứng thị giác trên từng thiết bị thật được khuyến nghị thực hiện lại trong vòng pilot (mục 6).

## 2. Bằng chứng từ mã nguồn (quyết định toàn bộ hành vi responsive)

| Thành phần | Class giới hạn | Bề rộng tối đa |
|---|---|---|
| Cổng nhân viên (toàn bộ dashboard + thanh điều hướng dưới) | `max-w-lg mx-auto` trong `frontend/src/pages/staff/StaffDashboard.tsx` (dòng 409 và 1327) | ~512px |
| Cổng khách (trang bàn + thanh điều hướng + thanh giỏ nổi) | `max-w-md mx-auto` trong `frontend/src/pages/guest/GuestLanding.tsx` (dòng 102, 182, 204) | ~448px |

Hệ quả: **không có breakpoint nào mở rộng layout theo màn hình**. Một số lưới phụ có `sm/md/lg:grid-cols` (tab Bàn 2 cột, vài lưới ở báo cáo/quản lý món) nhưng khung chính của cả hai cổng không bao giờ vượt quá bề rộng điện thoại.

## 3. Kết quả phía quán (cổng nhân viên)

### 3.1 Desktop (quan sát trực tiếp, 1440–1920px)
- Cột nội dung ~540px, chiếm **~28–30%** bề rộng màn hình, căn giữa; mỗi bên ~35% là nền xám trống.
- Tab Bàn: lưới 2 cột, thấy đủ 5 bàn không cần cuộn — phần duy nhất tận dụng được chút chiều ngang.
- Tab Đơn món: **luôn 1 cột**, thấy ~6 thẻ món mỗi màn hình. Màn hình rộng không giúp giảm cuộn chút nào.
- Header (~55px) + banner cam Web Push (~50px, không có nút đóng) ≈ 105–115px. Ở chiều cao 900px chiếm ~12–13%, chấp nhận được; vấn đề nằm ở màn hình thấp (mục 3.2).
- Kích thước chạm: nút hành động chính 44–48px (đạt chuẩn); nút QR ~36px; chip lọc ~30–32px; nút sửa/xóa món ~32–36px; chữ "Hoàn tất" trong thẻ đơn là link text ~20px (dưới chuẩn rõ rệt cho màn cảm ứng).
- Không cuộn ngang, không chồng lấn, không vỡ layout. Thiết kế thị giác: hiện đại, sạch, màu sắc nhất quán, phân cấp chữ tốt.

### 3.2 Màn hình POS ngang 1366×768 (suy luận từ kiến trúc — layout giống hệt desktop)
- Cột vẫn ~540px (~40% bề rộng), hai bên trống ~31% mỗi bên: **~60% bề rộng màn POS bị lãng phí**.
- Chiều dọc bị ăn mòn đáng kể: header + banner ≈ 105–115px (**~14–15%**), thanh điều hướng dưới ~65px (~8%) → vùng nội dung thực còn **~590px**, thấy ~5–6 thẻ món — kết hợp với tab Đơn món 1 cột, đây là cấu hình gây cuộn nhiều nhất trong các thiết bị nhân viên dùng.
- Nhận định: dùng được nhưng không đạt kỳ vọng của một giao diện POS — trông như điện thoại đặt giữa màn hình lớn.

### 3.3 Tablet dọc 768×1024 (suy luận)
- Cột chiếm ~70% bề rộng, lề mỗi bên ~15% — cân đối, không vấn đề. Header + banner ~10–11% chiều cao. Đây là kích thước "ít thiệt" nhất đối với thiết kế hiện tại.

### 3.4 Điện thoại 390×844 (suy luận)
- Cột vượt viewport nên hiển thị toàn bề rộng — đúng thiết kế gốc mobile-first; dự kiến là kích thước hiển thị tốt nhất (tab Bàn lưới 2 cột vừa vặn, Đơn món 1 cột, thanh điều hướng 6 mục vừa đủ).

## 4. Kết quả phía khách

### 4.1 Desktop (quan sát trực tiếp ~1920px)
- Cột ~500px chiếm **~27%** bề rộng; thanh điều hướng dưới và bảng tùy chọn (bottom sheet) đều thẳng cột, không lệch. Không vỡ layout.
- Nút "+" trên thẻ món ~44–48px đạt chuẩn chạm; giá 15–16px in đậm, tên món ~17px — dễ đọc; chữ mô tả ~13px hơi nhỏ.

### 4.2 Điện thoại (390×844 và 360×640) (suy luận, riêng 360 một phần từ đo hero)
- Khối đầu trang (header + banner carousel + thẻ khuyến mãi + hàng danh mục) cao **~475px**. Ở màn 844px: thấy ~2–3 thẻ món trước khi cuộn. Ở màn 640px: hero ăn **~60% chiều cao**, chỉ ~1 thẻ món — khách phải cuộn ngay mới thấy món ăn, trong khi banner chứa nội dung quảng cáo test.
- Bottom sheet tùy chọn ở màn thấp gần như phủ kín chiều cao; cần kiểm chứng lại cuộn nội bộ khi món có nhiều nhóm tùy chọn (chưa kiểm chứng được).

### 4.3 Lỗi hiển thị phát hiện thêm
- Thẻ món **"Phở Bò Tái Nạm" không hiển thị giá** trong cả hai vòng kiểm tra phía khách — chưa xác định được do dữ liệu thiếu giá hay lỗi render. Giá là thông tin bắt buộc trên thẻ món; cần rà soát.

## 5. Đánh giá tổng thể

| Tiêu chí | Phía khách | Phía quán |
|---|---|---|
| Ổn định layout (không vỡ/cuộn ngang) | Tốt | Tốt |
| Điện thoại | Đạt (thiết kế gốc), trừ hero quá cao ở màn thấp | Đạt |
| Tablet | Đạt | Đạt |
| Desktop | Dùng được, cột hẹp (chấp nhận vì khách chủ yếu dùng điện thoại) | **Kém** — lãng phí ~70% bề rộng |
| Màn POS ngang | Không áp dụng (khách không dùng POS) | **Kém** — lãng phí ~60% bề rộng, mất ~23% chiều dọc cho header/banner/nav |
| Chuẩn chạm (≥44px) | Đạt ở nút chính | Một số control 20–36px, dưới chuẩn |
| Chất lượng thị giác | Sạch, hiện đại, nhất quán | Sạch, hiện đại, nhất quán |

**Kết luận:** App được thiết kế mobile-first đúng nghĩa và làm tốt trong biên điện thoại. Vấn đề không nằm ở chất lượng thị giác mà ở **việc thiếu hoàn toàn một tầng layout cho màn hình lớn ở phía quán** — đúng đối tượng thiết bị (máy POS) mà một hệ thống order tại bàn sẽ chạy hằng ngày. Đây cũng là một nửa nguyên nhân kỹ thuật của nhận xét "quản lý đơn dài ngoàng": diện tích ngang của POS không được dùng, mọi nội dung bị dồn xuống chiều dọc.

## 6. Khuyến nghị (đã chuyển thành issue R-01 → R-06 trong tài liệu Codex)

1. **R-01 (P0):** Xây layout rộng cho cổng quán từ breakpoint ≥1024px (Đơn món đa cột/2 khung, Bàn lưới 3–4 cột, điều hướng bên trái); phía khách giữ mobile-first.
2. **R-02 (P0):** Cho ẩn banner Web Push sau khi xử lý; header gọn trên viewport thấp.
3. **R-03 (P1):** Nâng mọi mục tiêu chạm ở cổng quán lên tối thiểu 40px.
4. **R-04 (P1):** Thu gọn hero trang khách trên màn thấp; sửa lỗi thẻ món mất giá.
5. **R-05 (P2):** Giữ nguyên hành vi ở 390/768 khi thêm layout rộng; kiểm tra hồi quy ở 3 ngưỡng.
6. **R-06 (P0 vận hành):** Kiểm chứng lại trên thiết bị thật khi pilot: điện thoại Android 360–390px, iPhone, tablet, và **máy POS ngang 1366×768 cảm ứng** bằng thao tác ngón tay thật.

*Báo cáo được lập từ kiểm tra trực tiếp trên hệ thống đang chạy và mã nguồn, ngày 2026-10-20. Các mục ghi "suy luận" chưa được kiểm chứng thị giác ở đúng kích thước thiết bị — xem mục 1.*
