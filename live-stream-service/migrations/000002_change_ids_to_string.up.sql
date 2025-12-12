-- Migration: Change id to NanoID (string) and user_id to UUID (string)

-- Step 1: Add new columns
ALTER TABLE live_sessions ADD COLUMN new_id VARCHAR(21);
ALTER TABLE live_sessions ADD COLUMN new_user_id VARCHAR(36);

-- Step 2: Copy data (convert existing int IDs to string for backward compatibility)
UPDATE live_sessions SET new_id = id::text, new_user_id = user_id::text;

-- Step 3: Drop old constraints and indexes
DROP INDEX IF EXISTS idx_live_sessions_user_id;
ALTER TABLE live_sessions DROP CONSTRAINT IF EXISTS live_sessions_pkey;

-- Step 4: Drop old columns
ALTER TABLE live_sessions DROP COLUMN id;
ALTER TABLE live_sessions DROP COLUMN user_id;

-- Step 5: Rename new columns
ALTER TABLE live_sessions RENAME COLUMN new_id TO id;
ALTER TABLE live_sessions RENAME COLUMN new_user_id TO user_id;

-- Step 6: Add constraints
ALTER TABLE live_sessions ADD PRIMARY KEY (id);
ALTER TABLE live_sessions ALTER COLUMN id SET NOT NULL;
ALTER TABLE live_sessions ALTER COLUMN user_id SET NOT NULL;

-- Step 7: Recreate indexes
CREATE INDEX idx_live_sessions_user_id ON live_sessions(user_id);
