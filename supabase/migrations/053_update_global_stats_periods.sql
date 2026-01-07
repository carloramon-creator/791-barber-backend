-- Migration 053_update_global_stats_periods.sql
-- Add 'day' revenue to global stats

CREATE OR REPLACE FUNCTION get_system_global_stats()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'revenue', jsonb_build_object(
            'day', (SELECT coalesce(sum(value), 0) FROM finance WHERE type = 'revenue' AND created_at >= date_trunc('day', now()) AND tenant_id IS NULL),
            'week', (SELECT coalesce(sum(value), 0) FROM finance WHERE type = 'revenue' AND created_at >= (now() - interval '7 days') AND tenant_id IS NULL),
            'fortnight', (SELECT coalesce(sum(value), 0) FROM finance WHERE type = 'revenue' AND created_at >= (now() - interval '15 days') AND tenant_id IS NULL),
            'month', (SELECT coalesce(sum(value), 0) FROM finance WHERE type = 'revenue' AND created_at >= date_trunc('month', now()) AND tenant_id IS NULL)
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
        -- Faturamento total de todos os tenants (opcional, mas mantemos no JSON se precisar)
        'all_tenants_revenue', (SELECT coalesce(sum(total_amount), 0) FROM sales)
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
