-- Adicionar campos CPF e Photo URL na tabela de clientes
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS cpf VARCHAR(14),
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- CPF também deve ser único por tenant se fornecido (opcional se quiser validar unicidade)
-- CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_cpf_unique ON clients (tenant_id, cpf) WHERE cpf IS NOT NULL;
