-- 004_update_tenants_address.sql
-- Adiciona campos detalhados de endereço e tenta criar bucket de logos

ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS cep VARCHAR(10),
ADD COLUMN IF NOT EXISTS street VARCHAR(255),
ADD COLUMN IF NOT EXISTS number VARCHAR(20),
ADD COLUMN IF NOT EXISTS complement VARCHAR(255),
ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100),
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(2);

-- Tentativa de criação do bucket 'logos' via SQL (Supabase Storage)
-- Nota: Isso pode falhar dependendo das permissões do postgres role, mas é uma tentativa válida.
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Garantir política de acesso público para leitura
CREATE POLICY "Public Access to Logos" ON storage.objects FOR SELECT USING ( bucket_id = 'logos' );

-- Permitir upload apenas para autenticados (reforço)
CREATE POLICY "Authenticated can upload logos" ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'logos' AND auth.role() = 'authenticated' );
