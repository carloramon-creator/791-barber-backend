-- Migration 048_allow_null_tenant_in_finance.sql
-- Allow tenant_id to be NULL in finance table for SaaS global records

ALTER TABLE public.finance ALTER COLUMN tenant_id DROP NOT NULL;

COMMENT ON COLUMN public.finance.tenant_id IS 'ID do tenant. NULL indica um registro global do SaaS.';
