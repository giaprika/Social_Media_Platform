-- Add message type and media URL columns
ALTER TABLE messages 
ADD COLUMN type VARCHAR(50) DEFAULT 'TEXT' NOT NULL,
ADD COLUMN media_url TEXT,
ADD COLUMN media_metadata JSONB;

-- Add index for filtering by message type
CREATE INDEX idx_messages_type ON messages(type);

-- Add check constraint for message type
ALTER TABLE messages 
ADD CONSTRAINT chk_message_type 
CHECK (type IN ('TEXT', 'IMAGE', 'VIDEO', 'FILE'));

-- Add constraint: if type is IMAGE/VIDEO/FILE, media_url must not be null
ALTER TABLE messages 
ADD CONSTRAINT chk_media_has_url 
CHECK (
  (type = 'TEXT' AND media_url IS NULL) OR
  (type IN ('IMAGE', 'VIDEO', 'FILE') AND media_url IS NOT NULL)
);
