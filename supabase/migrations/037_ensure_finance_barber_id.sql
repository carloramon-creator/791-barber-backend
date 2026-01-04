-- EMERGENCY FIX: Ensure barber_id exists in finance
-- This script is more aggressive to ensure the column is added

DO $$ 
BEGIN
    -- 1. Ensure column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'finance' AND column_name = 'barber_id'
    ) THEN
        ALTER TABLE finance ADD COLUMN barber_id UUID;
    END IF;

    -- 2. Add foreign key if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'finance_barber_id_fkey_v2'
    ) THEN
        ALTER TABLE finance
        ADD CONSTRAINT finance_barber_id_fkey_v2
        FOREIGN KEY (barber_id) REFERENCES barbers(id)
        ON DELETE SET NULL;
    END IF;

    -- 3. Refresh PostgREST schema cache (hacky way by making a small comment change)
    COMMENT ON TABLE finance IS 'Finance records for barbershop management';
END $$;
