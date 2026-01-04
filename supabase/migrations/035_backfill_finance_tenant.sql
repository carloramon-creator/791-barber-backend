-- Emergency fix: Backfill tenant_id for orphaned finance records
-- This assigns all orphaned records to the first tenant found

DO $$
DECLARE
    default_tenant_id UUID;
    updated_count INTEGER;
BEGIN
    -- Get the first tenant (assuming single-tenant for now)
    SELECT id INTO default_tenant_id FROM tenants ORDER BY created_at LIMIT 1;
    
    IF default_tenant_id IS NOT NULL THEN
        -- Update finance records without tenant_id
        UPDATE finance 
        SET tenant_id = default_tenant_id 
        WHERE tenant_id IS NULL;
        
        GET DIAGNOSTICS updated_count = ROW_COUNT;
        RAISE NOTICE 'Updated % finance records with tenant_id %', updated_count, default_tenant_id;
    ELSE
        RAISE NOTICE 'No tenant found - skipping finance backfill';
    END IF;
END $$;
