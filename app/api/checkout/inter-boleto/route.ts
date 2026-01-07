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

        // 4. Preparar Payload do Boleto Inter V3
        // NOTA: Para boleto bancário, o Inter EXIGE CPF ou CNPJ real do pagador.
        // Se o tenant não tiver cpf_cnpj cadastrado, usamos um fallback mas avisamos que pode falhar.
        const { data: tenantData } = await supabaseAdmin
            .from('tenants')
            .select('cpf_cnpj, address_city, address_state, address_zip, address_street')
            .eq('id', tenant.id)
            .single();

        if (!tenantData?.cpf_cnpj) {
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
                cpfCnpj: tenantData.cpf_cnpj.replace(/\D/g, ''),
                nome: tenant.name.slice(0, 100),
                email: userProfile?.email || "pagamento@791barber.com",
                tipoPessoa: tenantData.cpf_cnpj.length > 11 ? "JURIDICA" : "FISICA",
                cep: tenantData.address_zip?.replace(/\D/g, '') || "00000000",
                numero: "SN",
                endereco: tenantData.address_street || "Endereço não informado",
                bairro: "Centro",
                cidade: tenantData.address_city || "Cidade",
                uf: tenantData.address_state || "SC"
            },
            dataVencimento: dueDateStr,
            valorNominal: amount.toFixed(2),
            dataEmissao: currentDate,
            mensagem: {
                linha1: `Assinatura 791 Barber - Plano ${plan}`,
                linha2: couponApplied ? `Cupom ${couponApplied} aplicado` : ""
            }
        };

        console.log('[SAAS BOLETO] Criando cobrança no Inter...');
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
            nossoNumero: interBoleto.nossoNumero,
            codigoBarras: interBoleto.codigoBarras,
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
