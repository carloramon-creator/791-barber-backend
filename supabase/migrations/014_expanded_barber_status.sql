-- Migration 014: Barber Status Expansion
-- We expand the status to: online, offline, busy

-- 1. Drop existing constraint
ALTER TABLE barbers DROP CONSTRAINT IF EXISTS barbers_status_check;

-- 2. Add new constraint with expanded roles
ALTER TABLE barbers ADD CONSTRAINT barbers_status_check 
CHECK (status IN ('online', 'offline', 'busy'));

-- 3. Migrate existing data
UPDATE barbers SET status = 'online' WHERE status = 'available';

-- 4. Set default status for new barbers to offline
ALTER TABLE barbers ALTER COLUMN status SET DEFAULT 'offline';
