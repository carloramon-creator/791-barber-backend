-- Migration to ensure barbers are unique per user and synced
DO $$ 
BEGIN
    -- 1. Ensure unique constraint on (tenant_id, user_id)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'barbers_tenant_user_unique'
    ) THEN
        ALTER TABLE barbers ADD CONSTRAINT barbers_tenant_user_unique UNIQUE (tenant_id, user_id);
    END IF;

    -- 2. Synchronize any names that might be different
    UPDATE barbers b
    SET name = u.name,
        photo_url = u.photo_url
    FROM users u
    WHERE b.user_id = u.id
    AND (b.name != u.name OR b.photo_url != u.photo_url);

END $$;
