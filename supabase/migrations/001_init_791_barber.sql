-- 001_init_791_barber.sql
-- Script de inicialização idempotente (pode ser executado várias vezes)

-- 1. Tabela de Tenants (Barbearias)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  plan VARCHAR(20) NOT NULL CHECK (plan IN ('basic', 'intermediate', 'complete')) DEFAULT 'basic',
  stripe_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'barber', 'client')),
  name VARCHAR(255),
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Barbeiros
CREATE TABLE IF NOT EXISTS barbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  photo_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'busy')),
  avg_time_minutes INTEGER NOT NULL DEFAULT 30,
  commission_percentage DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Fila de Clientes (Fichas)
CREATE TABLE IF NOT EXISTS client_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL REFERENCES barbers(id),
  client_id UUID REFERENCES users(id),
  client_name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'attending', 'finished', 'cancelled')),
  position INTEGER NOT NULL,
  estimated_time_minutes INTEGER,
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Serviços e Produtos
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Vendas
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_queue_id UUID NOT NULL REFERENCES client_queue(id),
  services JSONB,   -- [{"id": "uuid", "qty": 1}]
  products JSONB,   -- [{"id": "uuid", "qty": 2}]
  total DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'card', 'pix')),
  pix_payload TEXT,
  paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Financeiro
CREATE TABLE IF NOT EXISTS finance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('revenue', 'expense')),
  value DECIMAL(10,2) NOT NULL,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance ENABLE ROW LEVEL SECURITY;

-- Limpar políticas existentes para evitar erros de duplicata ao re-executar
DO $$ 
DECLARE 
  pol RECORD;
BEGIN
  FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename);
  END LOOP;
END $$;

-- Recriar Políticas de RLS
CREATE POLICY "tenant_isolation_tenants" ON tenants FOR ALL USING (
    id::text = (auth.jwt() ->> 'tenant_id') OR 
    id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "allow_users_read_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "tenant_isolation_users" ON users FOR ALL USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    id = auth.uid()
);

CREATE POLICY "tenant_isolation_barbers" ON barbers FOR ALL 
USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
)
WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "tenant_isolation_client_queue" ON client_queue FOR ALL 
USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
)
WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "tenant_isolation_services" ON services FOR ALL 
USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
)
WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "tenant_isolation_products" ON products FOR ALL 
USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
)
WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "tenant_isolation_sales" ON sales FOR ALL 
USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
)
WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "tenant_isolation_finance" ON finance FOR ALL 
USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
)
WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id') OR 
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

-- 8. Gatilho para sincronizar tenant_id com o JWT do Supabase (app_metadata)
CREATE OR REPLACE FUNCTION public.sync_user_tenant_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant_id', NEW.tenant_id)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_tenant_sync ON public.users;
CREATE TRIGGER on_user_tenant_sync
  AFTER INSERT OR UPDATE OF tenant_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_tenant_to_auth();

-- 9. Configurar Supabase Realtime (Evitar erro se já estiver na publicação)
DO $$
BEGIN
  -- Tentar adicionar as tabelas à publicação. Se falhar (ex: já existem), o script continua.
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE client_queue, barbers, sales, finance;
  EXCEPTION WHEN OTHERS THEN
    -- Já estão na publicação ou publicação não existe
    NULL;
  END;
END $$;
