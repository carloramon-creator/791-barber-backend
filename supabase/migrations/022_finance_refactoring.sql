-- Migration 022: Finance and Barber Closing Refactoring

-- 1. Add is_paid to finance table
ALTER TABLE finance 
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT TRUE;

-- 2. Add barber_commission_paid and commission_value to sales
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS barber_commission_paid BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS commission_value DECIMAL(10,2) DEFAULT 0;

-- 3. Ensure we have indexes for performance
CREATE INDEX IF NOT EXISTS idx_finance_is_paid ON finance(is_paid);
CREATE INDEX IF NOT EXISTS idx_sales_barber_commission_paid ON sales(barber_commission_paid);
CREATE INDEX IF NOT EXISTS idx_finance_date ON finance(date);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
