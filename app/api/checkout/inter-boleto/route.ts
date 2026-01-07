import { NextResponse } from 'next/server';
import { getCurrentUserAndTenant, addCorsHeaders } from '@/app/lib/utils';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getSystemInterClient } from '@/app/lib/inter-api';

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

        const { plan, coupon } = await req.json();
        let amount = PLAN_PRICES[plan];

        if (!amount) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Plano inválido' }, { status: 400 }));
        }

        // 1. Processar Cupom
        let discount = 0;
        let extraDays = 0;
        let couponApplied = null;

        if (coupon && coupon.trim() !== '') {
            const code = String(coupon).trim().toUpperCase();
            const { data: couponData } = await supabaseAdmin
                .from('system_coupons')
                .select('*')
                .eq('code', code)
                .eq('is_active', true)
                .single();

            if (!couponData) {
                return addCorsHeaders(req,
                    NextResponse.json({ error: 'Cupom inválido ou expirado' }, { status: 400 })
                );
            }

            couponApplied = couponData.code;
            if (couponData.discount_percent) {
                discount = amount * (Number(couponData.discount_percent) / 100);
            } else if (couponData.discount_value) {
                discount = Number(couponData.discount_value);
            }

            if (couponData.trial_days) {
                extraDays = Number(couponData.trial_days);
            }

            amount = Math.max(0, amount - discount);
        }

        // 2. Obter Cliente Inter
        const inter = await getSystemInterClient();
        if (!inter) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Pagamento via Boleto temporariamente indisponível (Configuração Inter ausente)' }, { status: 500 }));
        }

        // 3. Buscar Perfil do Usuário para obter Email e Nome
        const { data: userProfile } = await supabaseAdmin
            .from('users')
            .select('email, name')
            .eq('id', user.id)
            .single();

        // 4. Obter Dados do Pagador (Tenant)
        // Se o tenant não tiver cnpj/cpf_cnpj cadastrado, retornamos erro.
        const document = (tenant.cnpj || tenant.cpf_cnpj || '').replace(/\D/g, '');

        if (!document || document.length < 11) {
            return addCorsHeaders(req, NextResponse.json({
                error: 'Para gerar boleto, é necessário cadastrar o CPF ou CNPJ em Configurações > Barbearia.'
            }, { status: 400 }));
        }

        const currentDate = new Date().toISOString().split('T')[0];
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 3); // 3 dias de vencimento
        const dueDateStr = dueDate.toISOString().split('T')[0];

        const payload = {
            numDiasAgendaRecebimento: 30,
            pagador: {
                cpfCnpj: document,
                nome: tenant.name.slice(0, 100),
                email: userProfile?.email || "pagamento@791barber.com",
                tipoPessoa: document.length > 11 ? "JURIDICA" : "FISICA",
                cep: tenant.address_zip?.replace(/\D/g, '') || tenant.cep?.replace(/\D/g, '') || "00000000",
                numero: tenant.number || "SN",
                endereco: tenant.street || tenant.address_street || "Endereço não informado",
                bairro: tenant.neighborhood || tenant.address_neighborhood || "Centro",
                cidade: tenant.city || tenant.address_city || "Cidade",
                uf: tenant.state || tenant.address_state || "SC"
            },
            dataVencimento: dueDateStr,
            valorNominal: amount.toFixed(2),
            dataEmissao: currentDate,
            mensagem: {
                linha1: `Assinatura 791 Barber - Plano ${plan}`,
                linha2: couponApplied ? `Cupom ${couponApplied} aplicado` : ""
            }
        };

        try {
            console.log('[SAAS BOLETO] Criando cobrança no Inter...');
            console.log('[SAAS BOLETO] Payload:', JSON.stringify(payload, null, 2));
            const interBoleto = await inter.createBilling(payload);
            console.log('[SAAS BOLETO] Resposta Inter:', JSON.stringify(interBoleto));

            // 5. Salvar registro local (opcional, mas recomendado para tracking)
            await supabaseAdmin
                .from('finance')
                .insert({
                    tenant_id: null,
                    type: 'revenue',
                    value: amount,
                    description: `Boleto SaaS Pendente - Plano ${plan} (${tenant.name})`,
                    date: currentDate,
                    is_paid: false,
                    metadata: {
                        nosso_numero: interBoleto.nossoNumero,
                        txid: interBoleto.txid,
                        tenant_id: tenant.id
                    }
                });

            return addCorsHeaders(req, NextResponse.json({
                success: true,
                nossoNumero: interBoleto.nossoNumero, // Keep consistent structure
                codigoBarras: interBoleto.codigoBarras, // Keep consistent structure
                linhaDigitavel: interBoleto.linhaDigitavel,
                // Use Proxy URL to avoid CORS/Auth issues on frontend
                pdfUrl: `${process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.791barber.com'}/api/checkout/inter-boleto/pdf?nossoNumero=${interBoleto.nossoNumero}`
            }));
        } catch (interError: any) {
            console.error('[SAAS BOLETO INTER ERROR]', interError);
            console.error('[SAAS BOLETO INTER ERROR DETAILS]', JSON.stringify(interError));
            return addCorsHeaders(req, NextResponse.json({ error: `Erro Inter: ${interError.message}` }, { status: 500 }));
        }
        linhaDigitavel: interBoleto.linhaDigitavel,
            pdfUrl: `https://api.791barber.com/api/checkout/inter-boleto/pdf?nossoNumero=${interBoleto.nossoNumero}`
    }));

} catch (error: any) {
    console.error('[SAAS BOLETO CHECKOUT ERROR]', error);

    let msg = error.message;
    if (msg.includes('Inter Billing Error')) {
        msg = "Erro no Banco Inter: Verifique se os dados da barbearia (Endereço/CPF/CNPJ) estão corretos.";
    }

    return addCorsHeaders(req, NextResponse.json({ error: msg }, { status: 500 }));
}
}
