# QR Order — Đánh giá UI/UX toàn bộ (Guest + Staff) để Codex review & tạo issue

**Phạm vi:** toàn bộ trải nghiệm phía KHÁCH (guest quét QR) và phía QUÁN (staff: quản lý, phục vụ, thu ngân). **Không bao gồm khu vực super admin** — chủ hệ thống đang tự triển khai phần đó.
**Nguồn bằng chứng:** kiểm tra trực tiếp trên hệ thống đang chạy https://order-app-ddho.onrender.com ngày 2026-10-20 (3 vòng: khách khi bàn đóng, staff 3 vai trò, khách khi bàn mở) + đọc code `frontend/src/pages/staff/StaffDashboard.tsx`, `StaffMenuManage.tsx`, `frontend/src/types/index.ts`.
**Mục tiêu của chủ hệ thống:** người dùng ở **bất kỳ vai trò nào cũng tiện lợi nhất có thể**. Chủ hệ thống đã nêu đích danh: phần quản lý đơn món "cồng kềnh, hiển thị dài ngoàng, khó sử dụng".
**Cách dùng tài liệu:** mỗi mục có mã (G-xx = guest, S-xx = staff) được viết để chuyển thẳng thành 1 issue: Tiêu đề → Vấn đề (kèm bằng chứng đo được) → Yêu cầu → Giải pháp đề xuất → Tiêu chí nghiệm thu → Độ ưu tiên → Tầng xử lý.
**Quy ước ưu tiên:** P0 = phải xong trước pilot quán thật · P1 = nên làm trong giai đoạn pilot · P2 = cải tiến sau.

---

# PHẦN 1 — PHÍA KHÁCH (GUEST)

Hiện trạng tổng quan đã kiểm chứng: hành trình chuẩn chạy được đầu-cuối (menu → tùy chọn → giỏ → gửi đơn → theo dõi → gọi nhân viên), đường đi thuận tốn **10 lần chạm** từ quét QR đến gửi đơn xong. Giao diện hoàn toàn tiếng Việt, giá luôn hiển thị, trạng thái món hết hàng rõ ràng, bảng tùy chọn cập nhật giá theo thời gian thực (nút CTA hiện đúng tổng tiền × số lượng), phản hồi gọi nhân viên có 3 lớp (modal → toast → banner cố định). Các vấn đề dưới đây là ma sát cụ thể đã quan sát.

## G-01 · Chạm vào thẻ món không mở được gì ("chạm chết") — cả hai trạng thái bàn
- **Bằng chứng:** Khi bàn mở: chạm tên/ảnh món chỉ highlight viền cam, chỉ nút "+" nhỏ mới mở bảng tùy chọn. Khi bàn đóng: chạm món 3 lần không có bất kỳ phản hồi nào — khách tưởng app bị treo.
- **Yêu cầu:** Mọi thao tác chạm của khách phải có phản hồi có nghĩa; không tồn tại vùng chạm "chết" trên thẻ món.
- **Giải pháp:** (a) Toàn bộ thẻ món là vùng chạm mở bảng tùy chọn. (b) Khi phiên chưa mở, chạm vào món hiện toast/bottom-sheet giải thích "Bàn chưa được mở — vui lòng gọi nhân viên để mở bàn" kèm nút gọi nhân viên (xem G-02).
- **Nghiệm thu:** Chạm bất kỳ điểm nào trên thẻ món đều mở sheet hoặc hiện thông báo; không còn thao tác nào không phản hồi.
- **Ưu tiên/Tầng:** P0 · Frontend.

## G-02 · Banner "liên hệ nhân viên" nhưng không có cách liên hệ
- **Bằng chứng:** Khi bàn đóng, banner cam ghi "Quý khách vui lòng liên hệ nhân viên để mở bàn" nhưng toàn app không có nút gọi nhân viên ở trạng thái này (đã rà cả 3 tab), không số điện thoại, không hướng dẫn khác.
- **Yêu cầu:** Mọi hướng dẫn hiển thị cho khách phải đi kèm hành động thực hiện được ngay tại chỗ.
- **Giải pháp:** Đặt nút "Gọi nhân viên" ngay trong banner trạng thái đóng (dùng lại cơ chế service request hiện có; nếu backend chưa cho phép gọi khi phiên đóng thì cho phép tạo yêu cầu gắn với bàn), hoặc hiển thị số điện thoại quán từ cấu hình quán.
- **Nghiệm thu:** Khách ở bàn đóng gọi được nhân viên trong tối đa 2 chạm từ màn hình đầu tiên.
- **Ưu tiên/Tầng:** P0 · Frontend (+ Backend nếu cần nới điều kiện tạo service request).

## G-03 · Mâu thuẫn trạng thái hiển thị giữa header và tab Tổng bill
- **Bằng chứng:** Cùng một thời điểm: header báo "Chưa mở phiên" trong khi tab Tổng bill báo phiên "Đã kết thúc" + "Phiên bàn đã thanh toán hoàn tất" — dữ liệu phiên cũ chưa được dọn/không phân biệt được với trạng thái hiện tại của bàn.
- **Yêu cầu:** Một bàn tại một thời điểm chỉ có đúng một trạng thái hiển thị thống nhất ở mọi màn hình khách.
- **Giải pháp:** Trang khách chỉ hiển thị dữ liệu của phiên hiện tại của bàn; nếu không có phiên mở thì tab Bill hiện trạng thái trống tương ứng ("Bàn chưa mở phiên"), không hiển thị bill của phiên đã đóng như thể là hiện tại. Rà soát API public: response menu/session không trả lẫn dữ liệu phiên cũ.
- **Nghiệm thu:** Mở trang khách ở bàn chưa mở: mọi tab nhất quán "chưa mở phiên"; sau khi đóng phiên, khách quét lại không thấy bill của lượt khách trước.
- **Ưu tiên/Tầng:** P0 · Frontend + Backend (kiểm tra nguồn dữ liệu).

## G-04 · Văn bản trạng thái trống không theo ngữ cảnh
- **Bằng chứng:** Tab "Đơn đã gọi" khi bàn đóng vẫn hướng dẫn "Hãy chọn các món trong mục Thực đơn và nhấn gửi để nhân viên tiếp nhận" — hành động không thể thực hiện ở trạng thái đó.
- **Yêu cầu:** Mọi empty-state phải khớp trạng thái phiên hiện tại.
- **Giải pháp:** Empty-state động theo trạng thái: bàn đóng → "Bàn chưa mở, nhân viên sẽ mở bàn cho quý khách"; bàn mở chưa gọi → hướng dẫn chọn món như hiện tại.
- **Nghiệm thu:** Kiểm tra empty-state ở cả 2 trạng thái, nội dung không mâu thuẫn nhau.
- **Ưu tiên/Tầng:** P1 · Frontend.

## G-05 · Menu khách không có tìm kiếm
- **Bằng chứng:** Trang menu chỉ có chip danh mục (4 nhóm); quán demo 8 món thì ổn, nhưng menu thật vài chục món sẽ buộc khách cuộn mò. (Phía staff đã có tìm kiếm lọc tức thì — phía khách thì không.)
- **Yêu cầu:** Khách tìm được món theo tên trong tối đa vài ký tự gõ.
- **Giải pháp:** Thêm ô tìm kiếm dính (sticky) trên đầu trang menu khách, lọc theo tên món không dấu (gõ "pho" ra "Phở"), giữ nguyên chip danh mục.
- **Nghiệm thu:** Gõ tên món → danh sách lọc tức thì; xóa từ khóa → về toàn bộ menu.
- **Ưu tiên/Tầng:** P1 · Frontend.

## G-06 · Nhãn nhóm tùy chọn gây hiểu nhầm chế độ chọn
- **Bằng chứng:** Nhóm "TOPPING" gắn badge "Tùy chọn" nhưng hành vi là chọn-1 ("Chọn 1"): chọn "Nha đam" thì "Xôi" bị bỏ chọn. Khách hiểu "tùy chọn" là chọn được nhiều.
- **Yêu cầu:** Nhãn nhóm tùy chọn phải phản ánh đúng hành vi chọn (một/nhiều, bắt buộc/không).
- **Giải pháp:** Chuẩn hóa nhãn từ dữ liệu nhóm: "Bắt buộc · Chọn 1", "Không bắt buộc · Chọn 1", "Chọn nhiều tối đa N". Nếu nghiệp vụ muốn topping chọn nhiều, phải sửa cả model chọn ở frontend (và kiểm tra backend có nhận nhiều giá trị không).
- **Nghiệm thu:** Mọi nhóm tùy chọn hiển thị đúng chế độ chọn; chọn thử khớp với nhãn.
- **Ưu tiên/Tầng:** P1 · Frontend (Backend nếu đổi model chọn nhiều).

## G-07 · Món không có tùy chọn vẫn bắt qua 2 chạm mới thêm được
- **Bằng chứng:** Đồ uống đơn giản (Trà Đào Cam Sả 35.000đ): bấm "+" vẫn mở bottom sheet rồi phải bấm "Thêm vào đơn" — tổng 2 chạm/món đơn giản.
- **Yêu cầu:** Món không có nhóm tùy chọn bắt buộc phải thêm nhanh được bằng 1 chạm.
- **Giải pháp:** Nút "+" trên thẻ món không-tùy-chọn cộng trực tiếp 1 phần vào giỏ + phản hồi nhỏ (rung số lượng trên thanh giỏ / toast có nút Hoàn tác). Sheet chỉ mở khi món có tùy chọn cần chọn, hoặc khi khách chạm vào thân thẻ để chỉnh số lượng/ghi chú.
- **Nghiệm thu:** Thêm món đơn giản = 1 chạm; món có tùy chọn bắt buộc vẫn buộc mở sheet.
- **Ưu tiên/Tầng:** P1 · Frontend.

## G-08 · Trong giỏ không sửa được tùy chọn đã chọn
- **Bằng chứng:** Dòng giỏ hiển thị chip "L, Nha đam" ở chế độ chỉ đọc; muốn đổi size/topping phải xóa dòng và thêm lại từ đầu, mất cả ghi chú + số lượng.
- **Yêu cầu:** Khách sửa được tùy chọn/số lượng/ghi chú của dòng giỏ mà không mất dữ liệu đã nhập.
- **Giải pháp:** Bấm vào dòng giỏ mở lại bottom sheet với trạng thái đã chọn (size, topping, số lượng, ghi chú) để chỉnh; nút chính đổi thành "Cập nhật". Thêm nhất quán affordance xóa: hiện tại ở số lượng 1 nút "−" biến thành icon thùng rác, ở >1 là "−" — thống nhất một hành vi.
- **Nghiệm thu:** Sửa topping trong giỏ xong, dòng giỏ cập nhật đúng, giữ nguyên ghi chú/số lượng.
- **Ưu tiên/Tầng:** P1 · Frontend.

## G-09 · Nút gửi đơn đếm sai đơn vị
- **Bằng chứng:** CTA giỏ ghi "Gửi yêu cầu gọi món (2 món) • 169.000đ" trong khi giỏ có 2 dòng nhưng tổng 3 phần (2 cơm gà + 1 trà đào).
- **Yêu cầu:** Số hiển thị trên CTA phải là tổng số phần, khớp cách khách đếm món.
- **Giải pháp:** Tính tổng quantity của các dòng; nhãn "(3 phần)".
- **Nghiệm thu:** Giỏ nhiều dòng/số lượng khác nhau → CTA hiện đúng tổng phần và tổng tiền.
- **Ưu tiên/Tầng:** P2 · Frontend.

## G-10 · Sau khi gửi đơn không có xác nhận rõ ràng
- **Bằng chứng:** Gửi thành công chỉ có toast với tiêu đề lạc ngữ cảnh "Cập nhật món ăn"; sheet giỏ vẫn mở, trống, với dòng "Chưa có món nào được chọn cho lần này" — khách dễ tưởng đơn bị mất; không có hướng dẫn bước tiếp theo (chờ bếp tiếp nhận ở đâu).
- **Yêu cầu:** Sau gửi đơn, khách phải chắc chắn đơn đã được ghi nhận và biết xem tiến độ ở đâu.
- **Giải pháp:** Đổi toast đúng ngữ cảnh "Đã gửi đơn". Sau gửi: đóng sheet giỏ và hiện màn hình/thẻ xác nhận trong tab Đơn đã gọi ("Đã gửi Lượt 1 — bếp đang tiếp nhận") hoặc tự chuyển khách sang tab Đơn đã gọi với lượt mới được highlight.
- **Nghiệm thu:** Gửi đơn xong, trong 1 màn hình khách thấy xác nhận + mã lượt + nơi theo dõi trạng thái.
- **Ưu tiên/Tầng:** P0 · Frontend.

## G-11 · Tổng bill hiển thị "0đ" lớn khi đang có món chờ tiếp nhận
- **Bằng chứng:** Tab Tổng bill in lớn "Tổng thanh toán 0đ" trong khi 169.000đ đang ở trạng thái chờ tiếp nhận (logic đúng: chỉ tính món đã tiếp nhận/phục vụ — nhưng cách hiển thị gây hiểu nhầm bill bị mất).
- **Yêu cầu:** Con số nổi bật nhất trên bill phải là số tiền khách thực tế dự kiến phải trả.
- **Giải pháp:** Hiển thị "Tổng tạm tính: 169.000đ" (gồm cả phần chờ) làm số chính; phần "đã xác nhận" để số phụ kèm chú thích. Giữ nguyên logic tính tiền ở backend.
- **Nghiệm thu:** Có món chờ → bill hiện tổng tạm tính đúng; không còn số 0đ nổi bật gây hiểu nhầm.
- **Ưu tiên/Tầng:** P0 · Frontend.

## G-12 · Diễn đạt khuyến mãi trong giỏ gây hiểu nhầm; mã ưu đãi không có chỗ áp dụng
- **Bằng chứng:** Gợi ý trong giỏ: "Thêm 31.000đ vào tổng bill để nhận ưu đãi 'Chào 20-10'" — nhưng ngưỡng 200.000đ tính trên tổng *lần gọi mới*, không phải tổng bill. Mã "XINHDEP" hiện ở banner landing nhưng khách không thấy bước nhập/áp mã ở đâu.
- **Yêu cầu:** Mọi câu chữ về tiền/ưu đãi phải đúng cơ sở tính; ưu đãi hiển thị cho khách phải áp dụng được hoặc tự áp dụng minh bạch.
- **Giải pháp:** Sửa câu chữ theo đúng cơ sở tính ("Thêm 31.000đ cho lần gọi này..."). Nếu khuyến mãi là tự động: ghi rõ "sẽ tự áp dụng khi đủ điều kiện" và thể hiện ở bill; nếu cần nhập mã: thêm ô nhập mã trong giỏ.
- **Nghiệm thu:** Đọc câu gợi ý và đối chiếu số liệu tính thực tế khớp nhau; khách biết rõ cách nhận ưu đãi.
- **Ưu tiên/Tầng:** P1 · Frontend (+ Backend tùy cơ chế khuyến mãi chốt).

## G-13 · Nút "Gọi nhân viên" không chống gọi trùng từ phía khách
- **Bằng chứng:** Sau khi gọi thành công, nút vẫn bấm tiếp được, không cooldown, không hiển thị trạng thái "đã gọi lúc…". Luồng gọi tốn 2 chạm (mở modal + xác nhận) nhưng lại không khóa sau khi gọi.
- **Yêu cầu:** Một yêu cầu hỗ trợ đang mở thì khách không tạo thêm được yêu cầu trùng; khách thấy trạng thái yêu cầu của mình.
- **Giải pháp:** Sau khi gọi: nút chuyển trạng thái "Đã gọi nhân viên lúc HH:MM — đang chờ" và vô hiệu cho tới khi nhân viên tiếp nhận/hoàn tất (trạng thái lấy từ service request hiện có của phiên). Giữ modal nhập lời nhắn nhưng cho phép gửi nhanh không lời nhắn bằng 1 chạm giữ/ngắn tùy thiết kế.
- **Nghiệm thu:** Bấm gọi 3 lần liên tiếp chỉ tạo 1 yêu cầu; nút hiển thị trạng thái chờ đến khi được xử lý.
- **Ưu tiên/Tầng:** P1 · Frontend (+ Backend xác nhận dedup theo phiên/loại — phía staff đã có đếm "Nhắc N lần", cần khớp hành vi).

## G-14 · Tab "Đơn đã gọi" phải làm mới thủ công; thiếu tổng tiền lượt
- **Bằng chứng:** Có nút "Làm mới" và trạng thái chỉ cập nhật khi bấm; mỗi lượt gọi không hiển thị tổng tiền của lượt, chỉ có trạng thái từng món.
- **Yêu cầu:** Tiến độ phục vụ phải tự cập nhật (hệ thống đã có Socket.io realtime cho staff — khách cũng phải được hưởng); mỗi lượt có tổng tiền.
- **Giải pháp:** Đăng ký sự kiện realtime cho phiên khách (đã có kênh socket + guest token) để cập nhật trạng thái món; thêm dòng tổng tiền theo lượt.
- **Nghiệm thu:** Staff duyệt món → màn hình khách tự đổi trạng thái không cần thao tác; mỗi thẻ lượt có tổng tiền đúng.
- **Ưu tiên/Tầng:** P1 · Frontend + Backend (mở sự kiện cho room guest nếu chưa có).

## G-15 · Chất lượng dữ liệu hiển thị (ảnh món, banner, chính tả)
- **Bằng chứng:** Ảnh "Cơm Gà Xối Mỡ" là ly sinh tố dâu; món khác dùng icon 🍲 tạm; banner quảng cáo chứa nội dung test ("Shiper", "ố là la", logo Pinduoduo/Meituan/Douyin); lỗi thiếu dấu cách: "Đơn từ200.000đ", "tạiĐà Lạt Phố".
- **Yêu cầu:** Dữ liệu demo/seed dùng cho pilot phải là dữ liệu sạch, đúng món, đúng chính tả.
- **Giải pháp:** Thay bộ ảnh món đúng món (hoặc ảnh mặc định trung tính theo danh mục), xóa banner test khỏi dữ liệu mẫu, rà soát toàn bộ chuỗi hiển thị phía khách. Đây là việc dữ liệu + quy trình duyệt nội dung CMS trước pilot, không phải lỗi code.
- **Nghiệm thu:** Lướt toàn bộ menu + banner của quán pilot: không còn ảnh sai món, nội dung test, lỗi chính tả trong các chuỗi đã liệt kê.
- **Ưu tiên/Tầng:** P0 (trước pilot) · Dữ liệu/CMS.

## G-16 · Tải lần đầu 30–60 giây (cold start) — ghi nhận hạ tầng
- **Bằng chứng:** Cả 3 vòng kiểm tra đều gặp màn hình "Đang tải thực đơn bàn..." 30–60s ở lần tải đầu (backend free tier ngủ). Không phải bug code, nhưng là ấn tượng đầu tiên của khách thật.
- **Yêu cầu:** Khách quét QR lần đầu không chờ quá vài giây để thấy menu.
- **Giải pháp (ngoài code):** Nâng gói hosting/không để backend ngủ trong giờ mở quán, hoặc cơ chế keep-warm; đồng thời frontend nên có skeleton + dòng trạng thái thân thiện thay vì spinner trần. Quyết định thuộc vận hành/chi phí — Codex chỉ cần ghi nhận, không tự thay đổi hạ tầng.
- **Ưu tiên/Tầng:** P0 (vận hành) · Hạ tầng + Frontend (skeleton).

---

# PHẦN 2 — PHÍA QUÁN (STAFF)

Hiện trạng tổng quan đã kiểm chứng: quản lý có 6 tab (Bàn, Đơn món, Hỗ trợ, Báo cáo, Món, Thiết lập). Tab **Bàn** làm tốt (tìm kiếm theo số bàn, chip lọc có đếm, thẻ bàn có trạng thái + nút đúng việc; mở bàn 1 chạm). Tab **Hỗ trợ** ổn (nhóm theo bàn, badge số lần nhắc/gọi, ghi chú khách rõ, nút Tiếp nhận/Hoàn tất rõ). Tab **Món** có tìm kiếm lọc tức thì; sửa giá 3 chạm; bật/tắt hết món 1 chạm có toast. Hộp thoại chốt tiền của thu ngân rõ ràng (chi tiết theo lần gọi, tạm tính, giảm giá, tổng, 1 nút xác nhận lớn). Vấn đề tập trung ở tab Đơn món và vài điểm phân quyền hiển thị.

## S-01 · Món đã hoàn tất nằm TRÊN món đang chờ trong chế độ xem mặc định — nguyên nhân chính gây "dài ngoàng"
- **Bằng chứng:** Tab Đơn món, filter mặc định "Tất cả": nhóm "Bàn A02 — 10 món đã hoàn tất" hiển thị trên nhóm "Bàn A03 — 6 món chờ nhận". Nhân viên phải cuộn qua ~10 thẻ hoàn tất mới tới việc cần làm.
- **Yêu cầu:** Màn hình xử lý đơn mặc định chỉ chứa việc CHƯA xong; việc đã xong không được chặn đường tới việc chưa xong.
- **Giải pháp:** Sắp xếp nhóm/món theo mức ưu tiên xử lý (chờ nhận → đang phục vụ → hoàn tất sau cùng) hoặc mặc định mở ở filter "Chờ nhận". Kết hợp S-02.
- **Nghiệm thu:** Mở tab Đơn món ở ca có cả món chờ và món xong: món chờ nhận thấy ngay không cần cuộn.
- **Ưu tiên/Tầng:** P0 · Frontend.

## S-02 · Món hoàn tất/hủy không thu gọn, giữ nguyên thẻ đầy đủ
- **Bằng chứng:** Món SERVED/hủy giữ card đầy đủ (kèm hàng nút) trong danh sách "Tất cả"; càng cuối ca danh sách càng dài — 1 bàn 6 món ≈ 700–800px cuộn (đo từ cấu trúc card 3 hàng trong `StaffDashboard.tsx` dòng 847+).
- **Yêu cầu:** Món đã kết thúc vòng đời chỉ chiếm 1 dòng tóm tắt, mở rộng khi cần xem.
- **Giải pháp:** Khu vực "Hoàn tất" thu gọn mặc định thành dòng "N món đã hoàn tất ▲" theo bàn; bấm mới mở rộng xem chi tiết.
- **Nghiệm thu:** Sau khi phục vụ xong, món biến mất khỏi danh sách việc chính và xuất hiện trong mục Hoàn tất thu gọn.
- **Ưu tiên/Tầng:** P0 · Frontend.

## S-03 · Thẻ món quá cao, mật độ hiển thị thấp
- **Bằng chứng:** Mỗi món là 1 card 3 hàng (tên + chip variant + pill trạng thái / ghi chú / hàng nút 40px + đường kẻ); chỉ ~5–6 món vừa một màn hình điện thoại. Pill trạng thái lặp lại trên từng món dù màu nền card đã phân biệt trạng thái.
- **Yêu cầu:** Tăng mật độ hiển thị mà vẫn giữ nút chạm ≥40px cho tay ướt/môi trường bếp.
- **Giải pháp:** Hàng món compact 1 dòng: `[2x] Cơm gà (đùi) [📌 ghi chú] — nút hành động chính`. Bỏ pill trạng thái khi màu hàng đã mã hóa trạng thái; ghi chú thành badge 📌, chạm để mở rộng. Giữ nút hành động ≥40px.
- **Nghiệm thu:** Một màn hình điện thoại hiển thị được 12–15 hàng món; thao tác nhận/phục vụ vẫn 1 chạm/hàng.
- **Ưu tiên/Tầng:** P1 · Frontend.

## S-04 · Tên trạng thái không nhất quán
- **Bằng chứng:** Chip lọc ghi "Phục vụ", badge trên món ghi "Cần phục vụ" và "Đã phục vụ" — cùng một khái niệm ba cách gọi; vòng đời đủ là 3 chạm (Nhận món → Đã phục vụ → Hoàn tất) với tên gọi dễ nhầm.
- **Yêu cầu:** Một trạng thái — một tên duy nhất trên toàn app staff (và khớp với tên khách thấy: "Chờ tiếp nhận").
- **Giải pháp:** Chuẩn hóa từ điển trạng thái hiển thị: PENDING="Chờ nhận", ACCEPTED="Đang phục vụ" (hoặc "Cần phục vụ" — chốt 1), SERVED="Đã phục vụ"; áp dụng đồng nhất cho chip lọc, badge, nút bấm, phía khách.
- **Nghiệm thu:** Grep giao diện không còn biến thể tên trạng thái trùng nghĩa.
- **Ưu tiên/Tầng:** P1 · Frontend.

## S-05 · Lỗi đếm số liệu bất nhất trong tab Đơn món (lỗi đúng-sai, không chỉ UX)
- **Bằng chứng (đo trực tiếp):** Chip lọc: "Chờ nhận 6" + "Phục vụ 0" + "Hoàn tất 11" = 17, nhưng chip "Tất cả" ghi 18. Header nhóm A02 ghi "10 món đã hoàn tất" trong khi chip Hoàn tất ghi 11. Chân nhóm A03 ghi "7 món • Lượt gọi #7" nhưng header nhóm ghi "6 món chờ nhận".
- **Yêu cầu:** Mọi con số đếm hiển thị phải nhất quán với nhau và với dữ liệu nguồn tại cùng thời điểm.
- **Giải pháp:** Codex rà soát nguồn tính: đếm từ cùng một tập dữ liệu đã lọc tại client hay các endpoint khác nhau (dashboard snapshot vs activeItems); thống nhất một nguồn đếm duy nhất cho header/chip/footer; cộng test đối chiếu tổng.
- **Nghiệm thu:** Tại mọi thời điểm kiểm tra: tổng các chip trạng thái = chip Tất cả; số header nhóm = số món thực trong nhóm; có test tự động cho quan hệ này.
- **Ưu tiên/Tầng:** P0 · Frontend (Backend nếu nguồn đếm nằm ở API).

## S-06 · Tab Đơn món không có tìm kiếm/lọc theo bàn nhanh
- **Bằng chứng:** Chỉ có lọc theo trạng thái; quán đông nhiều bàn không có cách nhảy nhanh tới một bàn/món cụ thể ngoài cuộn.
- **Yêu cầu:** Nhân viên định vị được một bàn hoặc một món trong tối đa vài giây.
- **Giải pháp:** Thêm ô tìm kiếm (theo số bàn/tên món) tương tự tab Món; hoặc hàng chip bàn đang hoạt động để nhảy tới nhóm bàn.
- **Nghiệm thu:** Tìm "A03" → chỉ còn nhóm bàn A03; tìm tên món → chỉ còn các hàng chứa món đó.
- **Ưu tiên/Tầng:** P1 · Frontend.

## S-07 · Danh sách render lại chậm sau thao tác
- **Bằng chứng:** Sau khi bấm Nhận món/Đã phục vụ, danh sách mất vài giây mới cập nhật (hiển thị trạng thái cũ trong lúc chờ fetch lại).
- **Yêu cầu:** Thao tác xử lý món phải phản hồi tức thì trên giao diện.
- **Giải pháp:** Optimistic update cho các thao tác đổi trạng thái món (cập nhật local ngay, rollback khi API lỗi kèm toast), thay vì chờ fetch toàn bộ dashboard.
- **Nghiệm thu:** Bấm Nhận món → hàng đổi trạng thái <300ms trên mạng quán bình thường; lỗi mạng → rollback + thông báo.
- **Ưu tiên/Tầng:** P1 · Frontend.

## S-08 · Thiếu chế độ xem "Theo món" cho bếp/giờ cao điểm (tính năng mới theo pattern KDS)
- **Bằng chứng:** Danh sách nhóm theo BÀN; bếp muốn biết tổng số "Cơm gà" cần nấu phải tự quét qua nhiều thẻ bàn. Các hệ KDS chuẩn (Toast, Lavu, Flipdish) đều có gộp món (item consolidation).
- **Yêu cầu:** Có chế độ xem gộp các món cùng tên + variant đang chờ/đang làm trên toàn quán, kèm thao tác nhận hàng loạt theo món.
- **Giải pháp:** Toggle "Theo bàn / Theo món" ở tab Đơn món. Chế độ Theo món: một hàng "3x Cơm gà (đùi) — Bàn 1, 4, 7", chạm để mở chi tiết từng bàn, nút "Nhận tất cả Cơm gà". Dữ liệu `TableActiveItem` hiện có (name, variantName, quantity, status, table) đủ để gom ở frontend.
- **Nghiệm thu:** 20 món lẻ từ nhiều bàn rút xuống số hàng bằng số loại món; nhận tất cả 1 loại món = 1 chạm và cập nhật đúng từng bàn.
- **Ưu tiên/Tầng:** P1 · Frontend.

## S-09 · Bộ lọc mặc định chưa theo vai trò
- **Bằng chứng:** Mọi vai trò mở tab Đơn món đều vào filter "Tất cả"; bếp phải tự lọc "Chờ nhận", phục vụ tự lọc phần cần phục vụ mỗi lần mở app.
- **Yêu cầu:** Mỗi vai trò mở app là thấy đúng hàng việc của mình trước.
- **Giải pháp:** Mặc định filter theo permission: vai trò bếp/bar → "Chờ nhận"; phục vụ → "Cần phục vụ"; quản lý → "Tất cả" (hoặc hàng chờ xử lý gộp). Người dùng đổi filter thì ghi nhớ lựa chọn theo thiết bị.
- **Nghiệm thu:** Đăng nhập từng vai trò, mở tab Đơn món: filter mặc định đúng vai trò.
- **Ưu tiên/Tầng:** P2 · Frontend.

## S-10 · Chưa có mã hóa thời gian chờ (aging) cho món chờ
- **Bằng chứng:** Món chờ lâu và món vừa vào trông giống hệt nhau; không có tín hiệu ưu tiên bằng mắt. **Đã verify trong code:** kiểu `TableActiveItem` (`frontend/src/types/index.ts:178`) hiện **không có trường thời gian tạo**, nên frontend không tự tính được thời gian chờ.
- **Yêu cầu:** Nhân viên nhận ra ngay món nào đang chờ quá lâu bằng màu sắc.
- **Giải pháp:** Backend bổ sung `created_at` cho từng active item trong response dashboard; frontend tô viền/hàng theo ngưỡng cấu hình (vd xanh <5 phút, vàng 5–8, đỏ >8 phút). Trong lúc chờ backend, tạm sắp xếp món chờ theo số lượt gọi tăng dần.
- **Nghiệm thu:** Món chờ quá ngưỡng đổi màu đúng; ngưỡng chỉnh được theo cấu hình quán.
- **Ưu tiên/Tầng:** P1 · Backend (nhỏ) + Frontend.

## S-11 · Phục vụ thấy các nút không thuộc vai trò của mình ở màn Bàn
- **Bằng chứng:** Vai trò phục vụ (3 tab: Bàn, Đơn món, Hỗ trợ — cắt tab đúng) nhưng màn Bàn gần như y hệt quản lý: vẫn có "+ Thêm bàn", "Thanh toán", "Tắt", "Mở bàn", xem QR. Nếu backend chặn thì đây là lỗi hiển thị gây nhầm; nếu backend không chặn thì là lỗi phân quyền.
- **Yêu cầu:** Người dùng chỉ thấy hành động mình được phép thực hiện; hành động bị khóa (nếu buộc phải hiển thị) phải kèm lý do.
- **Giải pháp:** Ẩn hoàn toàn nút theo permission ở frontend (đồng bộ với permission backend đã có: `hasPermission(...)`); Codex đồng thời xác minh backend từ chối các hành động này với token phục vụ (test phân quyền 2 chiều).
- **Nghiệm thu:** Token phục vụ gọi trực tiếp API thêm bàn/chốt tiền → bị từ chối; giao diện phục vụ không còn các nút đó.
- **Ưu tiên/Tầng:** P0 · Frontend + Backend (xác minh).

## S-12 · Nút bị khóa không giải thích lý do (thu ngân — "Mở bàn")
- **Bằng chứng:** Thu ngân mở màn Bàn: nút "+ Mở bàn" trên bàn trống bị disable (mờ) không kèm chú thích — người dùng không phân biệt được thiếu quyền hay lỗi.
- **Yêu cầu:** Mọi control bị vô hiệu phải cho biết lý do khi chạm/hỏi.
- **Giải pháp:** Bấm vào nút disabled hiện tooltip/toast "Chỉ quản lý/phục vụ được mở bàn" (theo đúng permission thực tế); hoặc ẩn hẳn theo S-11 nếu nhất quán chính sách ẩn.
- **Nghiệm thu:** Mọi nút disabled trong app staff đều có giải thích truy cập được.
- **Ưu tiên/Tầng:** P2 · Frontend.

## S-13 · Nhập giá món: validation báo sau, không hướng dẫn trước
- **Bằng chứng:** Ô giá bắt buộc là bội số của 1.000; nhập 65.001 → lỗi "Vui lòng nhập giá trị hợp lệ. Hai giá trị hợp lệ gần nhất là 65000 và 66000." Chỉ biết quy tắc sau khi nhập sai.
- **Yêu cầu:** Quy tắc nhập liệu phải hiển thị trước khi nhập.
- **Giải pháp:** Helper text dưới ô giá: "Giá là bội số của 1.000đ"; cân nhắc bỏ ràng buộc bội số nếu không có lý do nghiệp vụ (Codex ghi nhận thành câu hỏi mở cho chủ hệ thống).
- **Nghiệm thu:** Mở form sửa món thấy ngay quy tắc giá; nhập sai vẫn có thông báo như hiện tại.
- **Ưu tiên/Tầng:** P2 · Frontend.

## S-14 · Cài đặt âm thanh/thông báo nằm rải rác; banner Web Push chiếm diện tích thường trực
- **Bằng chứng:** Công tắc âm thanh (giọng nói tiếng Việt), trạng thái thông báo đẩy, nút "Nghe thử âm báo mẫu" nằm ở header toàn cục; banner cam "Nhấn để Bật Web Push…" + nút "BẬT NGAY" chiếm diện tích dọc trên mọi màn hình và không thấy cơ chế tắt hẳn sau khi đã xử lý. Tab "Thiết lập" thực chất là CMS giao diện (logo/banner/khuyến mãi) — tên tab gây hiểu nhầm là cài đặt hệ thống. Không thấy mục quản lý tài khoản nhân viên trong cổng staff (có thể thuộc super admin — ngoài phạm vi review này, chỉ ghi nhận).
- **Yêu cầu:** Cài đặt phải tìm được ở nơi người dùng mong đợi; cảnh báo đã xử lý không chiếm diện tích thường trực.
- **Giải pháp:** Gom cài đặt âm thanh/thông báo vào tab Thiết lập (đổi tên tab thành "Thiết lập & Giao diện" hoặc tách mục "Âm thanh & Thông báo"); banner Web Push chỉ hiện khi chưa bật và cho phép ẩn sau khi đã nhắc (trạng thái lưu theo thiết bị/tài khoản — liên quan spec refresh token/settings đã bàn riêng).
- **Nghiệm thu:** Tìm được công tắc âm thanh trong tối đa 2 chạm từ tab Thiết lập; banner không còn hiện sau khi đã bật push hoặc đã chọn ẩn.
- **Ưu tiên/Tầng:** P1 · Frontend.

## S-15 · Tab Hỗ trợ — giữ nguyên các điểm tốt, bổ sung trạng thái xử lý theo thời gian thực
- **Bằng chứng (điểm tốt cần giữ):** Yêu cầu nhóm theo bàn, badge "Nhắc 7 lần"/"Gọi 7 lần", ghi chú khách hiển thị rõ (📌), nút "Tiếp nhận"/"Đã hỗ trợ xong" phân biệt, tab có chấm cam khi có yêu cầu mới. Chưa kiểm chứng được âm thanh cảnh báo thực tế khi yêu cầu mới đến (không có yêu cầu mới phát sinh trong lúc kiểm tra phía staff; phía khách gọi thử thì yêu cầu được ghi nhận).
- **Yêu cầu:** Khi khách gọi, nhân viên đang mở app phải nhận biết ngay (âm thanh + badge) và thấy ai đã tiếp nhận.
- **Giải pháp:** Giữ nguyên cấu trúc hiện tại; bảo đảm sự kiện socket của service request phát TTS/chuông theo cấu hình (đã có công tắc giọng nói), hiển thị tên người đã tiếp nhận + thời gian chờ trên thẻ yêu cầu (theo model vòng đời OPEN → ACKNOWLEDGED → RESOLVED của spec).
- **Nghiệm thu:** Khách gọi từ bàn → thiết bị staff phát âm thanh + badge trong vài giây; tiếp nhận xong, các thiết bị khác thấy người phụ trách.
- **Ưu tiên/Tầng:** P1 · Frontend + Backend (xác minh sự kiện realtime đã đủ).

---

# PHẦN 3 — NGUYÊN TẮC CHUNG KHI TRIỂN KHAI

1. **Không phá các điểm đã tốt:** tab Bàn (tìm kiếm + chip đếm + thẻ trạng thái), nút hành động ≥40px, nút gộp "Nhận tất cả/Phục vụ tất cả" theo bàn, tìm kiếm ở tab Món, toggle hết món 1 chạm, hộp thoại chốt tiền của thu ngân, bảng tùy chọn khách cập nhật giá realtime, phản hồi 3 lớp khi gọi nhân viên.
2. **Thứ tự thực hiện đề xuất:** (1) S-05 sửa lỗi đếm + G-03 thống nhất trạng thái (đúng-sai trước), (2) S-01 + S-02 (hết dài ngoàng), (3) G-01 + G-02 + G-10 + G-11 (hết hoang mang phía khách), (4) S-11 xác minh phân quyền, (5) các mục P1, (6) P2.
3. **Mọi thay đổi phía khách phải kiểm tra ở cả hai trạng thái bàn (mở/đóng)** — phần lớn lỗi phía khách chỉ lộ ở trạng thái đóng.
4. **Giới hạn phạm vi:** không đụng khu vực super admin; không đổi API hiện có trừ S-10 (thêm `created_at`) và các điểm ghi rõ "+ Backend (xác minh)".
5. **Câu hỏi mở cho chủ hệ thống (Codex không tự quyết):** (a) ràng buộc giá bội số 1.000 còn cần không (S-13); (b) TOPPING được chọn nhiều hay chọn 1 là ý đồ nghiệp vụ (G-06); (c) quản lý tài khoản nhân viên đặt ở cổng staff hay super admin (S-14).

## Phụ lục — Dữ liệu test đã tạo trong lúc kiểm tra (để đối chiếu, không phải lỗi)
- Giá Cơm Gà Xối Mỡ đổi thử 65.000đ → 66.000đ rồi **trả về 65.000đ**; trạng thái Hết/Còn món bật tắt thử rồi **trả về Còn món**.
- 1 món của Bàn A03 đã chuyển Chờ nhận → Đã phục vụ (không hoàn tác được, để nguyên).
- 1 đơn khách thật trên Bàn AKA Vip: 2x Cơm Gà Xối Mỡ (L, Nha đam, ghi chú "Ít cay, không hành") 134.000đ + 1x Trà Đào Cam Sả 35.000đ = **169.000đ**, trạng thái chờ tiếp nhận; kèm 1 yêu cầu gọi nhân viên. Phiên Bàn AKA Vip đang để MỞ.
- Không có xác nhận thanh toán nào được thực hiện.

## Phụ lục — Tài liệu liên quan
- `order_app_full_review_for_codex.md` — rà soát bảo mật + kiến trúc (phần A–E) cho cùng repo.
- `order_app_checklist_20_diem.md` — đối chiếu 20 điểm bảo mật với app.
- `order_app_refresh_token_spec.md` — spec refresh token/thiết bị/cấu hình bền vững.
- `order_app_superadmin_1000shops_proposal.md` — đề xuất super admin + scale (ngoài phạm vi tài liệu này).
