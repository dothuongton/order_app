# Đối soát bản sửa đổi R2 của báo cáo Admin Muse

Ngày20/10/2026. Main hiện vẫn là `aceb9066b6819e28232517bcc402d0390d80fff5`. Bản R2 được so sánh với báo cáo đầu và bằng chứng Codex trên cùng SHA; không chạy lại kiểm thử hoặc đăng nhập production chỉ vì tài liệu đổi. Không thay code, credential, dữ liệu hay cấu hình repository.

## Những điểm R2 đã hiệu chỉnh đúng

- Ghi rõ clone cũ1a773f7 và baseline mớiaceb906.
- A-02 ghi nhận reset mật khẩu khi boot đã được sửa, không yêu cầu đưa lại task đã hoàn tất.
- A-05/A-06/C-5/C-10 thừa nhận API có phân trang, giới hạn100 và bộ lọc quán/action.
- B-04 xác định metrics lồng ởAPI nhưng drawer đọc field phẳng, khớp probe Codex5bàn/drawer0.
- B-05 xác định role data và thao tác lưu chỉ có ở frontend, không có persistence API.
- B-09 chỉ ra default password trong form; ghi nhận lifecycle có confirmation modal.

## Các kết luận cần tiếp tục hiệu chỉnh hoặc xác minh

1. A-01/A-02: credential mẫu xuất hiện trong source/UI là đúng; Codex chưa xác minh lại password hiện hành có đăng nhập được trên deploymentaceb906. Không coi dòng code là bằng chứng tài khoản vẫn dùng credential đó hoặc hệ thống đã bị xâm nhập. Việc đổi credential/revoke cần quy trình core#37/#38, không tự UPDATE password trực tiếp hoặc gửi secret qua chat/log.
2. A-06: route handler trả500 generic và app middleware còn chuẩn hóa response>=500. Chưa có request thực qua cả middleware chứng minh rawmessage lọt ra. Giữ regression trong#19; nếu muốn xác nhận lỗi phải có URL/case/status/body đãredact, không mở issue lộ lỗi mới chỉ từ grep err.message.
3. A-05: dataset29log không có admin events không chứng minh writer không tồn tại. Main có writer create/updateadmin; probe local actorEmail có, actorId thiếuSELECT. Các phần cần sửa đã ở#83/#84. Phân biệt userId/userName/userEmail và legacy/null; không bịa audit quá khứ.
4. B-03/C-5: ShopListTable đã có pagination, ẩn khi totalPages<=1. Cần fixture nhiều trang, không kết luận thiếuUI từ dataset2quán.
5. B-09: default chỉ thành password cho tài khoản mới khi người tạo không sửa. Với email đã tồn tại, hash cũ vẫn được giữ và password input bị bỏ qua; issue#82 cần explicit link/new semantics. Không khẳng định mọi quán/tài khoản đều dùng cùng password.
6. Lifecycle: main có guard OPEN trước archive, nhưng count/update chưa được kiểm chứng nguyên tử với openSession; API400/code kháccontract409. Đã nằm trong#16/#6/#19, không thêm issue trùng và không bấm thử trênquánđangchạy.

## Backlog giữ nguyên

Epic#80 và issue#81–#84 vẫn đầy đủ. #16–#19 mở lại cho hậu kiểm; #36/#18 là ưu tiên trướcgoLive; #37/#38 identity/recovery; #41QR; #46/#47/#48 các phần mở rộng theo contract. Không tạo issue mới trong lượt này, không đổi quyền sở hữu.

Core đang làm#57/PR78 phải được giữ nguyên; AdminLogin/auth/schema/shared làcore, admin namespace doSang. Mỗi lane mộtissue/tệp tại mộtthờiđiểm. Sang làm#18→#17→#81→#82→#84 theo dependency; generatorQR chờcore#41bàn giao qua#6. CIxanh không thay nghiệmthuCodex. Không tự merge/deploy, resetcredential hoặc sửa dữ liệu production.

SHA256 nguồn R2: `708e30ba9e0920da7218de3e875e9dceefc18c4e92bf8c9535179c81c1efad51`. Bản đầu và đánh giá ban đầu được giữ nguyên để truy vết.
