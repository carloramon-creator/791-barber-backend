-- Adiciona dados bancários na tabela tenants para geração de PIX
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS pix_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS pix_key_type VARCHAR(20) CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
ADD COLUMN IF NOT EXISTS bank_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS bank_agency VARCHAR(20),
ADD COLUMN IF NOT EXISTS bank_account VARCHAR(20),
ADD COLUMN IF NOT EXISTS bank_account_digit VARCHAR(5),
ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(255),
ADD COLUMN IF NOT EXISTS bank_account_doc VARCHAR(20); -- CPF/CNPJ do titular

-- Comentário: Estes campos serão usados para gerar o Payload BR Code.
