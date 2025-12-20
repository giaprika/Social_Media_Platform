-- Drop trigger
DROP TRIGGER IF EXISTS update_live_sessions_updated_at ON live_sessions;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop indexes
DROP INDEX IF EXISTS idx_live_sessions_created_at;
DROP INDEX IF EXISTS idx_live_sessions_stream_key;
DROP INDEX IF EXISTS idx_live_sessions_status;
DROP INDEX IF EXISTS idx_live_sessions_user_id;

-- Drop table
DROP TABLE IF EXISTS live_sessions;

-- Drop enum type
DROP TYPE IF EXISTS session_status;
