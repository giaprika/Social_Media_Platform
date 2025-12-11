-- migrations/000004_add_outbox_dlq.down.sql
-- Rollback Dead Letter Queue

DROP INDEX IF EXISTS idx_outbox_dlq_moved_at;
DROP INDEX IF EXISTS idx_outbox_dlq_aggregate_type;
DROP TABLE IF EXISTS outbox_dlq;
