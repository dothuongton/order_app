-- Migration 009: Gaeru Flow Experiment - Session Request and Claim (P1)
-- Adds pending approval lifecycle, device hashing, and claim exclusivity.

-- 1. Preflight check: Ensure no table has multiple active sessions (PENDING_APPROVAL or OPEN)
DO $$
DECLARE
    v_has_conflicts BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM table_sessions
        WHERE status IN ('PENDING_APPROVAL', 'OPEN')
        GROUP BY table_id
        HAVING COUNT(*) > 1
    ) INTO v_has_conflicts;

    IF v_has_conflicts THEN
        RAISE EXCEPTION 'Cannot apply migration 009: Found multiple active or pending sessions on a table. Operator cleanup required before creating unique constraint.';
    END IF;
END $$;

-- 2. Add columns to table_sessions
ALTER TABLE table_sessions
    ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS requester_guest_name VARCHAR(80),
    ADD COLUMN IF NOT EXISTS requester_device_hash VARCHAR(128),
    ADD COLUMN IF NOT EXISTS claimed_device_hash VARCHAR(128),
    ADD COLUMN IF NOT EXISTS claim_version INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS request_id VARCHAR(128);

-- 3. Replace index: drop old OPEN-only index and enforce unique active session per table (PENDING_APPROVAL or OPEN)
DROP INDEX IF EXISTS idx_unique_open_session_per_table;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_session_per_table
ON table_sessions (table_id)
WHERE status IN ('PENDING_APPROVAL', 'OPEN');

-- 4. Create lookup indexes for expiry cleanup and device lookups
CREATE INDEX IF NOT EXISTS idx_table_sessions_pending_expiry
ON table_sessions (expires_at)
WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS idx_table_sessions_requester_device
ON table_sessions (tenant_id, requester_device_hash)
WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS idx_table_sessions_claimed_device
ON table_sessions (tenant_id, claimed_device_hash)
WHERE status = 'OPEN';
