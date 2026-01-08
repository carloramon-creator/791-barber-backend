import { NextResponse } from 'next/server';
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

        const { plan, coupon } = await req.json();
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
            } else {
                return addCorsHeaders(req,
                    NextResponse.json({ error: 'Cupom inválido ou expirado' }, { status: 400 })
                );
            }
        }

        amount = Math.max(0, amount - discount);
        const currentDate = new Date().toISOString().split('T')[0];
        const dueDate = new Date();
        dueDate.setHours(dueDate.getHours() + 24); // Pix expira em 24h
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // 2. Garantir documento CPF/CNPJ
        // Tenta pegar CNPJ do tenant, ou CPF do tenant (se tiver)
        let doc = (tenant.cnpj || tenant.cpf || tenant.document || "").replace(/\D/g, '');

        // Se não achou no tenant, busca no usuário logado
        if (!doc) {
            const { data: userData } = await supabaseAdmin
                .from('users')
                .select('cpf')
                .eq('id', user.id)
                .single();

            if (userData && userData.cpf) {
                doc = userData.cpf.replace(/\D/g, '');
            }
        }

        if (!doc || doc.length < 11) {
            return addCorsHeaders(req, NextResponse.json({
                error: 'Para gerar Pix, é necessário cadastrar um CPF ou CNPJ válido nas configurações da sua barbearia ou no seu perfil de usuário.'
            }, { status: 400 }));
        }

        // 3. Integrar com Inter (V3)
        const cert = (process.env.INTER_CERT_CONTENT || '').replace(/\\n/g, '\n');
        const key = (process.env.INTER_KEY_CONTENT || '').replace(/\\n/g, '\n');

        if (!process.env.INTER_CLIENT_ID || !cert || !key) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Configuração do Inter incompleta no servidor' }, { status: 500 }));
        }

        const inter = new InterAPIV3({
            clientId: process.env.INTER_CLIENT_ID,
            clientSecret: process.env.INTER_CLIENT_SECRET || '',
            cert: cert,
            key: key
        });

        // Payload para Cobrança Imediata Pix (Boleto Híbrido ou Cobrança Imediata)
        // Na V3 a rota POST /cobranca/v3/cobrancas gera um boleto com Pix. 
        // O campo 'pix.chave' não é necessário na criação, o Inter gera o QR Code automaticamente.

        const payload = {
            seuNumero: String(Date.now()).slice(-15),
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
                linha1: `Pix 791 Barber - Plano ${plan}`.substring(0, 80),
                linha2: (couponApplied ? `Cupom ${couponApplied}` : "").substring(0, 80)
            }
        };

        console.log('[SAAS PIX] Criando cobrança Pix no Inter...');
        const interBoleto = await inter.createBilling(payload);

        // Na V3, o pixCopiaECola pode vir dentro do objeto 'pix'
        const pixCopiaECola = interBoleto.pixCopiaECola || interBoleto.pix?.pixCopiaECola;

        // Debug
        console.log('[SAAS PIX] Resposta Inter:', JSON.stringify(interBoleto));
        console.log('[SAAS PIX] Code:', pixCopiaECola);

        // 5. Salvar registro local
        await supabaseAdmin
            .from('finance')
            .insert({
                tenant_id: null, // Receita do SaaS
                type: 'revenue',
                value: amount,
                description: `Pix SaaS Pendente - Plano ${plan} (${tenant.name})`,
                date: currentDate,
                is_paid: false,
                metadata: {
                    nosso_numero: interBoleto.nossoNumero,
                    txid: interBoleto.codigoSolicitacao || interBoleto.txid || 'N/A',
                    tenant_id: tenant.id,
                    method: 'pix_inter'
                }
            });

        return addCorsHeaders(req, NextResponse.json({
            success: true,
            pixPayload: pixCopiaECola || 'Pix indísponivel no momento, use o Boleto.',
            amount: amount,
            expiresAt: dueDateStr
        }));

    } catch (error: any) {
        console.error('[SAAS PIX CHECKOUT ERROR]', error);

        let errorMessage = error.message;
        try {
            // Tenta extrair mensagem detalhada do Inter
            if (errorMessage.includes('Inter Billing Error:')) {
                const jsonPart = errorMessage.split('Inter Billing Error: ')[1];
                const interError = JSON.parse(jsonPart);
                if (interError.violacoes && interError.violacoes.length > 0) {
                    errorMessage = `Banco Inter recusou: ${interError.violacoes[0].razao} (${interError.violacoes[0].valor})`;
                } else if (interError.detail) {
                    errorMessage = `Banco Inter: ${interError.detail}`;
                }
            }
        } catch (e) {
            // Falha ao parsear, mantem erro original
        }

        return addCorsHeaders(req, NextResponse.json({ error: errorMessage }, { status: 500 }));
    }
}
