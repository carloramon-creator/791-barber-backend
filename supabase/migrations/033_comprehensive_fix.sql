-- Comprehensive Fix for Data Consistency

-- 1. Fix Product Movements Foreign Key
-- This ensures we can join product_movements with users to show who did the movement
DO $$ 
BEGIN
    -- Drop incorrect constraint if it exists (safety check)
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'product_movements_user_id_fkey') THEN
        ALTER TABLE product_movements DROP CONSTRAINT product_movements_user_id_fkey;
    END IF;

    -- Add correct constraint
    ALTER TABLE product_movements
    ADD CONSTRAINT product_movements_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id);
END $$;

-- 2. Backfill Commission Values for Past Sales
-- Updates sales where commission is 0 or null, using the barber's current commission rate
UPDATE sales s
SET commission_value = (s.total_amount * (b.commission_percentage / 100))
FROM barbers b
WHERE s.barber_id = b.id
  AND (s.commission_value IS NULL OR s.commission_value = 0)
  AND s.total_amount > 0;

-- 3. Ensure Tenant ID Consistency (Fix "Blackout")
-- If any essential record is missing tenant_id, default to the first found tenant (emergency fix)
DO $$
DECLARE
    default_tenant_id UUID;
BEGIN
    SELECT id INTO default_tenant_id FROM tenants LIMIT 1;

    IF default_tenant_id IS NOT NULL THEN
        UPDATE sales SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
        UPDATE product_movements SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
        UPDATE finance SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
        UPDATE barbers SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    END IF;
END $$;

-- 4. Fix Barber Status Consistency
-- Ensure all barbers have a valid status
UPDATE barbers SET status = 'offline' WHERE status IS NULL;
