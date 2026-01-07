-- Refinamento da Administração Global e Cupons

-- 1. Tabela de Cupons Promocionais (SaaS)
CREATE TABLE IF NOT EXISTS system_coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    discount_percent NUMERIC,
    discount_value NUMERIC,
    trial_days INTEGER DEFAULT 0,
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Função para estatísticas globais do SaaS (Visão do Dono da Plataforma)
CREATE OR REPLACE FUNCTION get_system_global_stats()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    now_date TIMESTAMP WITH TIME ZONE := now();
    month_start TIMESTAMP WITH TIME ZONE := date_trunc('month', now());
    week_start TIMESTAMP WITH TIME ZONE := date_trunc('week', now());
    fortnight_start TIMESTAMP WITH TIME ZONE := now() - interval '15 days';
BEGIN
    SELECT jsonb_build_object(
        'revenue', jsonb_build_object(
            'month', (SELECT coalesce(sum(amount), 0) FROM finance_records WHERE type = 'income' AND created_at >= month_start AND tenant_id IS NULL), -- Assume que registros sem tenant_id são do SaaS
            'week', (SELECT coalesce(sum(amount), 0) FROM finance_records WHERE type = 'income' AND created_at >= week_start AND tenant_id IS NULL),
            'fortnight', (SELECT coalesce(sum(amount), 0) FROM finance_records WHERE type = 'income' AND created_at >= fortnight_start AND tenant_id IS NULL)
        ),
        'subscriptions', jsonb_build_object(
            'active', (SELECT count(*) FROM tenants WHERE plan != 'trial' AND (subscription_status = 'active' OR subscription_status IS NULL)), -- Simplificação
            'inactive', (SELECT count(*) FROM tenants WHERE subscription_status = 'canceled' OR subscription_status = 'past_due'),
            'trials', (SELECT count(*) FROM tenants WHERE plan = 'trial')
        ),
        'users', jsonb_build_object(
            'total_active', (SELECT count(*) FROM users WHERE last_seen_at >= (now() - interval '30 days')),
            'total_registered', (SELECT count(*) FROM users)
        ),
        'in_progress_revenue', (SELECT coalesce(sum(total_amount), 0) FROM sales WHERE status = 'pending') -- Vendas pendentes em todos os tenants
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
