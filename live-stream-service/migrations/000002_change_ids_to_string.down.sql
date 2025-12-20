-- Rollback: Change id and user_id back to BIGINT
-- WARNING: This may fail if there are non-numeric IDs

-- Step 1: Add old columns back
ALTER TABLE live_sessions ADD COLUMN old_id BIGINT;
ALTER TABLE live_sessions ADD COLUMN old_user_id BIGINT;

-- Step 2: Copy data (this will fail if IDs are not numeric)
UPDATE live_sessions SET old_id = id::bigint, old_user_id = user_id::bigint;

-- Step 3: Drop constraints
DROP INDEX IF EXISTS idx_live_sessions_user_id;
ALTER TABLE live_sessions DROP CONSTRAINT IF EXISTS live_sessions_pkey;

-- Step 4: Drop string columns
ALTER TABLE live_sessions DROP COLUMN id;
ALTER TABLE live_sessions DROP COLUMN user_id;

-- Step 5: Rename columns back
ALTER TABLE live_sessions RENAME COLUMN old_id TO id;
ALTER TABLE live_sessions RENAME COLUMN old_user_id TO user_id;

-- Step 6: Add constraints back
ALTER TABLE live_sessions ADD PRIMARY KEY (id);
ALTER TABLE live_sessions ALTER COLUMN user_id SET NOT NULL;

-- Step 7: Recreate indexes
CREATE INDEX idx_live_sessions_user_id ON live_sessions(user_id);
