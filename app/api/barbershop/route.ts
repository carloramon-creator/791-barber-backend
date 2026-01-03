import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function GET(req: Request) {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        return NextResponse.json(tenant);
    } catch (error: any) {
        console.error('[BARBERSHOP GET] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

export async function PUT(req: Request) {
    try {
        const { tenant, roles } = await getCurrentUserAndTenant();
        if (!roles.includes('owner') && !roles.includes('staff')) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const body = await req.json();
        console.log('[BARBERSHOP PUT] Payload received:', JSON.stringify(body, null, 2));

        // Mapeamento explícito para garantir que salve independente do nome enviado (tradução)
        const updates = {
            name: body.name || body.nome,
            cnpj: body.cnpj,
            phone: body.phone || body.telefone || body.whatsapp,
            cep: body.cep,
            street: body.street || body.logradouro || body.rua || body.address,
            number: body.number || body.numero,
            complement: body.complement || body.complemento,
            neighborhood: body.neighborhood || body.bairro,
            city: body.city || body.cidade,
            state: body.state || body.estado || body.uf,
            logo_url: body.logo_url
        };

        // Limpeza de campos vazios ou undefined
        Object.keys(updates).forEach(key => (updates as any)[key] === undefined && delete (updates as any)[key]);

        console.log('[BARBERSHOP PUT] Final updates to DB:', JSON.stringify(updates, null, 2));

        const { data, error } = await supabaseAdmin
            .from('tenants')
            .update(updates)
            .eq('id', tenant.id)
            .select()
            .single();

        if (error) {
            console.error('[BARBERSHOP PUT] Database error:', error);
            throw error;
        }

        console.log('[BARBERSHOP PUT] Success for tenant:', tenant.id);
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[BARBERSHOP PUT] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
