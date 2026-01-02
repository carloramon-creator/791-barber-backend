-- 005_users_email_column.sql
-- Adiciona coluna de email em public.users e cria trigger para manter sincronizado com auth.users

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Função para sincronizar email na criação ou atualização
CREATE OR REPLACE FUNCTION public.handle_user_email_sync() 
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger na tabela auth.users
DROP TRIGGER IF EXISTS on_auth_user_email_sync ON auth.users;
CREATE TRIGGER on_auth_user_email_sync
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_email_sync();

-- Função para inserir email ao criar perfil (se usarmos triggers no public.users, mas geralmente o profile é criado via trigger no auth.users)
-- Vamos atualizar o trigger existente de criação de profile (que geralmente existe em projetos supabase) ou criar um novo se não existir.
-- Assumindo que o profile é criado manualmente ou via outro trigger. 
-- Vamos criar um trigger para garantir que ao inserir no public.users, se o email não vier, buscamos do auth.users.

CREATE OR REPLACE FUNCTION public.set_email_on_user_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NULL THEN
    NEW.email := (SELECT email FROM auth.users WHERE id = NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_insert_email ON public.users;
CREATE TRIGGER on_user_insert_email
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_email_on_user_insert();

-- Backfill de emails para usuários existentes
UPDATE public.users u
SET email = a.email
FROM auth.users a
WHERE u.id = a.id AND u.email IS NULL;
