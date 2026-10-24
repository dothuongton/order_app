-- Rollback Migration 009: Revert Gaeru Flow Experiment - Session Request and Claim

-- 1. Close all PENDING_APPROVAL sessions to ensure data integrity
UPDATE table_sessions
SET status = 'CLOSED', close_reason = 'MIGRATION_ROLLBACK'
WHERE status = 'PENDING_APPROVAL';

-- 2. Drop new indexes
DROP INDEX IF EXISTS idx_table_sessions_claimed_device;
DROP INDEX IF EXISTS idx_table_sessions_requester_device;
DROP INDEX IF EXISTS idx_table_sessions_pending_expiry;
DROP INDEX IF EXISTS idx_unique_active_session_per_table;

-- 3. Restore canonical OPEN-only partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_session_per_table
ON table_sessions (table_id)
WHERE status = 'OPEN';

-- 4. Drop added columns
ALTER TABLE table_sessions
    DROP COLUMN IF EXISTS request_id,
    DROP COLUMN IF EXISTS claim_version,
    DROP COLUMN IF EXISTS claimed_device_hash,
    DROP COLUMN IF EXISTS requester_device_hash,
    DROP COLUMN IF EXISTS requester_guest_name,
    DROP COLUMN IF EXISTS expires_at,
    DROP COLUMN IF EXISTS approved_by,
    DROP COLUMN IF EXISTS approved_at,
    DROP COLUMN IF EXISTS requested_at;
