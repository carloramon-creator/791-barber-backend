import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

/**
 * Permite ao barbeiro logado gerenciar seu próprio status (online/offline/busy)
 */
export async function GET() {
    try {
        const { user, tenant, roles } = await getCurrentUserAndTenant();

        const { data: barber, error } = await supabaseAdmin
            .from('barbers')
            .select('*')
            .eq('tenant_id', tenant.id)
            .eq('user_id', user.id)
            .single();

        if (error) {
            return NextResponse.json({ error: 'Perfil de barbeiro não encontrado' }, { status: 404 });
        }

        return NextResponse.json(barber);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const { user, tenant } = await getCurrentUserAndTenant();
        const { status } = await req.json();

        if (!['online', 'offline', 'busy'].includes(status)) {
            return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
        }

        const { data: updated, error } = await supabaseAdmin
            .from('barbers')
            .update({ status })
            .eq('tenant_id', tenant.id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(updated);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
