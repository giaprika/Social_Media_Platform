ALTER TABLE conversations ADD COLUMN last_message_content TEXT;
ALTER TABLE conversations ADD COLUMN last_message_at TIMESTAMPTZ;

CREATE TABLE conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    user_id UUID NOT NULL,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conversations_last_message_at ON conversations(last_message_at DESC);
