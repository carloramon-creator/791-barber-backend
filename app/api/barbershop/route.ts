import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function GET(req: Request) {
    try {
        const { tenant, role } = await getCurrentUserAndTenant();
        // Allow barbears and owners to see the barbershop info
        if (!['owner', 'barber'].includes(role)) {
            // Depending on requirements client might need this too, sticking to owner/barber for now as "config"
            // Actually, for branding, everyone needs it. But this endpoint is for "config page".
            // The prompt says: "Carregar os dados atuais da barbearia do owner logado (via GET /api/barbershop)"
        }

        // We can just return the tenant object we already fetched with getCurrentUserAndTenant
        // ensuring it has the new fields
        return NextResponse.json(tenant);
    } catch (error: any) {
        console.error('[BACKEND] Error in GET barbershop:', error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

export async function PUT(req: Request) {
    try {
        const { tenant, role } = await getCurrentUserAndTenant();
        if (role !== 'owner') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const body = await req.json();

        // Filter allowed fields to update
        const updates = {
            name: body.name,
            cnpj: body.cnpj,
            phone: body.phone,
            address: body.address, // Manter por compatibilidade ou remover se quiser forçar novo formato
            cep: body.cep,
            street: body.street,
            number: body.number,
            complement: body.complement,
            neighborhood: body.neighborhood,
            city: body.city,
            state: body.state,
            logo_url: body.logo_url
        };

        // Remove undefined values
        Object.keys(updates).forEach(key => (updates as any)[key] === undefined && delete (updates as any)[key]);

        console.log(`[BACKEND] Updating barbershop ${tenant.id}. Data:`, JSON.stringify(updates, null, 2));

        const { data, error } = await supabaseAdmin
            .from('tenants')
            .update(updates)
            .eq('id', tenant.id)
            .select()
            .single();

        if (error) {
            console.error(`[BACKEND] Error updating barbershop ${tenant.id}:`, error);
            throw error;
        }

        console.log(`[BACKEND] Update successful for ${tenant.id}`);
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[BACKEND] Error in PUT barbershop:', error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
