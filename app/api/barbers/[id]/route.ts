import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { tenant, roles } = await getCurrentUserAndTenant();
        if (!roles.includes('owner') && !roles.includes('staff')) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const { id } = await params;
        const body = await req.json();

        // Regra Especial: Bloquear 'online' ou 'busy' se o usuário não estiver logado/ativo
        if (body.status === 'online' || body.status === 'busy') {
            const { data: barber } = await supabaseAdmin
                .from('barbers')
                .select('user_id')
                .eq('id', id)
                .single();

            if (barber?.user_id) {
                const { data: user } = await supabaseAdmin
                    .from('users')
                    .select('last_seen_at')
                    .eq('id', barber.user_id)
                    .single();

                const lastSeen = user?.last_seen_at ? new Date(user.last_seen_at) : null;
                const now = new Date();
                const diffMinutes = lastSeen ? (now.getTime() - lastSeen.getTime()) / 60000 : Infinity;

                if (diffMinutes > 90) {
                    return NextResponse.json({
                        error: 'O barbeiro precisa estar logado no sistema para ficar Online.'
                    }, { status: 400 });
                }
            }
        }

        // Remover campos que não devem ser atualizados via PATCH ou que podem causar erro
        const { id: _, created_at: __, tenant_id: ___, ...updates } = body;

        console.log(`[BACKEND] Updating barber ${id}:`, updates);

        const { data, error } = await supabaseAdmin
            .from('barbers')
            .update(updates)
            .eq('id', id)
            .eq('tenant_id', tenant.id)
            .select()
            .single();

        if (error) {
            console.error(`[BACKEND] Error updating barber ${id}:`, error);
            throw error;
        }

        // Se o barbeiro estiver vinculado a um usuário, atualizar os campos correspondentes no perfil do usuário
        if (data.user_id) {
            const userUpdates: any = {
                name: data.name,
                photo_url: data.photo_url,
                avg_service_time: data.avg_time_minutes,
            };
            if (data.commission_percentage !== undefined) {
                userUpdates.commission_type = 'percentage';
                userUpdates.commission_value = data.commission_percentage;
            }
            await supabaseAdmin.from('users').update(userUpdates).eq('id', data.user_id);
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[BACKEND] Error in PATCH barber:', error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { tenant, roles } = await getCurrentUserAndTenant();
        if (!roles.includes('owner') && !roles.includes('staff')) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const { id } = await params;

        // Buscar o barbeiro antes de deletar para ver se tem user_id vinculado
        const { data: barber } = await supabaseAdmin.from('barbers').select('user_id').eq('id', id).single();

        const { error } = await supabaseAdmin
            .from('barbers')
            .delete()
            .eq('id', id)
            .eq('tenant_id', tenant.id);

        if (error) throw error;

        // Se houver user_id vinculado, remover a role 'barber' do usuário
        if (barber?.user_id) {
            const { data: user } = await supabaseAdmin.from('users').select('roles').eq('id', barber.user_id).single();
            if (user && user.roles) {
                const newRoles = user.roles.filter((r: string) => r !== 'barber');
                await supabaseAdmin.from('users').update({
                    roles: newRoles,
                    role: newRoles[0] || 'staff' // Mantendo back-compat
                }).eq('id', barber.user_id);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
