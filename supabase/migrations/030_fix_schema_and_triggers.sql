-- Super Migration to Fix Missing Columns and Triggers
-- Run this in your Supabase SQL Editor to resolve "Column not found" errors.

-- 1. Fix 'finance' table missing 'is_paid'
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finance' AND column_name = 'is_paid') THEN
        ALTER TABLE finance ADD COLUMN is_paid BOOLEAN DEFAULT TRUE;
        CREATE INDEX IF NOT EXISTS idx_finance_is_paid ON finance(is_paid);
    END IF;
END $$;

-- 2. Fix 'tenants' table missing 'email'
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'email') THEN
        ALTER TABLE tenants ADD COLUMN email TEXT;
        CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);
    END IF;
END $$;

-- 3. Fix 'sales' table missing commission fields
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'barber_commission_paid') THEN
        ALTER TABLE sales ADD COLUMN barber_commission_paid BOOLEAN DEFAULT FALSE;
        ALTER TABLE sales ADD COLUMN commission_value DECIMAL(10,2) DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_sales_barber_commission_paid ON sales(barber_commission_paid);
    END IF;
END $$;

-- 4. Ensure 'products' has 'stock_quantity' (should exist, but verifying)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'stock_quantity') THEN
        ALTER TABLE products ADD COLUMN stock_quantity INTEGER DEFAULT 0;
    END IF;
END $$;

-- 5. FUNCTION: Decrement Stock (Safe usage)
CREATE OR REPLACE FUNCTION decrement_stock(p_id UUID, p_qty INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity - p_qty
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- 6. TRIGGER: Update Stock on Movement (If you want automatic updates)
-- First remove old trigger if exists to avoid duplication errors
DROP TRIGGER IF EXISTS trg_update_stock_on_movement ON product_movements;
DROP FUNCTION IF EXISTS update_stock_from_movement();

CREATE OR REPLACE FUNCTION update_stock_from_movement()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'entry' THEN
        UPDATE products SET stock_quantity = stock_quantity + NEW.quantity WHERE id = NEW.product_id;
    ELSIF NEW.type = 'exit' THEN
        UPDATE products SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_stock_on_movement
AFTER INSERT ON product_movements
FOR EACH ROW
EXECUTE FUNCTION update_stock_from_movement();
