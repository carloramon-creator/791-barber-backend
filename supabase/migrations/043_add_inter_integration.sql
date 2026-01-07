-- Adiciona campos para integração com Banco Inter (Pix API v2)
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS inter_client_id TEXT,
ADD COLUMN IF NOT EXISTS inter_client_secret TEXT,
ADD COLUMN IF NOT EXISTS inter_cert_content TEXT,
ADD COLUMN IF NOT EXISTS inter_key_content TEXT,
ADD COLUMN IF NOT EXISTS inter_pix_key TEXT;

COMMENT ON COLUMN tenants.inter_cert_content IS 'Conteúdo do arquivo .crt do Banco Inter';
COMMENT ON COLUMN tenants.inter_key_content IS 'Conteúdo do arquivo .key do Banco Inter';
