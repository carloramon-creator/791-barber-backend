import { NextResponse } from 'next/server';
// Trigger Build: 11:10 BRT - GOL FINAL ⚽
import { getCurrentUserAndTenant, addCorsHeaders } from '@/app/lib/utils';
import { supabaseAdmin } from '@/app/lib/supabase';
import { InterAPIV3 } from '@/app/lib/inter-api-v3';

export async function OPTIONS(req: Request) {
    const response = new NextResponse(null, { status: 200 });
    return addCorsHeaders(req, response);
}

const PLAN_PRICES: Record<string, number> = {
    basic: 49.00,
    complete: 99.00,
    premium: 169.00
};

export async function POST(req: Request) {
    try {
        const { tenant, user } = await getCurrentUserAndTenant();
        if (!tenant || !user) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Não autenticado' }, { status: 401 }));
        }

        const { plan, coupon, tempId } = await req.json();
        let amount = PLAN_PRICES[plan];

        if (!amount) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Plano inválido' }, { status: 400 }));
        }

        // 1. Processar Cupom
        let discount = 0;
        let couponApplied = null;

        if (coupon && coupon.trim() !== '') {
            const code = String(coupon).trim().toUpperCase();
            const { data: couponData } = await supabaseAdmin
                .from('system_coupons')
                .select('*')
                .eq('code', code)
                .eq('is_active', true)
                .single();

            if (couponData) {
                couponApplied = code;
                if (couponData.discount_percent) {
                    discount = (amount * Number(couponData.discount_percent)) / 100;
                } else if (couponData.discount_value) {
                    discount = Number(couponData.discount_value);
                }
            }
        }

        amount = Math.max(0, amount - discount);
        const currentDate = new Date().toISOString().split('T')[0];
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 3);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // 2. Configurar Inter - Buscar do DB primeiro
        const { data: settingsData } = await supabaseAdmin
            .from('system_settings')
            .select('value')
            .eq('key', 'inter_config')
            .single();

        const dbConfig = settingsData?.value;
        const clientId = dbConfig?.client_id || process.env.INTER_CLIENT_ID;
        const certRaw = dbConfig?.crt || process.env.INTER_CERT_CONTENT || '';
        const keyRaw = dbConfig?.key || process.env.INTER_KEY_CONTENT || '';

        const cert = certRaw.replace(/\\n/g, '\n');
        const key = keyRaw.replace(/\\n/g, '\n');

        if (!clientId || !cert || !key) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Configuração do Inter incompleta' }, { status: 500 }));
        }

        const inter = new InterAPIV3({
            clientId,
            clientSecret: dbConfig?.client_secret || process.env.INTER_CLIENT_SECRET || '',
            cert, key
        });

        let doc = (tenant.cnpj || tenant.cpf || tenant.document || tenant.bank_account_doc || "").replace(/\D/g, '');

        if (!doc) {
            const { data: userData } = await supabaseAdmin.from('users').select('cpf').eq('id', user.id).single();
            if (userData?.cpf) doc = userData.cpf.replace(/\D/g, '');
        }

        if (!doc || doc.length < 11) {
            return addCorsHeaders(req, NextResponse.json({ error: 'CPF/CNPJ necessário para emitir boleto.' }, { status: 400 }));
        }

        const seuNumero = tempId || String(Date.now()).slice(-15);
        const payload = {
            seuNumero,
            pagador: {
                cpfCnpj: doc,
                tipoPessoa: doc.length > 11 ? "JURIDICA" : "FISICA",
                nome: tenant.name.substring(0, 100),
                cep: (tenant.address_zip?.replace(/\D/g, '') || tenant.cep?.replace(/\D/g, '') || "88000000").substring(0, 8),
                numero: (tenant.number || "SN").substring(0, 10),
                endereco: (tenant.street || tenant.address_street || "Endereço não informado").substring(0, 90),
                bairro: (tenant.neighborhood || tenant.address_neighborhood || "Centro").substring(0, 60),
                cidade: (tenant.city || tenant.address_city || "Cidade").substring(0, 60),
                uf: (tenant.state || tenant.address_state || "SC").substring(0, 2)
            },
            dataVencimento: dueDateStr,
            valorNominal: amount.toFixed(2),
            dataEmissao: currentDate,
            mensagem: {
                linha1: `Assinatura 791 Barber - Plano ${plan}`.substring(0, 80)
            }
        };

        // 3. REGISTRAR NO BANCO
        console.log('[INTER] Criando boleto...');
        let interRes = await inter.createBilling(payload);

        // A AP V3 do Inter pode demorar um pouco para gerar o nossoNumero
        const nossoNumero = interRes.nossoNumero || interRes.identificador;
        const isReady = !!nossoNumero;

        // 4. Salvar registro local
        console.log('[INTER] Salvando registro local...');
        await supabaseAdmin
            .from('finance')
            .insert({
                tenant_id: null,
                type: 'revenue',
                value: amount,
                description: `SaaS - Plano ${plan} (${tenant.name})`,
                date: currentDate,
                is_paid: false,
                metadata: {
                    nosso_numero: nossoNumero || 'PENDING',
                    txid: interRes.codigoSolicitacao || interRes.txid || 'N/A',
                    seu_numero: seuNumero,
                    tenant_id: tenant.id,
                    codigo_barras: interRes.codigoBarras,
                    linha_digitavel: interRes.linhaDigitavel,
                    method: 'boleto_inter'
                }
            });

        // Retorna imediatamente com o que temos. O frontend consultará o status depois.
        const pdfUrl = nossoNumero ? `/api/checkout/inter-boleto/pdf?nossoNumero=${nossoNumero}&codigoSolicitacao=${interRes.codigoSolicitacao || ''}` : null;

        return addCorsHeaders(req, NextResponse.json({
            success: true,
            pending: !isReady,
            nossoNumero: nossoNumero,
            codigoBarras: interRes.codigoBarras,
            linhaDigitavel: interRes.linhaDigitavel,
            amount: amount,
            pdfUrl
        }));

    } catch (error: any) {
        console.error('[CHECKOUT ERROR]', error);
        return addCorsHeaders(req, NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 }));
    }
}
