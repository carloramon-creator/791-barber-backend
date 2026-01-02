import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { tenant, role } = await getCurrentUserAndTenant();
        if (role !== 'owner') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const { id } = await params;
        const updates = await req.json();

        const { data, error } = await supabaseAdmin
            .from('services')
            .update(updates)
            .eq('id', id)
            .eq('tenant_id', tenant.id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { tenant, role } = await getCurrentUserAndTenant();
        if (role !== 'owner') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const { id } = await params;

        const { error } = await supabaseAdmin
            .from('services')
            .delete()
            .eq('id', id)
            .eq('tenant_id', tenant.id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
