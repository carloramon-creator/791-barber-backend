-- Adiciona campo para controlar ambiente do Inter (sandbox ou production)

-- Atualiza a configuração do Inter para incluir o campo environment
UPDATE system_settings 
SET value = jsonb_set(
    value, 
    '{environment}', 
    '"production"'::jsonb
)
WHERE key = 'inter_config';

-- Adiciona comentário explicativo
COMMENT ON TABLE system_settings IS 'Configurações globais do sistema. O campo inter_config.environment pode ser "sandbox" ou "production"';
