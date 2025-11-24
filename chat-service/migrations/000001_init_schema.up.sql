-- migrations/000001_init_schema.up.sql

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- Add more fields later (type, name, etc.)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    sender_id UUID NOT NULL, -- Giả lập user, sau này link với bảng User
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(50) NOT NULL, -- e.g., "MESSAGE"
    aggregate_id UUID NOT NULL,          -- message_id
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ             -- NULL = chưa xử lý
);

CREATE INDEX idx_outbox_unprocessed ON outbox(created_at) WHERE processed_at IS NULL;