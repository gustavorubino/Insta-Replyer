-- Safe migration to add instagram_recipient_id column
-- This is an incremental migration that won't affect existing data

-- Add the instagram_recipient_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'instagram_recipient_id'
    ) THEN
        ALTER TABLE users ADD COLUMN instagram_recipient_id VARCHAR;
    END IF;
END $$;

-- Add index for faster webhook lookups
CREATE INDEX IF NOT EXISTS idx_users_instagram_recipient_id ON users(instagram_recipient_id) WHERE instagram_recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_instagram_account_id ON users(instagram_account_id) WHERE instagram_account_id IS NOT NULL;
