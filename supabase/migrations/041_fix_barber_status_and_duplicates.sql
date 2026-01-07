-- Migration 041: Fix Barber Status and Unique Constraints
-- 1. Update status constraint to allow 'available' and 'away'
ALTER TABLE barbers DROP CONSTRAINT IF EXISTS barbers_status_check;
ALTER TABLE barbers ADD CONSTRAINT barbers_status_check 
CHECK (status IN ('available', 'online', 'offline', 'busy', 'away'));

-- 2. Ensure nicknames and names are unique per barbershop (tenant)
-- First, let's clean up or just try to add (might fail if duplicates exist, but it's better to enforce now)
-- Note: Using nicknames as the primary unique identifier for display
ALTER TABLE barbers ADD CONSTRAINT barbers_tenant_nickname_unique UNIQUE (tenant_id, nickname);
ALTER TABLE barbers ADD CONSTRAINT barbers_tenant_name_unique UNIQUE (tenant_id, name);
