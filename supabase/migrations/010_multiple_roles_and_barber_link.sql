-- Migration: Add user_id to barbers and multiple roles to users

-- 1. Add roles array to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT ARRAY['staff'];

-- 2. Migrate existing role to roles array
UPDATE users SET roles = ARRAY[role] WHERE roles IS NULL OR roles = ARRAY['staff'];

-- 3. Add user_id to barbers
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 4. Add unique constraint to avoid duplicate barbers for same user in same tenant
-- First, clean up if there are duplicates (unlikely in fresh setup but good practice)
-- ALTER TABLE barbers ADD CONSTRAINT barbers_tenant_user_id_key UNIQUE (tenant_id, user_id);

-- 5. Sync existing barbers if possible (optional, but good if we can match by name/tenant)
-- This is hard to do perfectly without manual intervention, so we'll skip the auto-sync of old data.
