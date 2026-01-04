-- Add finance_id to sales to link commission payments to finance records
ALTER TABLE sales ADD COLUMN IF NOT EXISTS finance_id UUID REFERENCES finance(id) ON DELETE SET NULL;

-- Backfill tenant_id for sales and finance if missing (assuming single tenant scenario for now or simple fix)
-- This tries to fix the "blackout" if it's due to null tenant_ids
UPDATE sales SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
UPDATE finance SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
UPDATE product_movements SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
