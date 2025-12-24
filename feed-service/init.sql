-- Feed Service Database Schema
CREATE TABLE IF NOT EXISTS feed_items (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    post_id UUID NOT NULL,
    author_id UUID NOT NULL,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    post_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    score DECIMAL(10, 4) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    viewed_at TIMESTAMP,
    UNIQUE(user_id, post_id)
);

-- Function to calculate feed item score
-- Formula: (likes * 2 + comments * 5) * e^(-0.1 * age_in_days) * view_penalty
CREATE OR REPLACE FUNCTION calculate_feed_score(
    p_likes INTEGER,
    p_comments INTEGER,
    p_post_created_at TIMESTAMP,
    p_viewed_at TIMESTAMP
) RETURNS DECIMAL(10, 4) AS $$
DECLARE
    base_score DECIMAL(10, 4);
    age_in_days DECIMAL(10, 4);
    time_decay_factor DECIMAL(10, 4);
    view_penalty DECIMAL(10, 4);
    final_score DECIMAL(10, 4);
BEGIN
    -- Calculate base score from engagement
    base_score := (p_likes * 2 + p_comments * 5);
    
    -- Calculate age in days
    age_in_days := EXTRACT(EPOCH FROM (NOW() - p_post_created_at)) / 86400;
    
    -- Calculate time decay factor (exponential decay)
    time_decay_factor := EXP(-0.1 * age_in_days);
    
    -- Apply view penalty (90% reduction if viewed)
    view_penalty := CASE WHEN p_viewed_at IS NULL THEN 1.0 ELSE 0.1 END;
    
    -- Calculate final score
    final_score := base_score * time_decay_factor * view_penalty;
    
    RETURN ROUND(final_score, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to auto-update score on INSERT or UPDATE
CREATE OR REPLACE FUNCTION update_feed_score() RETURNS TRIGGER AS $$
BEGIN
    NEW.score := calculate_feed_score(
        NEW.likes,
        NEW.comments,
        NEW.post_created_at,
        NEW.viewed_at
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_update_feed_score ON feed_items;

-- Create trigger to automatically update score
CREATE TRIGGER trigger_update_feed_score
    BEFORE INSERT OR UPDATE OF likes, comments, post_created_at, viewed_at
    ON feed_items
    FOR EACH ROW
    EXECUTE FUNCTION update_feed_score();

-- Index for efficient feed retrieval
CREATE INDEX IF NOT EXISTS idx_feed_items_user_score ON feed_items(user_id, score DESC, created_at DESC);

-- Index for cleanup job
CREATE INDEX IF NOT EXISTS idx_feed_items_cleanup ON feed_items(viewed_at, created_at) WHERE viewed_at IS NOT NULL;

-- Index for post_id lookups (for score updates)
CREATE INDEX IF NOT EXISTS idx_feed_items_post_id ON feed_items(post_id);

-- Index for author_id lookups (for unfollow cleanup)
CREATE INDEX IF NOT EXISTS idx_feed_items_user_author ON feed_items(user_id, author_id);
