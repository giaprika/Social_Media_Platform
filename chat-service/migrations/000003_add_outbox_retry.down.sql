-- migrations/000003_add_outbox_retry.down.sql
-- Rollback retry support for outbox events

DROP INDEX IF EXISTS idx_outbox_retry;
ALTER TABLE outbox DROP COLUMN IF EXISTS last_retry_at;
ALTER TABLE outbox DROP COLUMN IF EXISTS retry_count;
