DROP TABLE notifications;

CREATE TABLE IF NOT EXISTS notifications(
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL,

    title_template      VARCHAR(200) NOT NULL,
    body_template       TEXT NOT NULL,

    description         TEXT,

    is_readed           BOOLEAN NOT NULL DEFAULT FALSE,
    link_url           VARCHAR(500),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);