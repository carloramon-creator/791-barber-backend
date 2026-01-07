-- Migration 052_revamp_stats_logic.sql
-- Even more robust stats logic to ensure we don't return zeros if data exists

CREATE OR REPLACE FUNCTION get_tenant_stats(tenant_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_attendances', (SELECT count(*) FROM client_queue WHERE tenant_id = tenant_uuid AND status = 'finished'),
        'total_users', (SELECT count(*) FROM users WHERE tenant_id = tenant_uuid),
        'total_sales', (SELECT count(*) FROM sales WHERE tenant_id = tenant_uuid),
        'total_revenue', (
            SELECT coalesce(sum(total_amount), 0) FROM sales WHERE tenant_id = tenant_uuid
        ) + (
            -- Add faturamento directly from finance table if not linked to a sale
            SELECT coalesce(sum(value), 0) FROM finance WHERE tenant_id = tenant_uuid AND type = 'revenue' AND is_paid = true
            AND id NOT IN (SELECT (services->0->>'finance_id')::uuid FROM sales WHERE tenant_id = tenant_uuid AND services->0->>'finance_id' IS NOT NULL) -- Avoid double counting if linked
        )
    ) INTO stats;
    RETURN stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix global stats too
CREATE OR REPLACE FUNCTION get_system_global_stats()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    now_date TIMESTAMP WITH TIME ZONE := now();
    month_start TIMESTAMP WITH TIME ZONE := date_trunc('month', now());
    year_start TIMESTAMP WITH TIME ZONE := date_trunc('year', now());
BEGIN
    SELECT jsonb_build_object(
        'revenue', jsonb_build_object(
            'month', (SELECT coalesce(sum(value), 0) FROM finance WHERE type = 'revenue' AND created_at >= month_start AND tenant_id IS NULL),
            'week', (SELECT coalesce(sum(value), 0) FROM finance WHERE type = 'revenue' AND created_at >= (now() - interval '7 days') AND tenant_id IS NULL),
            'fortnight', (SELECT coalesce(sum(value), 0) FROM finance WHERE type = 'revenue' AND created_at >= (now() - interval '15 days') AND tenant_id IS NULL)
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
        'in_progress_revenue', (SELECT coalesce(sum(total_amount), 0) FROM sales WHERE paid = false)
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
