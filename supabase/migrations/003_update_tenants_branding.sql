-- 003_update_tenants_branding.sql
-- Adiciona campos de branding e contato à tabela tenants

ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS cnpj VARCHAR(20),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Criação do bucket de logs se ainda não existir (via SQL é limitado, mas podemos criar politica)
-- Nota: A criação do bucket em si geralmente é feita via API ou Dashboard, 
-- mas podemos garantir que a tabela storage.objects tenha políticas se necessário.
-- Assumindo que o bucket 'logos' será criado manualmente ou já existe.

-- Política de Storage para Logos (Exemplo genérico, ajustar conforme necessidade real de RLS no storage)
-- Permitir leitura pública de logos
-- CREATE POLICY "Public Access to Logos" ON storage.objects FOR SELECT USING ( bucket_id = 'logos' );
-- Permitir upload apenas para autenticados (Owners)
-- CREATE POLICY "Owners can upload logos" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'logos' AND auth.role() = 'authenticated' );
