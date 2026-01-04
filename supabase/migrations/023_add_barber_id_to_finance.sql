-- Migration 023: Add barber_id to finance table to track responsibility
ALTER TABLE finance 
ADD COLUMN IF NOT EXISTS barber_id UUID REFERENCES barbers(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_finance_barber_id ON finance(barber_id);
