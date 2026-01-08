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

        // 2. Configurar Inter
        const cert = (process.env.INTER_CERT_CONTENT || '').replace(/\\n/g, '\n');
        const key = (process.env.INTER_KEY_CONTENT || '').replace(/\\n/g, '\n');

        if (!process.env.INTER_CLIENT_ID || !cert || !key) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Configuração do Inter incompleta' }, { status: 500 }));
        }

        const inter = new InterAPIV3({
            clientId: process.env.INTER_CLIENT_ID,
            clientSecret: process.env.INTER_CLIENT_SECRET || '',
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

        // --- PULO DO GATO: Se o banco foi rápido, búscamos agora mesmo ---
        if (interRes.codigoSolicitacao || interRes.pending_processing) {
            console.log('[INTER] Aguardando 1.5s para busca imediata...');
            await new Promise(r => setTimeout(r, 1500));

            try {
                const token = await inter.getAccessToken();
                const now = new Date();
                const dInit = new Date(now); dInit.setDate(dInit.getDate() - 1);
                const dEnd = new Date(now); dEnd.setDate(dEnd.getDate() + 1);

                const path = `/cobranca/v3/cobrancas?seuNumero=${seuNumero}&dataInicial=${dInit.toISOString().split('T')[0]}&dataFinal=${dEnd.toISOString().split('T')[0]}`;
                const searchRes = await inter.makeRequest({
                    hostname: 'cdpj.partners.bancointer.com.br',
                    port: 443, path, method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` },
                    cert, key, rejectUnauthorized: false, family: 4
                });

                const items = searchRes.cobrancas || searchRes.content || [];
                if (items.length > 0) {
                    interRes = items[0]; // Substitui pela cobrança real com nossoNumero!
                    console.log('[INTER] Cobrança encontrada na busca imediata!');
                }
            } catch (e) {
                console.error('[INTER] Erro na busca imediata, seguindo para fluxo pendente.');
            }
        }

        const isReady = interRes.nossoNumero && interRes.nossoNumero !== 'PENDING';

        // 4. Salvar registro local
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
                    nosso_numero: interRes.nossoNumero || 'PENDING',
                    txid: interRes.codigoSolicitacao || interRes.txid || 'N/A',
                    seu_numero: seuNumero,
                    tenant_id: tenant.id,
                    codigo_barras: interRes.codigoBarras,
                    linha_digitavel: interRes.linhaDigitavel,
                    method: 'boleto_inter'
                }
            });

        if (isReady) {
            return addCorsHeaders(req, NextResponse.json({
                success: true,
                nossoNumero: interRes.nossoNumero,
                codigoBarras: interRes.codigoBarras,
                linhaDigitavel: interRes.linhaDigitavel,
                pdfUrl: `https://api.791barber.com/api/checkout/inter-boleto/pdf?nossoNumero=${interRes.nossoNumero}`
            }));
        }

        return addCorsHeaders(req, NextResponse.json({
            success: true,
            pending: true,
            message: 'Boleto em processamento no banco.',
            seu_numero: seuNumero,
            amount: amount
        }));

    } catch (error: any) {
        console.error('[CHECKOUT ERROR]', error);
        return addCorsHeaders(req, NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 }));
    }
}
