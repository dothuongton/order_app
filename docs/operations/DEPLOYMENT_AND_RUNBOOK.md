# Hướng Dẫn Vận Hành, Giám Sát, Triển Khai và Đối Soát Khôi Phục (Issue #23)

## 1. Kiến trúc Triển khai (Docker & Render)

### 1.1 Multi-Stage Dockerfile & Health Probes
Hệ thống sử dụng Docker multi-stage build:
1. `frontend-builder`: Build bundle Vite React SPA thành tệp tĩnh (`public/`).
2. `backend-builder`: Biên dịch TypeScript và đóng gói `schema.sql`, `migrations/`.
3. `runner`: Node.js 20 Alpine siêu nhẹ, chỉ chứa production dependencies.

Khởi động qua `./start.sh`:
- Kiểm tra kết nối và chạy migration an toàn có theo dõi `schema_migrations`.
- Chặn tự động seed dữ liệu mẫu trong production (`NODE_ENV=production` hoặc `AUTO_SEED=false`).
- Kiểm tra trạng thái máy chủ qua hai đầu dò tách biệt:
  - Liveness: `GET /health/liveness` (HTTP 200).
  - Readiness: `GET /health/readiness` (HTTP 200 khi kết nối DB và bảng schema sẵn sàng; HTTP 503 nếu DB lỗi hoặc timeout > 2s).

### 1.2 Proxy Topology & Chống Giả Mạo IP (Trust Proxy 1)
- Cấu hình `app.set('trust proxy', 1)`:
  - Chỉ tin cậy đúng 1 hop proxy đầu tiên (Render Load Balancer / Reverse Proxy).
  - Ngăn chặn triệt để kỹ thuật client spoofing bằng cách chèn chuỗi `X-Forwarded-For` tùy ý.
  - Phối hợp với `guestWriteLimiter` và `staffMutationLimiter` phân biệt theo token và user/tenant, không phạt nhầm nhiều thiết bị cùng dùng chung mạng Wi-Fi của quán.

---

## 2. Đo Lường Workload và Benchmark

### 2.1 Điểm Nóng (Hotspots) & Benchmark
1. **Khách hàng gọi món / Polling vs Socket**:
   - Khách gọi món sử dụng Socket.IO room `session:${sessionId}` để nhận cập nhật trạng thái món ngay lập tức thay vì spam polling.
   - Khi mất kết nối WebSocket, client fallback polling nhẹ với jitter và dừng khi màn hình tắt.
2. **Nhân viên nhận đơn / Bếp**:
   - Room `tenant:${tenantId}` nhận broadcast sự kiện `order.created`, `service_request.created`.
   - Cơ chế Dedupe ID (`order-${orderId}`, `req-${requestId}-${callCount}`) đảm bảo chuông và giọng nói tiếng Việt chỉ phát đúng 1 lần duy nhất dù nhận qua cả 2 kênh Socket.IO và Web Push.
3. **Truy vấn cơ sở dữ liệu**:
   - Sử dụng connection pool (pg.Pool) với cấu hình `max: 20`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`.
   - Indexing toàn diện: `idx_menu_items_tenant_cat_sort`, `idx_item_option_groups_item`, `idx_item_options_group`, `idx_table_sessions_active`, `idx_bills_session`.

---

## 3. Quy Trình Backup, Restore Drill và Đối Soát Hóa Đơn

### 3.1 Kế hoạch Backup & Chỉ số RPO / RTO
- **RPO (Recovery Point Objective)**: < 1 giờ (nhờ pg_dump định kỳ hoặc WAL archiving của nhà cung cấp Cloud DB).
- **RTO (Recovery Time Objective)**: < 5 phút (thời gian restore database và vượt qua probe `/health/readiness`).

### 3.2 Quy trình Restore Drill & Đối Soát Sổ Cái
Khi thực hiện diễn tập khôi phục trên môi trường cô lập:
1. Tạo database thử nghiệm:
   ```bash
   createdb -h localhost -U qr_user qr_order_restore_test
   ```
2. Nạp dữ liệu từ bản sao lưu:
   ```bash
   psql -h localhost -U qr_user -d qr_order_restore_test < backup.sql
   ```
3. Chạy lệnh đối soát tài chính (Financial Ledger Integrity Query):
   ```sql
   -- Đối soát tổng tiền món được phục vụ với tổng tiền hóa đơn đã chốt
   SELECT 
       b.id AS bill_id,
       b.session_id,
       b.total_amount AS recorded_bill_amount,
       COALESCE(SUM(oip.quantity * oi.snapshot_price), 0) AS served_raw_subtotal,
       COALESCE(pr.discount_amount, 0) AS recorded_promo_discount
   FROM bills b
   JOIN table_sessions ts ON ts.id = b.session_id
   LEFT JOIN orders o ON o.session_id = ts.id
   LEFT JOIN order_items oi ON oi.order_id = o.id
   LEFT JOIN order_item_parts oip ON oip.order_item_id = oi.id AND oip.status = 'SERVED'
   LEFT JOIN promotion_redemptions pr ON pr.session_id = ts.id
   WHERE b.status = 'CONFIRMED'
   GROUP BY b.id, b.session_id, b.total_amount, pr.discount_amount;
   ```
4. Kiểm tra probe readiness:
   ```bash
   curl -i http://localhost:4000/health/readiness
   ```

---

## 4. Runbook Sự Cố và Quy Trình Rollback

### 4.1 Triển khai Bản vá Lỗi (Hotfix)
1. Tạo branch từ `main`, viết test tái hiện lỗi.
2. Kiểm tra ranh giới tệp (`node scripts/check-file-boundaries.mjs`).
3. Chạy toàn bộ test suite (`npm test`).
4. Gửi Pull Request và kiểm tra CI GitHub Actions.

### 4.2 Rollback Migration khẩn cấp
Nếu bản migration mới gây lỗi schema trong lúc vận hành:
1. Chạy tệp down-migration tương ứng:
   ```bash
   psql $DATABASE_URL -f backend/src/db/migrations/<XXX>_down.sql
   ```
2. Xóa bản ghi migration khỏi bảng theo dõi:
   ```sql
   DELETE FROM schema_migrations WHERE filename = '<XXX>.sql';
   ```
3. Khởi động lại dịch vụ backend và giám sát log `/health/readiness`.
