-- Cria tabela de itens individualizados da venda (Normalização)
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('service', 'product')),
  item_id UUID NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_tenant ON sale_items(tenant_id);

-- RLS
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_sale_items" ON sale_items FOR ALL 
USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
)
WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);
