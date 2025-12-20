-- Feed Service Database Schema
CREATE TABLE IF NOT EXISTS feed_items (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    post_id UUID NOT NULL,
    score DECIMAL(10, 4) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    viewed_at TIMESTAMP,
    UNIQUE(user_id, post_id)
);

-- Index for efficient feed retrieval
CREATE INDEX IF NOT EXISTS idx_feed_items_user_score ON feed_items(user_id, score DESC, created_at DESC);

-- Index for cleanup job
CREATE INDEX IF NOT EXISTS idx_feed_items_cleanup ON feed_items(viewed_at, created_at) WHERE viewed_at IS NOT NULL;

-- Index for post_id lookups (for score updates)
CREATE INDEX IF NOT EXISTS idx_feed_items_post_id ON feed_items(post_id);
