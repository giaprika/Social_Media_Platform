-- Remove constraints
ALTER TABLE messages DROP CONSTRAINT IF EXISTS chk_media_has_url;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS chk_message_type;

-- Remove index
DROP INDEX IF EXISTS idx_messages_type;

-- Remove columns
ALTER TABLE messages 
DROP COLUMN IF EXISTS media_metadata,
DROP COLUMN IF EXISTS media_url,
DROP COLUMN IF EXISTS type;
