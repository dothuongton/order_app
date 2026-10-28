-- 016_performance_optimization_indexes.sql
-- Tối ưu hóa chỉ mục theo báo cáo rà soát hiệu năng (Mục 12 & 13 Datbantaicho)

-- 1. Xóa chỉ mục thừa (trùng lặp với ràng buộc UNIQUE guest_sessions_token_hash_key)
DROP INDEX IF EXISTS idx_guest_sessions_token;

-- 2. Xóa chỉ mục độ chọn lọc kém trên status của order_item_parts để mở khóa Heap-Only Tuple (HOT) updates
-- khi nhân viên chuyển đổi trạng thái món (PENDING -> ACCEPTED -> SERVED)
DROP INDEX IF EXISTS idx_order_item_parts_status;

-- 3. Partial Index siêu nhẹ phục vụ truy vấn snapshot các bàn đang mở (mỗi 20s/socket event)
CREATE INDEX IF NOT EXISTS idx_table_sessions_open
ON table_sessions (tenant_id)
WHERE status = 'OPEN';

-- 4. Loại bỏ Sequential Scan khi tải hóa đơn có khuyến mãi
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_session
ON promotion_redemptions (session_id);

-- 5. Chỉ mục tìm kiếm phiên khách hàng theo phiên bàn
CREATE INDEX IF NOT EXISTS idx_guest_sessions_session
ON guest_sessions (session_id);

-- 6. Chỉ mục phục vụ thống kê món bán chạy và kiểm tra menu_item
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item
ON order_items (menu_item_id);

-- 7. Chỉ mục tìm kiếm yêu cầu phục vụ theo bàn
CREATE INDEX IF NOT EXISTS idx_service_requests_table
ON service_requests (table_id);

-- 8. Chỉ mục truy vết lịch sử trạng thái món ăn
CREATE INDEX IF NOT EXISTS idx_order_item_events_item
ON order_item_events (order_item_id);

-- 9. Chỉ mục truy vấn biến thể món ăn khi duyệt thực đơn
CREATE INDEX IF NOT EXISTS idx_menu_item_variants_item
ON menu_item_variants (menu_item_id);

-- 10. Chỉ mục truy vết nguồn tạo đơn món của nhân viên từ nhật ký kiểm toán (tránh Seq Scan audit_logs)
CREATE INDEX IF NOT EXISTS idx_audit_staff_order_source
ON audit_logs (tenant_id, resource_id, created_at, id)
WHERE action='STAFF_CREATE_ORDER' AND resource_type='order';

-- 11. Chỉ mục tối ưu truy vấn danh sách audit_logs theo cửa hàng và thời gian
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
ON audit_logs (tenant_id, created_at DESC);

-- 12. Chỉ mục tối ưu truy vấn danh sách đơn hàng theo cửa hàng và thời gian
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created
ON orders (tenant_id, created_at DESC);

