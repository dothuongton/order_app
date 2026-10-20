# Bằng chứng kiểm tra — 20/10/2026

HEAD: `1a773f7a428ca8756c9bce3a6e388cdc4ea21312`, nhánh main. Mã ứng dụng không bị sửa trong lượt đánh giá.

## Lệnh và kết quả

| Lệnh/kiểm tra | Kết quả |
|---|---|
| git status -sb / git log | Sạch trước khi đánh giá, main trùng origin/main. |
| npm test | PASS: 6 file, 81 test, khoảng 7,20 giây. |
| npm run build | PASS cả backend và frontend; bundle JS khoảng 492,59kB, gzip 124,16kB. |
| npm audit --json (backend) | 0 cảnh báo. |
| npm audit --json (frontend) | 7: 5 high + 2 moderate; nhóm braces/chokidar/fast-glob/micromatch/tailwindcss và postcss-nested/postcss-selector-parser. |
| npm ls --depth=0 ở backend/frontend | PASS: không có lỗi dependency tree được lệnh báo. |
| docker info | FAIL/BLOCKED: không kết nối được Docker daemon ở ~/.docker/run/docker.sock. Chưa chạy docker build/start. |
| GET https://order-app-ddho.onrender.com/health | HTTP 200, status ok, commit đúng HEAD. Không kiểm tra password hay mutation production. |
| NODE_ENV=test node --import tsx scripts/audit-2026-10-20.mjs (từ backend) | Hoàn tất các ca tái hiện; lưu JSON ở docs/audits/2026-10-20-evidence.json; DB local tạm được xóa. Đây không phải kết quả các nghiệp vụ đã đúng. |
| Migrate lặp trên DB tạm | Được thực thi trong ca SEC-01; không lỗi SQL ở dữ liệu fixture, nhưng reset password quản trị — hành vi không an toàn. |
| Built server với DB không truy cập được | Vẫn listen, /health 200. Ca OPS-01. |
| npm ci từ clean checkout / Docker / restore backup / load test | Chưa thực hiện. |
| Browser toàn bộ UI / iOS/Android thiết bị thật | Chưa thực hiện lại ở lượt đánh giá này. |

## Ca tái hiện và đầu ra chính

- SEC-01: strongPasswordPreservedAfterBoot=false; strongPasswordPreservedAfterMigration=false.
- BUS-01: cả 5 flag sai tùy chọn = true.
- BUS-02: rawSessionAmount=240000; sessionBill=200000; expectedSingleSessionDiscountBill=220000.
- BUS-03: summaryBeforePayment=100000; settledAmount=100000; immutableBillLinesAmount=100000; summaryAfterPayment=120000; redemptionAuditRows=0.
- BUS-04: displayedAmount=100000; paidWithSameSettlementVersion=120000; conflictRejected=false.
- DATA-01: deleteClosedTableStatus=200; billsRemainingForSettledSession=0; revenueBeforeDelete=220000; revenueAfterDelete=120000.
- BUS-05: đóng góp thống kê món của phiên bị xóa=120000, tiền đã thu thực của chính phiên=100000. Tổng thống kê món còn bao gồm phiên OPEN đã phục vụ, vì vậy cần phân biệt gross/net và phạm vi trước khi đối soát.
- BUS-06: maxRedemptions=1; successfulSettlements=2; currentRedemptions=2. Trigger delay chỉ dùng trong DB tạm để tái hiện race.
- OPS-01: databaseUnavailable=true; serverStarted=true; healthStatus=200.

Script yêu cầu PostgreSQL local và quyền tạo/xóa DB tạm; không đổi mật khẩu người dùng thật. Không đặt URL production vào môi trường chạy công cụ. Script không thuộc pattern `src/tests/**/*.test.ts` và không làm bộ 81 test mặc định báo xanh cho hành vi lỗi.

## Test cần bổ sung khi khắc phục

1. Khởi động/migrate lại không đổi mật khẩu/role tài khoản đã có; không tự tạo superadmin với password mặc định trong production.
2. Xóa/archive bàn không mất bill_lines/settlement/report; kiểm tra cả cạnh tranh mở/xóa bàn.
3. Option thuộc đúng item+tenant, nhóm active, SINGLE/MULTIPLE/min/max, ID lạ, option hết món, mảng quá dài; happy path variants cũ vẫn có kế hoạch tương thích.
4. Một/multiple rounds với fixed/percent/cap/min promotion; không cộng dồn sai phạm vi và không làm lại tiền đơn lịch sử.
5. Hai phiên tranh một lượt khuyến mãi; số tiền bị đổi cần conflict/xác nhận lại rõ ràng.
6. Hóa đơn CLOSED đọc lại sau khi promo hết hạn/tắt/xóa/hết lượt vẫn giữ đúng snapshot đã chốt.
7. Report gross/net, dòng món và tổng settlement đối soát được; trace redemption đầy đủ.
8. DB không sẵn sàng hoặc schema migration lỗi phải có readiness đúng; test cả startup trực tiếp và Docker entrypoint.
9. UI cart/order/bill/receipt có cùng số tiền theo chính sách được xác nhận; E2E role/tenant switch và retry mạng.
10. WebSocket + Web Push trùng eventId; sync subscription fail; logout/relogin/đổi tài khoản. iOS 16.4+ Home Screen PWA, permission/user gesture, foreground/background/khóa màn hình, reconnect/cold start.

## Kế hoạch triển khai/rollback để chủ dự án duyệt khi sửa

- Chụp backup và kiểm tra phục hồi ở môi trường riêng trước các thay đổi ảnh hưởng ledger/FK/promotion snapshot.
- Xác định danh sách tài khoản quản trị và ảnh hưởng reset password/secret; không đưa password hoặc VAPID private key vào commit/log.
- Sửa đường boot/migrate trước khi rotate mật khẩu để tránh bị reset trở lại. Kiểm tra JWT hiện có và kế hoạch revoke; đổi mật khẩu riêng lẻ không tự đảm bảo token cũ hết hạn.
- Dùng migration additive/backward compatible khi có thể, đánh dấu version, test upgrade từ schema thực tế đã ẩn dữ liệu nhạy cảm. Không chạy script down/drop tự động.
- Đối soát bill/settlement từ backup với các ca giảm giá cũ; thống nhất cách giữ snapshot đơn lịch sử, không tính lại bằng promo hiện tại.
- Build/test/DB upgrade trên staging → smoke test role/QR/menu/CMS/chốt tiền với fixture → triển khai có theo dõi → kiểm tra commit/readiness/report.
- Rollback app phải tương thích schema mới. Không rollback về phiên bản vẫn reset Super Admin ở boot; với lỗi mật khẩu cần bản sửa tối thiểu loại bỏ nhánh đó. Chỉ phục hồi DB theo kế hoạch đã duyệt nếu thực sự cần, không ghi đè dữ liệu phát sinh sau backup một cách tự động.
- Khóa production, migration và deploy thật cần được thực hiện trong một yêu cầu khắc phục/triển khai riêng; lượt hiện tại chỉ đánh giá và thu bằng chứng local.
