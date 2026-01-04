-- Adiciona colunas faltantes na tabela sales para rastreabilidade
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS barber_id UUID REFERENCES barbers(id),
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';

-- Adicionar índices para relatórios de performance
CREATE INDEX IF NOT EXISTS idx_sales_barber_date ON sales(barber_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_client_date ON sales(client_id, created_at DESC);
