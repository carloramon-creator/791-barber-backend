-- Add email column to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email TEXT;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);

-- Update products to have a default for stock_quantity if not present
-- (assuming it's already there based on previous context, but ensuring type consistency)
-- ALTER TABLE products ALTER COLUMN stock_quantity SET DEFAULT 0;
