-- Migration 006: Protect table history and accounting ledger (DATA-01)
-- Prevent cascading deletion of closed sessions, bills, and settlements when tables are deleted.

ALTER TABLE table_sessions DROP CONSTRAINT IF EXISTS table_sessions_table_id_fkey;
ALTER TABLE table_sessions
    ADD CONSTRAINT table_sessions_table_id_fkey
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE RESTRICT;
