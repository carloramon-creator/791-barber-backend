-- Corrigir a referência de client_id na tabela sales
-- Antes apontava para users(id), mas deve apontar para clients(id)

-- 1. Remover a constraint incorreta (se existir com o nome padrão ou o que o Supabase gerou)
ALTER TABLE sales
DROP CONSTRAINT IF EXISTS sales_client_id_fkey;

-- 2. Recriar a constraint apontando para a tabela correta (clients)
ALTER TABLE sales
ADD CONSTRAINT sales_client_id_fkey
FOREIGN KEY (client_id)
REFERENCES clients(id);
