-- Add recurrence fields to finance table
ALTER TABLE finance 
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recurrence_period VARCHAR(20) CHECK (recurrence_period IN ('day', 'week', 'fortnight', 'month')),
ADD COLUMN IF NOT EXISTS recurrence_count INTEGER DEFAULT 1;
