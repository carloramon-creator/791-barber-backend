-- Migration to add nickname to users and barbers
DO $$ 
BEGIN
    -- 1. Add nickname to users table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'nickname') THEN
        ALTER TABLE users ADD COLUMN nickname TEXT;
    END IF;

    -- 2. Add nickname to barbers table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'barbers' AND column_name = 'nickname') THEN
        ALTER TABLE barbers ADD COLUMN nickname TEXT;
    END IF;
END $$;
