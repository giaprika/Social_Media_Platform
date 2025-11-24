-- Migration script to add status column to existing users table
-- Run this if you already have a users table without the status column

-- Step 1: Create the enum type if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
        CREATE TYPE user_status AS ENUM ('active', 'banned', 'suspended');
    END IF;
END$$;

-- Step 2: Add status column with default value
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS status user_status NOT NULL DEFAULT 'active';

-- Step 3: Update existing users to 'active' if they are NULL (shouldn't happen with NOT NULL, but just in case)
UPDATE users SET status = 'active' WHERE status IS NULL;

-- Step 4: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

