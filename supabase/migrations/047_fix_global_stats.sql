-- Migration 047_fix_global_stats.sql
-- Fix get_system_global_stats to use correctly named 'finance' table and SaaS records

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
            'month', (SELECT coalesce(sum(value), 0) FROM finance WHERE type = 'revenue' AND created_at >= month_start AND tenant_id IS NULL),
            'week', (SELECT coalesce(sum(value), 0) FROM finance WHERE type = 'revenue' AND created_at >= week_start AND tenant_id IS NULL),
            'fortnight', (SELECT coalesce(sum(value), 0) FROM finance WHERE type = 'revenue' AND created_at >= fortnight_start AND tenant_id IS NULL)
        ),
        'subscriptions', jsonb_build_object(
            'active', (SELECT count(*) FROM tenants WHERE plan != 'trial' AND (subscription_status = 'active' OR subscription_status IS NULL)),
            'inactive', (SELECT count(*) FROM tenants WHERE subscription_status = 'canceled' OR subscription_status = 'past_due'),
            'trials', (SELECT count(*) FROM tenants WHERE plan = 'trial')
        ),
        'users', jsonb_build_object(
            'total_active', (SELECT count(*) FROM users WHERE last_seen_at >= (now() - interval '30 days')),
            'total_registered', (SELECT count(*) FROM users)
        ),
        'in_progress_revenue', (SELECT coalesce(sum(total_amount), 0) FROM sales WHERE status = 'pending')
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_system_global_stats() IS 'Retorna estatísticas globais do SaaS usando a tabela finance corretamente.';
