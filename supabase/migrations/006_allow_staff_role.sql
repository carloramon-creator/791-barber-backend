-- 006_allow_staff_role.sql
-- Adicionar 'staff' aos valores permitidos na coluna role da tabela users

ALTER TABLE users 
DROP CONSTRAINT users_role_check;

ALTER TABLE users 
ADD CONSTRAINT users_role_check 
CHECK (role IN ('owner', 'barber', 'client', 'staff'));
