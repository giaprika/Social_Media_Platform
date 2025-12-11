-- migrations/000004_add_outbox_dlq.up.sql
-- Dead Letter Queue for failed outbox events

CREATE TABLE outbox_dlq (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_event_id UUID NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    error_message TEXT,
    retry_count INT NOT NULL,
    original_created_at TIMESTAMPTZ NOT NULL,
    moved_to_dlq_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying DLQ by aggregate type
CREATE INDEX idx_outbox_dlq_aggregate_type ON outbox_dlq(aggregate_type);

-- Index for querying DLQ by time (for cleanup/monitoring)
CREATE INDEX idx_outbox_dlq_moved_at ON outbox_dlq(moved_to_dlq_at DESC);
