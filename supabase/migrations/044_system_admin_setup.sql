-- Criação da estrutura de Administração Global do SaaS (Super Admin)

-- 1. Tabela de configurações globais do sistema
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Adiciona flag de super admin na tabela de usuários
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system_admin BOOLEAN DEFAULT false;

-- 3. Inserir configurações iniciais (Placeholders)
INSERT INTO system_settings (key, value, description) VALUES 
('stripe_config', '{"secret_key": "", "webhook_secret": "", "public_key": ""}', 'Configurações globais do Stripe para assinaturas SaaS'),
('inter_config', '{"client_id": "", "client_secret": "", "crt": "", "key": "", "pix_key": ""}', 'Configurações globais do Banco Inter para recebimentos da SaaS'),
('global_notices', '{"active": false, "message": ""}', 'Avisos globais para todos os donos de barbearia')
ON CONFLICT (key) DO NOTHING;

-- 4. Função para buscar estatísticas de um tenant para o super admin
CREATE OR REPLACE FUNCTION get_tenant_stats(tenant_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_attendances', (SELECT count(*) FROM client_queue WHERE tenant_id = tenant_uuid AND status = 'finished'),
        'total_users', (SELECT count(*) FROM users WHERE tenant_id = tenant_uuid),
        'total_sales', (SELECT count(*) FROM sales WHERE tenant_id = tenant_uuid),
        'total_revenue', (SELECT coalesce(sum(total_amount), 0) FROM sales WHERE tenant_id = tenant_uuid)
    ) INTO stats;
    RETURN stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
