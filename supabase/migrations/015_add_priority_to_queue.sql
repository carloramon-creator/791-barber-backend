-- Adicionar campo de prioridade à fila de clientes
ALTER TABLE client_queue
ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT FALSE;

-- Adicionar campo de telefone do cliente (para exibição rápida)
ALTER TABLE client_queue
ADD COLUMN IF NOT EXISTS client_phone VARCHAR(20);

-- Criar índice para melhorar performance de ordenação por prioridade
CREATE INDEX IF NOT EXISTS idx_client_queue_priority_position 
ON client_queue(barber_id, is_priority DESC, position ASC) 
WHERE status = 'waiting';
