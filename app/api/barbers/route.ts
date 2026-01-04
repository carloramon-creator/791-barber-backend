import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function GET() {
    try {
        const { tenant } = await getCurrentUserAndTenant();

        // 1. Buscar todos os usuários que têm a role 'barber'
        const { data: barberUsers, error: usersError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('tenant_id', tenant.id)
            .contains('roles', ['barber']);

        if (usersError) throw usersError;

        // 2. Para cada usuário barbeiro, garantir que existe uma entrada na tabela 'barbers'
        if (barberUsers && barberUsers.length > 0) {
            for (const user of barberUsers) {
                const { data: existingBarber } = await supabaseAdmin
                    .from('barbers')
                    .select('id, name')
                    .eq('tenant_id', tenant.id)
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (!existingBarber) {
                    console.log(`[BACKEND] Creating missing barber entry for user ${user.name}`);
                    await supabaseAdmin.from('barbers').insert({
                        tenant_id: tenant.id,
                        user_id: user.id,
                        name: user.name,
                        photo_url: user.photo_url,
                        avg_time_minutes: user.avg_service_time || 30,
                        commission_percentage: user.commission_value || 0,
                        is_active: true
                    });
                } else if (existingBarber.name !== user.name) {
                    console.log(`[BACKEND] Updating barber name for user ${user.name}`);
                    await supabaseAdmin.from('barbers')
                        .update({ name: user.name })
                        .eq('id', existingBarber.id);
                }
            }
        }

        // 3. Retornar a lista completa da tabela barbers
        const { data: barbers, error } = await supabaseAdmin
            .from('barbers')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('name');

        if (error) throw error;
        return NextResponse.json(barbers || []);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { tenant, roles } = await getCurrentUserAndTenant();
        if (!roles.includes('owner') && !roles.includes('staff')) {
            return NextResponse.json({ error: 'Somente o dono ou funcionários podem gerenciar barbeiros' }, { status: 403 });
        }

        const { name, photo_url, avg_time_minutes, commission_percentage, is_active } = await req.json();

        // Usamos supabaseAdmin para o INSERT para evitar erros de RLS 
        // A validação de tenant já foi feita acima no getCurrentUserAndTenant
        const { data: barber, error } = await supabaseAdmin
            .from('barbers')
            .insert({
                tenant_id: tenant.id,
                name,
                photo_url,
                avg_time_minutes: avg_time_minutes || 30,
                commission_percentage: commission_percentage || 0,
                is_active: is_active !== undefined ? is_active : true
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(barber);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
