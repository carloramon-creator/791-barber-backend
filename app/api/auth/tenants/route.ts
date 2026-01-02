import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/app/lib/supabase';

/**
 * Registra uma nova barbearia (tenant) e define o usuário logado como dono.
 */
export async function POST(req: Request) {
    try {
        const { name, plan } = await req.json();
        const client = await supabase();

        // Pegar usuário logado via Supabase Auth
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        // 1. Criar o tenant
        // Usamos admin para garantir a criação mesmo se o RLS restringir por tenant_id (que ainda não temos no JWT)
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .insert({ name, plan: plan || 'basic' })
            .select()
            .single();

        if (tenantError) throw tenantError;

        // 2. Vincular o usuário como dono no banco operacional (users)
        const { error: userError } = await supabaseAdmin
            .from('users')
            .insert({
                id: user.id,
                tenant_id: tenant.id,
                role: 'owner',
                name: user.user_metadata.full_name || name,
            });

        if (userError) throw userError;

        return NextResponse.json({ tenant, message: 'Barbearia criada com sucesso' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
