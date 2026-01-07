-- Migration 046_saas_pix_charges.sql
CREATE TABLE IF NOT EXISTS public.saas_pix_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    txid TEXT UNIQUE NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, paid, expired
    pix_payload TEXT,
    qr_code_base64 TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_saas_pix_txid ON public.saas_pix_charges(txid);
CREATE INDEX IF NOT EXISTS idx_saas_pix_tenant ON public.saas_pix_charges(tenant_id);

COMMENT ON TABLE public.saas_pix_charges IS 'Controle de cobranças SaaS via Pix (Banco Inter)';
