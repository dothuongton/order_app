/** SQL expression for the fixed orders alias `o`; snapshot names come only from server audit. */
export const ORDER_SOURCE_NAME_SQL = `CASE WHEN o.source='STAFF_POS' THEN (
    SELECT a.details->>'staffName' FROM audit_logs a
    WHERE a.tenant_id=o.tenant_id AND a.resource_id=o.id::text
      AND a.resource_type='order' AND a.action='STAFF_CREATE_ORDER'
    ORDER BY a.created_at,a.id LIMIT 1
) ELSE NULL END`;
