-- Criar tabela de clientes
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Phone deve ser único por tenant
CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_phone_unique
ON clients (tenant_id, phone);

-- Habilitar RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Política de isolamento
DROP POLICY IF EXISTS "tenant_isolation_clients" ON clients;
CREATE POLICY "tenant_isolation_clients"
ON clients
FOR ALL USING (tenant_id::text = auth.jwt()->>'tenant_id');

-- Atualizar client_queue para ter client_id
ALTER TABLE client_queue
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

-- Permitir acesso público (anon) à tabela clients para inserção via API pública
-- (Nota: A API pública usa supabaseAdmin (service_role), que ignora RLS, 
--  mas se fossemos usar anon client precisariamos de policys especificas.
--  Como a API pública de 'enter queue' cria o cliente, ela fará isso com credenciais admin ou
--  teremos que permitir insert para anonimo se usarmos o client anonimo.)
--  Para simplificar e manter segurança, manteremos o uso de supabaseAdmin nos endpoints públicos
--  e a policy padrão de tenant isolation protege o acesso via dashboard.
