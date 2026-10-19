-- Persist revocations across restarts and instances, storing only a token hash.
CREATE TABLE IF NOT EXISTS revoked_staff_tokens (
    token_hash TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revoked_staff_tokens_expiry ON revoked_staff_tokens (expires_at);
