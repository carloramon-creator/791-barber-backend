-- Renomeia a coluna 'total' para 'total_amount' na tabela sales para consistência com o backend
ALTER TABLE sales RENAME COLUMN total TO total_amount;
