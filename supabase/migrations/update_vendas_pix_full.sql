-- =================================================================
-- SCRIPT ACUMULADO: VENDAS, FINANCEIRO E PIX
-- Execute todo este conteúdo no Editor SQL do Supabase.
-- =================================================================

-- 1. Melhorar Tabela de Vendas (Sales)
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS barber_id UUID REFERENCES barbers(id),
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id), -- Já corrigido para clients diretamente
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';

-- Índices de Performance
CREATE INDEX IF NOT EXISTS idx_sales_barber_date ON sales(barber_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_client_date ON sales(client_id, created_at DESC);

-- Renomear coluna total para total_amount (se ainda se chamar total)
DO $$
BEGIN
  IF EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_name='sales' and column_name='total')
  THEN
      ALTER TABLE sales RENAME COLUMN total TO total_amount;
  END IF;
END $$;

-- Garantir que a FK de client_id aponte para clients (caso já existisse errada)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_client_id_fkey') THEN
    ALTER TABLE sales DROP CONSTRAINT sales_client_id_fkey;
  END IF;
END $$;

ALTER TABLE sales
ADD CONSTRAINT sales_client_id_fkey
FOREIGN KEY (client_id)
REFERENCES clients(id);

-- 2. Criar tabela de Itens da Venda (para normalização)
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

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_tenant ON sale_items(tenant_id);

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'sale_items' AND policyname = 'tenant_isolation_sale_items'
    ) THEN
        CREATE POLICY "tenant_isolation_sale_items" ON sale_items FOR ALL 
        USING (
            tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
            tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
        )
        WITH CHECK (
            tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
            tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
        );
    END IF;
END $$;

-- 3. Adicionar Dados Bancários e PIX na tabela Tenants
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS pix_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS pix_key_type VARCHAR(20) CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
ADD COLUMN IF NOT EXISTS bank_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS bank_agency VARCHAR(20),
ADD COLUMN IF NOT EXISTS bank_account VARCHAR(20),
ADD COLUMN IF NOT EXISTS bank_account_digit VARCHAR(5),
ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(255),
ADD COLUMN IF NOT EXISTS bank_account_doc VARCHAR(20);

-- FIM DO SCRIPT
