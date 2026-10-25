-- Source labels read the immutable staff-name snapshot; avoid scanning all audit logs.
CREATE INDEX IF NOT EXISTS idx_audit_staff_order_source
ON audit_logs (tenant_id, resource_id, created_at, id)
WHERE action='STAFF_CREATE_ORDER' AND resource_type='order';
