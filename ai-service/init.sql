DROP TABLE IF EXISTS violations;
CREATE TABLE IF NOT EXISTS violations(
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,

    violation_type     VARCHAR(100) NOT NULL,
    description        TEXT,
    text_content              TEXT,
    image_content            BYTEA,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);