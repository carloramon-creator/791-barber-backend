-- 009_add_subscription_fields.sql
-- Adicionar campos para gerenciar assinaturas do Stripe

ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer ON public.tenants(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_subscription ON public.tenants(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_tenants_subscription_status ON public.tenants(subscription_status);

-- Comentários para documentação
COMMENT ON COLUMN public.tenants.stripe_customer_id IS 'ID do cliente no Stripe (cus_xxx)';
COMMENT ON COLUMN public.tenants.stripe_subscription_id IS 'ID da assinatura no Stripe (sub_xxx)';
COMMENT ON COLUMN public.tenants.subscription_status IS 'Status da assinatura: trial, active, canceled, past_due';
COMMENT ON COLUMN public.tenants.subscription_current_period_end IS 'Data de término do período atual da assinatura';
