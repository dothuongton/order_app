-- Migration 004: Deprecated default Super Admin bootstrap
-- Automated seeding of sample superadmin credentials in schema migrations has been eliminated (SEC-01 / Issue #25).
-- Production Super Admin bootstrap must be performed explicitly by operators via secure provisioning CLI.
SELECT 1;
