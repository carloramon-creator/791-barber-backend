-- Adicionar coluna metadata na tabela finance para suportar pagamentos SaaS e outras integrações
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finance' AND column_name = 'metadata') THEN
        ALTER TABLE finance ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;
