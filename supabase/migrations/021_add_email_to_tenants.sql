-- Adiciona campo de email na tabela tenants para cadastro da barbearia
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS email VARCHAR(255);
