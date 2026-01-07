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
            email: body.email,
            cnpj: body.cnpj,
            phone: body.phone || body.telefone || body.whatsapp,
            cep: body.cep,
            street: body.street || body.logradouro || body.rua || body.address,
            number: body.number || body.numero,
            complement: body.complement || body.complemento,
            neighborhood: body.neighborhood || body.bairro,
            city: body.city || body.cidade,
            state: body.state || body.estado || body.uf,
            logo_url: body.logo_url,
            // Dados Bancários e PIX
            pix_key: body.pix_key || body.chave_pix,
            pix_key_type: body.pix_key_type || body.tipo_chave_pix,
            bank_code: body.bank_code || body.cod_banco,
            bank_agency: body.bank_agency || body.agencia,
            bank_account: body.bank_account || body.conta,
            bank_account_digit: body.bank_account_digit || body.digito,
            bank_account_holder: body.bank_account_holder || body.titular,
            bank_account_doc: body.bank_account_doc || body.cpf_cnpj_conta,
            // Banco Inter API
            inter_client_id: body.inter_client_id,
            inter_client_secret: body.inter_client_secret,
            inter_cert_content: body.inter_cert_content,
            inter_key_content: body.inter_key_content,
            inter_pix_key: body.inter_pix_key
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
