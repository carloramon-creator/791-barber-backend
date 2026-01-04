-- Add FK to product_movements if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'product_movements_user_id_fkey'
    ) THEN
        ALTER TABLE product_movements
        ADD CONSTRAINT product_movements_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
    END IF;
END $$;
