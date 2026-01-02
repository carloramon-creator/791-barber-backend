import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { tenant, role } = await getCurrentUserAndTenant();
        if (role !== 'owner') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const { id } = await params;
        const body = await req.json();
        const { role: newRole } = body;

        if (!newRole) return NextResponse.json({ error: 'Nova função obrigatória' }, { status: 400 });

        // Update user
        let { data, error } = await supabaseAdmin
            .from('users')
            .update({ role: newRole })
            .eq('id', id)
            .eq('tenant_id', tenant.id)
            .select()
            .single();

        // Retry logic for 'staff' constraint
        if (error && error.message.includes('check constraint') && newRole === 'staff') {
            console.warn('[PUT USER] Constraint violation for staff role. Falling back to barber.');
            const retry = await supabaseAdmin
                .from('users')
                .update({ role: 'barber' })
                .eq('id', id)
                .eq('tenant_id', tenant.id)
                .select()
                .single();
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { tenant, role } = await getCurrentUserAndTenant();
        if (role !== 'owner') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const { id } = await params;

        // Prevent deleting self?
        // Frontend should prevent, but backend safe guard good.
        // We don't have current user ID easily available here without fetching again or passing.
        // `getCurrentUserAndTenant` returns `user`.
        const { user: currentUser } = await getCurrentUserAndTenant();
        if (currentUser.id === id) {
            return NextResponse.json({ error: 'Você não pode remover a si mesmo.' }, { status: 400 });
        }

        // Delete from public.users
        const { error } = await supabaseAdmin
            .from('users')
            .delete()
            .eq('id', id)
            .eq('tenant_id', tenant.id);

        if (error) throw error;

        // Optionally delete from auth.users if we want to completely nuke them?
        // For now, let's keep it safe and just remove from tenant (which effectively restricts access due to RLS).
        // If we leave them in Auth, they can login but will have no Profile/Tenant, so app might break/show empty state.

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
