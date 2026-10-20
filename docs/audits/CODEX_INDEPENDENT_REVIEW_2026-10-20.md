# Codex review độc lập — Core handoff — 20/10/2026

## Kết luận

**REQUEST CHANGES — chưa nên merge/deploy.** Đã đối chiếu nhánh `codex/core-audit-fixes` tại `3bd9b31` với `main@1a773f7`. Có 41 tệp đổi. Chưa có PR mở tại thời điểm kiểm tra nên đây là review nhánh, chưa gửi review/comment lên GitHub.

Đã tự chạy lại: 112/112 backend tests đạt, backend/frontend build đạt và boundary CLI trả thành công. Các kết quả này được xác nhận độc lập; những tiêu chí còn lỗi bên dưới chưa được suite hiện có kiểm tra đúng/đủ. Không sửa mã nghiệp vụ, không merge, không deploy, không đổi secret; chỉ thêm báo cáo, bằng chứng và script tái hiện local. Không chỉnh tệp admin của Sang.

Bằng chứng runtime: [CORE_HANDOFF_REVIEW_EVIDENCE.json](CORE_HANDOFF_REVIEW_EVIDENCE.json). Chạy lại từ `backend`: `NODE_ENV=test node --import tsx scripts/review-core-handoff-2026-10-20.mjs`. Script dùng PostgreSQL local, tạo DB `qr_order_test_*`, dọn DB sau chạy, không in token/password/hash. Đây là bộ thu thập chứng cứ, không phải suite khẳng định các ca lỗi đã đạt.

## Các điểm cần sửa, theo ưu tiên

### R1 — P1 — Vẫn tạo Super Admin có credential mặc định trong migration production — issue #3

Nguồn: `backend/src/db/migrations/004_superadmin_user.sql:3-12`; `backend/src/db/schema.sql:481-491`.

`ON CONFLICT DO NOTHING` giữ được mật khẩu của tài khoản đã tồn tại, nhưng vẫn INSERT tài khoản platform admin với hash cố định khi tài khoản thiếu. Việc chặn demo seed không chặn hai SQL này. Trong DB tạm, xóa admin rồi đánh dấu migration 004 chưa chạy, gọi CLI migration với NODE_ENV=production và secret ngẫu nhiên hợp lệ: tài khoản admin được tạo lại và chấp nhận mật khẩu mặc định đã công khai. Không thử trên production.

Cần bỏ INSERT admin mặc định khỏi cả base schema và migration; bootstrap riêng bằng credential do operator cấp qua kênh an toàn, không chạy mặc định. Thêm test production DB mới/không có admin không tự tạo tài khoản mặc định, bên cạnh test giữ hash/role hiện hữu. Không tái công khai credential/hash trong PR hoặc log.

### R2 — P1 — Promotion cấp phiên vẫn khóa discount vào lần gọi đầu tiên — issue #9

Nguồn: `backend/src/modules/guest/guest.service.ts:400-420`; pricing vẫn tính theo order, summary/settle ưu tiên item discount cũ.

Bản sửa ngăn áp dụng discount lần thứ hai, nhưng chưa tính discount theo tổng phiên. Hai lần gọi 120.000đ với promotion 10% cho toàn phiên: raw240.000, actual228.000, expected216.000. Với cap1, hai lần60.000: actual114.000, expected108.000. Lượt redeem bị tiêu từ lúc tạo order. Trường hợp fixed20.000 hiện có trong test không phân biệt được giảm một lần trên order đầu và giảm trên tổng phiên.

Cần đặt policy cấp phiên ở một nguồn tính và xác định thời điểm claim lượt. Test phần trăm, min/max discount, cap, gọi thêm/hủy/phục vụ một phần và tương thích snapshot lịch sử; không sửa bill lịch sử âm thầm.

### R3 — P1 — UI thu ngân bỏ qua kiểm tra thay đổi số tiền — issue #11

Nguồn: `backend/src/modules/staff/staff.service.ts:814-820`; `backend/src/modules/staff/staff.routes.ts:167-176`; `frontend/src/pages/staff/TableDetailModal.tsx:178-187`.

`expectedAmount` tùy chọn, chỉ kiểm tra nếu client gửi. UI hiện tại không gửi trường này hoặc priceFingerprint. HTTP local dùng đúng hình dạng payload UI: đã xem100.000, tắt promotion, gửi nguyên settlementVersion → HTTP200 và chốt120.000. priceFingerprint chỉ được trả về, chưa được kiểm tra. Test mới chỉ gọi service và tự truyền expectedAmount nên bỏ sót luồng thật.

Cần contract quote/revision bắt buộc có kiểm chứng trên server, truyền từ số nhân viên thực sự đã xem, và UI yêu cầu xác nhận lại khi giá đổi. Không tự refetch quote rồi dùng số/version mới để tự đồng ý. Test HTTP + UI cho thay đổi promotion giữa xem/chốt, cap hết, request thiếu quote và retry.

### R4 — P1 — Quán suspended không thể thu tiền/đóng phiên đang mở — issue #6

Nguồn: `backend/src/middleware/auth.ts:102-109`.

Allowlist hậu tố `/pay`, `/cancel`, `/serve` không khớp route thật `/confirm-payment-and-close`, `/close-without-charge`, `/serve-all` và các thao tác order-item liên quan. Local đã phục vụ phiên, chuyển tenant sang suspended: POST thu tiền và serve-all đều403 SHOP_SUSPENDED. Không khớp contract cho phép tất toán phiên cũ.

Cần dùng policy rõ ở route/permission phù hợp thay vì đoán chuỗi đường dẫn; cho phép đúng chuỗi thao tác xử lý phiên hiện hữu đã duyệt, vẫn chặn mở bàn/thêm món mới. Test HTTP thực sự chốt phiên khi suspended; test đang có chỉ chứng minh GET được phép và tạo category bị chặn.

### R5 — P1 — Boundary gate chưa bảo vệ hai lane và chặn nhầm tệp hợp lệ của Sang — issue #5

Nguồn: `scripts/check-file-boundaries.mjs:19-32`; `.github/workflows/ci.yml` bước Run Boundary Check.

Đã gọi validator độc lập: dothuongton sửa `backend/src/modules/admin/admin.service.ts` vẫn valid=true; Sang sửa `frontend/src/components/admin/ShopCard.tsx`, `backend/src/tests/admin-cms/shops.test.ts`, `docs/admin-cms/contract.md` đều valid=false dù issue #2 cho phép. CI dùng github.actor (người gây workflow) thay vì PR author/lane đáng tin; rerun/synchronize có thể do người khác gây ra. Lệnh local không truyền actor luôn bỏ kiểm tra quyền sở hữu. Bản diff hiện tại thực tế không sửa admin; phát hiện này nói về gate, không khẳng định hai lane đã sửa trùng.

Cần map đầy đủ allowlist và ngoại lệ AdminLogin, chặn core sửa vùng Sang đang sở hữu, xác định lane ổn định và fail nếu thiếu lane. Thực thi quy tắc từ nguồn được kiểm soát, không để code PR tự vô hiệu guard. Test hai chiều, đường hợp lệ, actor khác, rename/delete và required checks. Chưa xác minh branch protection trên GitHub đã bật.

### R6 — P2 — total_amount trong báo cáo vẫn chưa trừ giảm giá cấp phiên — issue #13

Nguồn: `backend/src/modules/reports/reports.routes.ts:32-45`.

Chỉ thêm gross_amount; total_amount vẫn trừ discount_amount trên order_items. Local tạo một món riêng chỉ dùng ở phiên đã chốt: settled100.000, reportedGross120.000, reportedNet120.000. Đây là đối soát đóng góp cùng phiên, không phải so tùy tiện tổng món OPEN với tổng tiền đã thu.

Cần dùng/phân bổ bill_lines subtotal cho các phiên đã chốt hoặc đổi tên/định nghĩa chỉ số để không gọi là thực thu. Test gross/net, làm tròn và phân tách OPEN/CLOSED rõ ràng.

### R7 — P2 — Chi tiết promotion của bill CLOSED vẫn thay đổi/xóa theo dữ liệu live — issue #10/#13

Nguồn: `backend/src/modules/guest/guest.service.ts:815-832`; FK promotion_redemptions → promotions ON DELETE CASCADE.

Tổng bill đã được giữ100.000 là cải thiện đúng. Nhưng tên/code/type/value vẫn JOIN promotion hiện tại. Local đổi tên/giá trị promotion sau chốt: lịch sử hiển thị tên mới. Xóa promotion: redemption còn0, appliedPromotions rỗng; tổng bill vẫn100.000 nhưng trace promotion biến mất.

Cần snapshot metadata/giá trị áp dụng gắn bill và bảo toàn trace sau sửa/archive/xóa promotion; test edit/delete thực sự, không chỉ deactivate/exhaust.

### R8 — P2 — Readiness vẫn trả200 khi thiếu schema tracking — issue #14

Nguồn: `backend/src/app.ts:45-52`.

Query schema_migrations lỗi được fallback SELECT1 nên chỉ chứng minh DB kết nối được. Local tạm đổi tên bảng schema_migrations: /health/readiness vẫn200. Ngay cả bảng tracking rỗng cũng không chứng minh migration bắt buộc hoàn tất.

Cần kiểm tra revision/schema cần thiết của ứng dụng, trả503 khi thiếu/lệch; không fallback che lỗi schema. Timeout phải hủy/giới hạn truy vấn phù hợp, tránh tích tụ query khi DB treo. Liveness có thể độc lập DB.

### R9 — P2 — Staff mutation rate limiter chưa được gắn vào request nào — issue #22

Nguồn: `backend/src/middleware/security.ts:55-66`; toàn bộ import/use trong app/router.

Đã tìm toàn source: staffMutationLimiter chỉ được khai báo/export, chưa import/use ở app hoặc router nên không giới hạn mutation thật. Trong keyGenerator còn đọc staff.userId trong khi StaffUser dùng id, khiến phân biệt user cũng không chạy đúng khi tích hợp.

Cần gắn sau authenticateStaff ở phạm vi mutation đã chốt, key dựa actor/tenant đã xác thực, chính sách nhiều user cùng tenant rõ ràng. Test HTTP vượt ngưỡng, user khác, tenant khác và quán suspended. Không coi có hàm export là tính năng đã hoạt động.

### R10 — P2 — Hướng dẫn rollback không có thao tác đảo schema thực tế — issue #14/#23

Nguồn: `docs/audits/CODEX_REVIEW_REPORT.md:142-143`; `docs/operations/DEPLOYMENT_AND_RUNBOOK.md:90-100`; `backend/src/db/migrate.ts` đọc tất cả tệp kết thúc .sql.

Xóa dòng schema_migrations không đảo DDL; lần khởi động tiếp sẽ chạy lại migration đó. Chưa có down script cụ thể cho006/007; runner sẽ chạy cả *_down.sql nếu để cùng thư mục như runbook gợi ý. 006 thay constraint, 007 nới nullability, không nên mô tả chung là additive không có rủi ro rollback. Khi đã có redemption order_id=NULL, đổi ngược NOT NULL còn có thể lỗi.

Cần tách up/down khỏi discovery tự động, nêu rollback app so với schema/forward-fix, precondition/backup/restore và test rollback trên snapshot có dữ liệu mới. Không dùng xóa dòng tracking như rollback.

## Nhận xét về bằng chứng và giới hạn

- Backend suite mới có112 test thực sự đạt, nhưng BUS-06 đặt tên concurrency mà chạy hai settle tuần tự, không Promise.all/race. Cần bổ sung race thật để chứng minh giới hạn dùng chung; review này không khẳng định atomic UPDATE hiện tại tự nó sai.
- Chưa chạy npm ci từ checkout sạch, Docker, workflow CI thực trên GitHub, browser/E2E, iOS/Android nền/khóa màn hình hoặc restore drill. Không suy các mục này đạt từ build/test Node.
- Con số RPO/RTO trong runbook là mục tiêu, chưa có số đo diễn tập; trust proxy1 cần bằng chứng topology Render thực. Không coi việc đặt cấu hình là đã kiểm chứng chống giả mạo IP cho mọi topology.
- Contract admin mới là thỏa thuận giữa hai lane, không có thay đổi admin runtime ở nhánh core. Khi tích hợp cần kiểm tra UI client hiện tại và admin branch cùng dùng một envelope, không tự sửa tệp Sang trong lúc họ đang phát triển.
- Các log/claim trong tài liệu handoff là thông tin của tác giả; chỉ những kiểm tra liệt kê ở trên được Codex chạy lại. Các issue trên GitHub vẫn OPEN. Cần sửa tuyên bố “đã hoàn thành” trong báo cáo handoff đối với những mục chưa đạt, và giữ issue mở đến khi nghiệm thu.

## Thứ tự bàn giao sửa

1. R1 credential bootstrap; R4 thu tiền suspended; R3 quote bắt buộc; R2 policy promotion.
2. R5 boundary gate trước khi hai lane tiếp tục tích hợp; R6/R7 đối soát và snapshot.
3. R8/R9/R10 readiness, throttle và rollback; bổ sung tests cho các khoảng trống trước tuyên bố nghiệm thu.

Antigravity chỉ sửa lane core; dothuongton dùng Codex review lại diff sau sửa rồi quyết định merge. Chưa approve/merge/deploy tại lượt review này.
