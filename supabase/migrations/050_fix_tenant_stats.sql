-- Migration 050_fix_tenant_stats.sql
-- Fix get_tenant_stats to use correct column names

CREATE OR REPLACE FUNCTION get_tenant_stats(tenant_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_attendances', (SELECT count(*) FROM client_queue WHERE tenant_id = tenant_uuid AND status = 'finished'),
        'total_users', (SELECT count(*) FROM users WHERE tenant_id = tenant_uuid),
        'total_sales', (SELECT count(*) FROM sales WHERE tenant_id = tenant_uuid),
        'total_revenue', (SELECT coalesce(sum(total), 0) FROM sales WHERE tenant_id = tenant_uuid)
    ) INTO stats;
    RETURN stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_tenant_stats(UUID) IS 'Retorna estatísticas de um tenant usando as colunas corretas (total) da tabela sales.';
