
-- ATUALIZAÇÃO CRÍTICA DE RLS (ROW LEVEL SECURITY)
-- Motivo: Migração da tabela 'tenants_users' para coluna direta 'users.tenant_id'
-- Isso garante que usuários vejam apenas dados do seu próprio tenant.

-- 1. Tenants (Quem pode ver?)
-- Donos podem ver seu próprio tenant
DROP POLICY IF EXISTS "Users can view own tenant" ON tenants;
CREATE POLICY "Users can view own tenant" ON tenants
    FOR SELECT
    USING (
        id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- 2. Barbers
DROP POLICY IF EXISTS "Users can view barbers of own tenant" ON barbers;
CREATE POLICY "Users can view barbers of own tenant" ON barbers
    FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- 3. Services
DROP POLICY IF EXISTS "Users can view services of own tenant" ON services;
CREATE POLICY "Users can view services of own tenant" ON services
    FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- 4. Products
DROP POLICY IF EXISTS "Users can view products of own tenant" ON products;
CREATE POLICY "Users can view products of own tenant" ON products
    FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- 5. Appointments / Client Queue
DROP POLICY IF EXISTS "Users can view queue of own tenant" ON client_queue;
CREATE POLICY "Users can view queue of own tenant" ON client_queue
    FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- 6. Users (Ver colegas)
DROP POLICY IF EXISTS "Users can view colleagues" ON users;
CREATE POLICY "Users can view colleagues" ON users
    FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );
