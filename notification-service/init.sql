DROP TABLE IF EXISTS notifications;

CREATE TABLE IF NOT EXISTS notifications(
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL,

    title_template      VARCHAR(200) NOT NULL,
    body_template       TEXT NOT NULL,

    notification_type   VARCHAR(50),           -- post_liked, post_commented, user_followed, etc.
    reference_id        VARCHAR(100),          -- post_id or other reference
    actors_count        INTEGER DEFAULT 1,     -- number of people who performed this action
    last_actor_id       UUID,                  -- last person who performed the action
    last_actor_name     VARCHAR(100),          -- last person's username

    is_readed           BOOLEAN NOT NULL DEFAULT FALSE,
    link_url            VARCHAR(500),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups of aggregated notifications
CREATE INDEX IF NOT EXISTS idx_notifications_aggregate 
ON notifications(user_id, notification_type, reference_id);