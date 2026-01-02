import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { tenant, role } = await getCurrentUserAndTenant();
        if (role !== 'owner') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const { id } = await params;
        const body = await req.json();

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
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[BACKEND] Error in PATCH barber:', error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { tenant, role } = await getCurrentUserAndTenant();
        if (role !== 'owner') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const { id } = await params;

        const { error } = await supabaseAdmin
            .from('barbers')
            .delete()
            .eq('id', id)
            .eq('tenant_id', tenant.id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
