-- Migration 013: Fix User Presence Default
-- We remove the default NOW() so new users or users without activity don't appear as "Active Now"
ALTER TABLE users ALTER COLUMN last_seen_at DROP DEFAULT;
ALTER TABLE users ALTER COLUMN last_seen_at SET DEFAULT NULL;

-- Update existing users to NULL so they don't appear active by default
UPDATE users SET last_seen_at = NULL WHERE last_seen_at = created_at;
