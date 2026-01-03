-- Migration 012: User Presence and Finance Categories

-- 1. Add last_seen_at to users for presence tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Create finance categories table
CREATE TABLE IF NOT EXISTS finance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('revenue', 'expense')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, name, type)
);

-- 3. Add category_id to finance table
ALTER TABLE finance ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES finance_categories(id) ON DELETE SET NULL;

-- 4. Enable RLS on finance_categories
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies for finance_categories
CREATE POLICY "tenant_isolation_finance_categories" ON finance_categories FOR ALL 
USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
)
WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

-- 6. Add finance_categories to realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE finance_categories;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;
