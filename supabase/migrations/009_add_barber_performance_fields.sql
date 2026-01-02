ALTER TABLE users 
ADD COLUMN IF NOT EXISTS avg_service_time INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS commission_type TEXT CHECK (commission_type IN ('fixed', 'percentage')) DEFAULT 'percentage',
ADD COLUMN IF NOT EXISTS commission_value NUMERIC(10,2) DEFAULT 50.00;
