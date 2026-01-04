-- Fix missing foreign key relationships

-- 1. Fix finance -> barbers relationship
-- The finance table should have barber_id linking to barbers
DO $$ 
BEGIN
    -- Check if column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'finance' AND column_name = 'barber_id'
    ) THEN
        ALTER TABLE finance ADD COLUMN barber_id UUID REFERENCES barbers(id);
    END IF;

    -- Add FK if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'finance_barber_id_fkey'
    ) THEN
        ALTER TABLE finance
        ADD CONSTRAINT finance_barber_id_fkey
        FOREIGN KEY (barber_id) REFERENCES barbers(id);
    END IF;
END $$;

-- 2. Fix sale_items -> products relationship
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'sale_items_product_id_fkey'
          AND table_name = 'sale_items'
    ) THEN
        -- First, ensure the column exists and has proper type
        ALTER TABLE sale_items 
        ALTER COLUMN item_id TYPE UUID USING item_id::uuid;
        
        -- Note: We can't add a direct FK because item_id can point to EITHER products OR services
        -- This is a polymorphic relationship. We'll handle it differently.
        -- The error suggests Supabase is trying to auto-join, but we need to be explicit in queries.
    END IF;
END $$;

-- 3. Fix sale_items -> services relationship (same polymorphic issue)
-- No direct FK needed, but we ensure the column is UUID

-- 4. Ensure all critical FKs exist
DO $$ 
BEGIN
    -- sales -> barbers
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'sales_barber_id_fkey'
    ) THEN
        ALTER TABLE sales
        ADD CONSTRAINT sales_barber_id_fkey
        FOREIGN KEY (barber_id) REFERENCES barbers(id);
    END IF;

    -- barbers -> users
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'barbers_user_id_fkey'
    ) THEN
        ALTER TABLE barbers
        ADD CONSTRAINT barbers_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
    END IF;
END $$;
