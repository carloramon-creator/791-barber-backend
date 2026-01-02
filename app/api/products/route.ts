import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function GET() {
    try {
        const { tenant } = await getCurrentUserAndTenant();

        // Usamos supabaseAdmin para a listagem para garantir que o RLS não 
        // "esconda" os dados em ambiente de desenvolvimento. 
        // O filtro por tenant_id garante a segurança.
        const { data, error } = await supabaseAdmin
            .from('products')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('name');

        if (error) throw error;
        return NextResponse.json(data || []);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        const { name, price } = await req.json();

        const { data, error } = await supabaseAdmin
            .from('products')
            .insert({ name, price, tenant_id: tenant.id })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
