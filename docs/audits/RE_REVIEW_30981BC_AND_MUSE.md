# Đối chiếu Antigravity 30981bc và đề xuất Muse — 20/10/2026

## Kết luận

Nhánh core tiến bộ rõ, nhưng **chưa đạt điều kiện merge/phát hành**. Cần hoàn thiện các issue đang mở thay vì coi toàn bộ R1–R10 đã nghiệm thu. Spec Muse hữu ích như đầu vào sản phẩm; một số mô tả dựa main cũ hoặc mâu thuẫn nội bộ nên không thể triển khai nguyên văn.

Đã fetch và xác nhận core HEAD `30981bcc5c9a32f9cc948a434127704c0062b013`, main `1a773f7a428ca8756c9bce3a6e388cdc4ea21312`. Nhánh Sang đã tiến tới `f386525`, có pagination/chi tiết quán và test namespace riêng; chưa merge vào core. Chỉ đọc nhánh Sang, chưa nghiệm thu runtime nhánh đó. Chưa có PR mở khi kiểm tra.

## 1. Kiểm chứng độc lập bản sửa

- Backend **118/118** test đạt, 15 tệp; khác con số116 trong handoff nhưng không phải lỗi chức năng.
- Frontend/backend build đạt; boundary CLI hiện tại trả thành công.
- Chạy lại tám ca của harness handoff: không còn tự tạo admin khi migrate production; percent nhiều lượt216.000, cap108.000 đúng ví dụ; API thiếu expectedAmount400 và lệch số đã gửi409; suspended thu tiền200; báo cáo món đã chốt net100.000; sửa/xóa promotion giữ snapshot mới và trace; thiếu bảng tracking readiness503.
- `serveStatus409` sau `payStatus200` trong harness là thử phục vụ phiên đã đóng, không phải chứng minh suspended phục vụ bị lỗi. Không coi đây là regression.
- Harness thu thập chứng cứ không có assertion đầy đủ, exit0 không đồng nghĩa mọi invariant đã đạt. Tests xanh chỉ chứng minh các ca được kiểm tra.
- Các ca bổ sung chạy trên PostgreSQL local tạm, không đăng nhập/thay đổi hệ thống deploy. [Bằng chứng](MUSE_REVIEW_30981BC_EVIDENCE.json); script `backend/scripts/review-muse-30981bc.mjs` chạy từ backend qua node --import tsx.

### Các lỗi/tiêu chí còn thiếu

| Mục | Bằng chứng mới tại30981bc | Xử lý |
| --- | --- | --- |
| P1: quote UI vẫn tự đồng ý số mới | Chạy chính click-handler đã transpile với request stub: màn hình100.000, GET mới120.000, POST expectedAmount120.000 và đóng mà không xác nhận lần2. Nguồn TableDetailModal.tsx:178–187. Đây là function harness, chưa phải browser E2E. | Giữ #27 mở, quote phải là số đã được nhân viên xem; giá/version đổi thì dừng và hỏi xác nhận lại. |
| P1: hết cap làm kẹt tất toán | Hai phiên cùng có promo cap1. Phiên1 chốt; phiên2 nhận409 PROMOTION_EXHAUSTED. Reload vẫn báo50.000, retry vẫn409, session vẫnOPEN. | Giữ #28/#12 mở; cần quote hết lượt mới, bỏ ưu đãi không còn hợp lệ theo policy đã chốt và yêu cầu xác nhận60.000. Không được kẹt lặp vô hạn. |
| P1: hủy một phần tính fixed discount sai | Gọi120.000 rồi60.000; giảm20.000 khi đạt100.000; hủy60.000 ở order đầu, phục vụ còn120.000: discount chỉ10.000, phải20.000 theo policy cấp phiên. | #28: tính trên tập món hợp lệ/đã phục vụ cuối cùng, không phân bổ theo snapshot order đầu rồi giữ sai sau cancel. |
| P1: boundary gate chưa đúng toàn bộ ownership | Core→admin đã bị chặn. Sang→components/admin, tests/admin-cms, docs/admin-cms vẫn bị từ chối; thiếu actor vẫn pass core; CI vẫn dùng github.actor, script từ PR. | Giữ #29 mở, sửa đủ allowlist, lane đáng tin và trusted rules. Không thay quyền sở hữu tệp để làm test xanh. |
| P2: readiness chỉ biết base schema | Xóa marker008 nhưng giữ000_base_schema: readiness200. | Giữ #32 mở; check revision/schema mà ứng dụng hiện tại cần, không chỉ một marker từ phiên bản đầu. |
| P2: rollback chưa được diễn tập | Runner có lọc_down, nhưng runbook vẫn gọi down chưa có và xóa marker rồi restart; chưa có bằng chứng schema rollback với redemption order_id=NULL. | Giữ #34 mở cho đến có phương án app rollback/forward-fix/restore được kiểm chứng. |
| P2: JSON parser lộ thông tin | JSON hỏng thực trả400 (Muse ghi500 không đúng ở30981bc) nhưng error INTERNAL_SERVER_ERROR và message parser vẫn lộ; central logger in cả err chứa body. | Tạo việc hardening prelaunch: 400 generic, không log request body/password/token. |

R1/R4/R6/R7 có bằng chứng cải thiện trong các ca nêu trên; chưa tự đóng issue, chưa chứng minh mọi acceptance của mỗi issue đạt. R9 đã gắn limiter và sửa staff.id trong source; cần HTTP kiểm thử ngưỡng thật. R10 concurrency mới có Promise.allSettled trong suite đạt, nhưng không thay thế restore drill.

## 2. Đánh giá từng phần Muse

### A — Bảo mật

A1.1 mô tả đúng lỗi main cũ, nhưng không còn đúng nguyên trạng trên30981bc: INSERT mặc định đã bỏ khỏi schema/migration. Demo seed và login prefill còn tồn tại; tài khoản thuận tiện trên TEST không tự là sự cố production. Cần profile demo tách rõ và cổng prelaunch: admin do operator bootstrap, credential mẫu không hợp lệ ở production, không default hint trên UI production. Không tự sửa môi trường Render hoặc đổi secret ở lượt này. Đổi/revoke credential đã lộ mới là xử lý thực tế; không coi đổi repo private hoặc rewrite git history là biện pháp chính.

Đổi mật khẩu/recovery chưa có: cần endpoint xác thực đúng actor và mật khẩu hiện tại, giới hạn thử, audit an toàn, thu hồi phiên API/socket. Bảng blacklist chỉ lưu token đã biết không thể tự thu hồi tất cả token của user. Thêm session/credential version hoặc server-side session registry. Mật khẩu account là toàn cục, membership theo tenant: phải nói rõ đổi mật khẩu ảnh hưởng mọi quán của cùng user.

CSP report-only đã được thêm; chưa phải CSP enforce. Staff/admin bearer vẫn lưu localStorage và TTL7ngày. JSON hỏng hiện400, không500; message/log vẫn cần che. Không có bằng chứng mới về SQLi/XSS đang khai thác; không chứng nhận toàn bộ hệ thống an toàn từ test này.

### B — QR cố định và UX không nhập PIN

QR giấy chỉ là địa chỉ public, không chứng minh người cầm ảnh đang ở quán. Đề xuất không thêm PIN phù hợp mục tiêu ít thao tác, nhưng anomaly/revoke chỉ giảm rủi ro, không ngăn người có ảnh join từ xa hoặc xem bill trước khi bị loại. Phải ghi lựa chọn này trong ADR trước go-live; tài liệu Muse tự ghi “đã chốt” không thay quyết định của chủ dự án.

Không coi hậu tố6hex (~24bit) là mức chống đoán mạnh. Mã bàn mới dùng opaque random ít nhất128bit; mã cũ chỉ lập kế hoạch thay/in lại TRƯỚC khi dùng thực, không tự rotate mã giấy đang sử dụng. Dài/ngẫu nhiên giúp chống đoán, không giải quyết QR bị chụp.

Menu public chỉ chứa dữ liệu cần công khai; không sessionId/timestamp/guest count/bill/history. Có thể thống nhất lỗi join không hợp lệ; nếu còn trả canOrder/occupied thì vẫn suy ra hoạt động bàn, không thể tuyên bố đã che trạng thái. Rate limit phải dùng dữ liệu đã xác thực hoặc IP/ngữ cảnh join; token/fingerprint client tự gửi không đủ làm khóa tin cậy.

IP/Wi-Fi, user-agent, fingerprint và số thiết bị là tín hiệu yếu: NAT/4G/VPN, nhiều tab, dùng chung máy, spoofing gây false positive. Không dùng vị trí/IP làm chứng cứ hiện diện hoặc tự ban. Không gọi dịch vụ geolocation ngoài mặc định. Lưu tối thiểu/truncate/hash theo mục đích và thời hạn; không đưa IP đầy đủ vào alert/audit UI công khai.

Guest list/revoke cần permission riêng, scope tenant/session, ghi audit và dừng cả API lẫn socket/subscription đang mở. Đơn “thiết bị mới” phải thể hiện ở hàng đợi staff trước chế biến theo policy, không tự gán đã xác nhận. Revoke thiết bị không xóa/hủy order đã ghi, đóng phiên không xóa ledger.

### C — Super Admin và mục tiêu1000quán

`memberships` có UNIQUE(tenant_id,user_id), PostgreSQL tự tạo unique index: không có CREATE INDEX riêng không có nghĩa không có index. Auth với điều kiện bằng cả hai cột đã được phục vụ; login chỉ lọc user_id có thể cần index bắt đầu user_id, phải đo EXPLAIN trước. Tenant_id là cột đầu index hiện hữu, không thêm index tenant_id trùng một cách máy móc.

`audit_logs` dùng user_id, không actor_id như SQL đề xuất. Orders/audit/time-range cần xem index thực tế và query plan; không áp spec DDL nguyên văn. CREATE INDEX CONCURRENTLY không chạy trong transaction block trong khi runner hiện bọc từng migration bằng BEGIN: phải có đường nontransactional có theo dõi/retry/invalid-index rõ hoặc maintenance migration thích hợp.

Pagination/GET shop detail đã có ở nhánh Sang f386525, vì vậy không tạo lại task “làm pagination” như chưa ai thực hiện. Bounded offset ổn cho1000 bản ghi tenant; cursor dành event/order/audit volume lớn khi cần. Trigram và counters/materialized aggregates chỉ thêm khi query/search đo được cần, không bắt buộc thay toàn bộ API.

60.000đơn/ngày không phải benchmark. Cần peak concurrent tables/devices/socket fanout/polling3s/query count, p95/p99, DB connections, restore time. Giữ modular monolith PostgreSQL hiện tại; sửa N+1/index/query trước. Pool20 không tự là lỗi nếu một instance; ngân sách tổng connection mới quyết định PgBouncer. Redis adapter/store chỉ khi chạy nhiều instance, có reconnect/sticky sessions phù hợp transport; không bảo đảm1000quán chỉ bằng lắp Redis. Replica chỉ phục vụ đọc chịu stale; auth, tenant status, money, writes và read-after-write cần primary. Không route toàn bộ /admin sang replica vì có mutation.

daily_shop_stats lấy từ bill/settlement đã chốt, idempotent, timezone/business-day rõ, rebuild/đối soát được và hiển thị độ trễ. Không đếm order như đã thu tiền. Phân quyền platform/read-only deep view trước; support mặc định chỉ đọc/redact, không mặc định reset mật khẩu owner hoặc sửa dữ liệu tiền.

Không triển khai impersonation ở đợt hiện tại. Nếu cần sau này: ADR/ticket, step-up, grant chỉ1tenant/TTL ngắn, actor và subject tách rõ, không membership giả, không sửa ledger. Full quyền giám sát không đồng nghĩa tùy ý sửa hóa đơn đã chốt.

### D — Thiết bị đăng nhập lâu, refresh và cài đặt

Ưu tiên kiến trúc same-origin phù hợp app hiện tại: access cookie HttpOnly thời hạn ngắn + refresh cookie HttpOnly có path riêng; cookie không phải miễn nhiễm CSRF, phải bảo vệ Origin/CSRF/CORS và socket. Không duy trì thêm bản bearer trong localStorage. Socket dùng cookie đã xác thực hoặc ticket ngắn; contract admin/staff được bàn giao đồng thời giữa core và Sang.

Session/device registry là nguồn kiểm soát trung tâm, refresh lưu hash có rotation; JWT có session/credential version để revoke ngay ở HTTP và socket. Giữ blacklist hiện tại cho legacy/specific token tới khi hết thời hạn, không tạo hai nguồn revoke mâu thuẫn. Đổi mật khẩu/mất thiết bị/reuse/MFA recovery thu hồi theo scope đã chốt. Legacy token7ngày không được mặc nhiên tiếp tục nếu credential đã bị đánh giá lộ hoặc user vừa đổi mật khẩu.

Một account nhiều thiết bị có family riêng; nhiều tab cùng browser phối hợp single-flight/Web Locks/BroadcastChannel, server lock/atomic rotation. Lost response/cookie update race và retry phải có test; không đặt grace window tùy tiện cho token đã dùng vì sẽ làm yếu phát hiện replay. Có thể thiết kế retry idempotent rất hẹp gắn request/device theo threat model đã review.

30phút access và90/365ngày là lựa chọn sản phẩm, không phải chuẩn bắt buộc hay cam kết của vendor khác. Muse còn mâu thuẫn platform access8–12giờ với refresh14ngày và access30phút. Đề xuất ban đầu để ADR quyết: staff access15–30phút, trusted-device opt-in idle30ngày/absolute90ngày; platform access10–15phút, phiên tối đa8giờ + MFA/step-up. Nhãn thiết bị không nên chặn login giờ cao điểm. Các giá trị phải được chủ dự án chốt trước bật thật.

Cài đặt tách tenant defaults, user/device overrides và browser cache; account đăng xuất/đổi tenant không mang âm thanh/token state sang quán khác. Volume/máy in thường là theo thiết bị; đừng chỉ một tenant_settings JSON chung áp mọi máy. Version/validation/migration/settings precedence rõ. Đồng bộ cài đặt không cấp quyền notification OS, wake lock, autoplay hoặc bảo đảm chuông nền iOS.

### E — Lộ trình phù hợp

0. Hoàn thiện #24, đặc biệt #27/#28/#29, rồi review lại branch và PR thật; giữ TEST ổn định, chưa coi ready production.
1. Trước khách/dữ liệu thật: tách demo/credential, đổi mật khẩu/revoke, platform MFA, auth cookie/session/CSRF với rollout đồng bộ CMS, public QR privacy và staff revoke; test E2E + backup/restore. Chưa làm impersonation.
2. Pilot có đo tải: device settings bền vững, admin đọc sâu, index theo EXPLAIN; daily stats khi dashboard cần. Đo UX với nhân viên và đối soát tiền.
3. Scale dựa số đo: connection budget/PgBouncer, Redis/socket/rate-store nhiều instance, replica đọc chịu stale nếu cần. Không sharding hay rewrite framework theo số tenant đơn thuần.

## 3. Ranh giới triển khai

@dothuongton/Antigravity giữ core/auth/schema/migrations/staff/guest/pricing/reports/shared app/config/CI. @SangVuxx giữ admin API/UI/components/hooks/types/api/tests/docs namespace theo #2; AdminLogin là ngoại lệ thuộc core. Core không sửa admin module để làm feature platform; contract/schema/RBAC do core chuẩn bị ở #6, Sang triển khai sau contract và queue CMS hiện tại #19. Không thêm role/support/impersonation lặng lẽ.

Mỗi lane một issue tại một thời điểm; các tệp finance/shared có dependency tuần tự. Đợt tính năng mới chỉ khởi động phần phụ thuộc sau khi core hiện tại được review đủ. Antigravity viết code, Codex review lại, dothuongton mới merge; main vẫn auto-deploy Render.

## 4. Nguồn kỹ thuật đối chiếu

- [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html): current credential/reauth cho thao tác nhạy cảm.
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): vòng đời, revoke và session phía server.
- [RFC9700 §4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14): refresh rotation/replay/expiration; đây là tham chiếu thiết kế, không khẳng định app hiện tại đã triển khai OAuth.
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html): UNIQUE tạo index; [CREATE INDEX](https://www.postgresql.org/docs/16/sql-createindex.html): CONCURRENTLY không trong transaction block.
- [Socket.IO multiple nodes](https://socket.io/docs/v4/using-multiple-nodes/): phối hợp adapter/transport/session affinity khi scale.

## 5. Issue triển khai

Roadmap: [#35](https://github.com/dothuongton/order_app/issues/35). Đã cập nhật #27/#28/#29/#32/#34 và liên kết các issue hạ tầng/bảo mật/tích hợp hiện có.

- [#36 — Prelaunch: profile demo an toàn, bootstrap operator và lỗi JSON/log/CSP](https://github.com/dothuongton/order_app/issues/36) — @dothuongton
- [#37 — Identity: đổi mật khẩu, bắt đổi credential tạm và thu hồi phiên toàn tài khoản](https://github.com/dothuongton/order_app/issues/37) — @dothuongton
- [#38 — Platform identity: quyền support tối thiểu, MFA/step-up và recovery có kiểm soát](https://github.com/dothuongton/order_app/issues/38) — @dothuongton
- [#39 — Sessions backend: thiết bị tin cậy, refresh rotation và revoke thống nhất](https://github.com/dothuongton/order_app/issues/39) — @dothuongton
- [#40 — Auth frontend/core: chuyển cookie HttpOnly, refresh nhiều tab và socket/PWA tương thích](https://github.com/dothuongton/order_app/issues/40) — @dothuongton
- [#41 — QR public: mã khó đoán, dữ liệu tối thiểu và join rate-limit đáng tin](https://github.com/dothuongton/order_app/issues/41) — @dothuongton
- [#42 — Guest sessions: danh sách thiết bị, revoke một chạm và cảnh báo bất thường](https://github.com/dothuongton/order_app/issues/42) — @dothuongton
- [#43 — Thiết bị quán: cài đặt thông báo bền vững theo tenant/user/device](https://github.com/dothuongton/order_app/issues/43) — @dothuongton
- [#44 — Hiệu năng DB: baseline1000tenant, EXPLAIN/index và runner nontransactional an toàn](https://github.com/dothuongton/order_app/issues/44) — @dothuongton
- [#45 — Reporting read model: thống kê ngày idempotent từ bill/settlement đã chốt](https://github.com/dothuongton/order_app/issues/45) — @dothuongton
- [#46 — Super Admin: API đọc sâu dữ liệu quán có scope, phân trang và phân quyền](https://github.com/dothuongton/order_app/issues/46) — @SangVuxx
- [#47 — Super Admin: trang chi tiết quán đa tab và UX hỗ trợ chỉ đọc](https://github.com/dothuongton/order_app/issues/47) — @SangVuxx
- [#48 — Admin UI tích hợp identity mới: cookie client, đổi mật khẩu và MFA/settings](https://github.com/dothuongton/order_app/issues/48) — @SangVuxx

## Bổ sung theo đặc tả V4 gốc

Đã công bố hai spec nguyên văn và skillKarpathy trong PR#49: https://github.com/dothuongton/order_app/pull/49. EpicV4#50, Sprint0#51, claim#52, checkout#53. V4 là hệ thống đích; đề xuất Muse không thay master/addendum. Đặc biệt addendum chỉ1claim hiệu lực/session, thiết bịkhác chỉmenu khôngbill/history; roadmap#35 và task#41/#42 đã cập nhật ràngbuộc này.
