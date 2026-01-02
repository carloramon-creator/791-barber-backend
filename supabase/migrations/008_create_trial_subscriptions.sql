-- 008_create_trial_subscriptions.sql
-- Tabela para gerenciar os períodos de teste grátis (7 dias)
-- ADAPTATION: Referencing 'tenants' instead of 'barbershops'

CREATE TABLE IF NOT EXISTS public.trial_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE, -- Changed from barbershop_id
  trial_starts_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  status TEXT DEFAULT 'active', -- 'active', 'expired', 'converted'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_trial_subscriptions_user_id ON public.trial_subscriptions(user_id);
CREATE INDEX idx_trial_subscriptions_tenant_id ON public.trial_subscriptions(tenant_id);

-- Enable RLS
ALTER TABLE public.trial_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Tenants can read their own detailed subscription info? 
-- Or maybe just public read for owner? For now, let's keep it simple: Owner sees it.
CREATE POLICY "owners_read_own_trial" ON public.trial_subscriptions
FOR SELECT USING (
    tenant_id IN (
        SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
);
