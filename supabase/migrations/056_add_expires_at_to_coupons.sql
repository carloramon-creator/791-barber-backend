-- Adiciona coluna expires_at na tabela system_coupons

ALTER TABLE system_coupons 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Comentário
COMMENT ON COLUMN system_coupons.expires_at IS 'Data de expiração do cupom';
