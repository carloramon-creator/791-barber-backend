-- 007_update_plan_constraint.sql
-- Adicionar 'premium' e remover 'intermediate' dos valores permitidos

ALTER TABLE tenants 
DROP CONSTRAINT tenants_plan_check;

ALTER TABLE tenants 
ADD CONSTRAINT tenants_plan_check 
CHECK (plan IN ('basic', 'complete', 'premium'));
