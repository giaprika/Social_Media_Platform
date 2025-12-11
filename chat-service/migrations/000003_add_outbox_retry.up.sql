-- migrations/000003_add_outbox_retry.up.sql
-- Add retry support for outbox events

ALTER TABLE outbox ADD COLUMN retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN last_retry_at TIMESTAMPTZ;

-- Index for finding events that need retry (with backoff consideration)
CREATE INDEX idx_outbox_retry ON outbox(retry_count, last_retry_at) WHERE processed_at IS NULL;
