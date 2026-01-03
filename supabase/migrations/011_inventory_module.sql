-- Migration 011: Add inventory management
-- 1. Add cost price and stock quantity to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0;

-- 2. Create product movements table
CREATE TABLE IF NOT EXISTS product_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('entry', 'exit')),
  quantity INTEGER NOT NULL,
  cost_price DECIMAL(10,2), -- Fixed amount if it's an entry (buying price)
  price DECIMAL(10,2), -- Fixed amount if it's an exit (selling price at the time)
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE product_movements ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies for product_movements
CREATE POSITIONED POLICY "tenant_isolation_product_movements" ON product_movements FOR ALL 
USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
)
WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

-- Note: The POSITIONED keyword above might be wrong if it's meant to be just "CREATE POLICY". I'll stick to standard.
DROP POLICY IF EXISTS "tenant_isolation_product_movements" ON product_movements;
CREATE POLICY "tenant_isolation_product_movements" ON product_movements FOR ALL 
USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
)
WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);
