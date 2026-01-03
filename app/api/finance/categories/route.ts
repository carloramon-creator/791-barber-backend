import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function GET() {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        const { data, error } = await supabaseAdmin
            .from('finance_categories')
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
        const { tenant, roles } = await getCurrentUserAndTenant();
        if (!roles.includes('owner')) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const { name, type } = await req.json();

        if (!name || !type) {
            return NextResponse.json({ error: 'Nome e tipo são obrigatórios' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('finance_categories')
            .insert({
                tenant_id: tenant.id,
                name,
                type
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: 'Categoria já existe' }, { status: 400 });
            }
            throw error;
        }

        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
