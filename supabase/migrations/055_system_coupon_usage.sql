-- Adiciona tabela para rastrear uso de cupons

CREATE TABLE IF NOT EXISTS system_coupon_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES system_coupons(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    stripe_session_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT,
    discount_applied NUMERIC,
    UNIQUE(coupon_id, tenant_id) -- Cada tenant só pode usar um cupom uma vez
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon ON system_coupon_usage(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_tenant ON system_coupon_usage(tenant_id);

-- Função para incrementar contador de usos do cupom
CREATE OR REPLACE FUNCTION increment_coupon_usage(coupon_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE system_coupons
    SET current_uses = current_uses + 1
    WHERE id = coupon_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários
COMMENT ON TABLE system_coupon_usage IS 'Histórico de uso de cupons promocionais do SaaS';
COMMENT ON COLUMN system_coupon_usage.discount_applied IS 'Valor do desconto aplicado em reais';
COMMENT ON FUNCTION increment_coupon_usage IS 'Incrementa o contador de usos de um cupom de forma segura';
