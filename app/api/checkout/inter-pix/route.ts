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
        let doc = (tenant.cnpj || tenant.cpf || tenant.document || tenant.bank_account_doc || "").replace(/\D/g, '');

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

        // 3. Integrar com Inter (V3) - Buscar do DB primeiro
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
            return addCorsHeaders(req, NextResponse.json({ error: 'Configuração do Inter incompleta no servidor' }, { status: 500 }));
        }

        const inter = new InterAPIV3({
            clientId,
            clientSecret: dbConfig?.client_secret || process.env.INTER_CLIENT_SECRET || '',
            cert, key
        });

        const payload = {
            seuNumero: tempId || String(Date.now()).slice(-15),
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

        const interResRaw = await inter.createBilling(payload);
        let interRes = interResRaw;
        let codigoSolicitacao = interRes.codigoSolicitacao;
        let pixCopiaECola = interRes.pixCopiaECola || interRes.pix?.pixCopiaECola;
        const seuNumero = payload.seuNumero;

        console.log('[SAAS PIX] Resposta inicial:', { codigoSolicitacao, hasPix: !!pixCopiaECola });

        // Se for assíncrono ou vier sem o pixCopiaECola, iniciamos busca
        let isReady = !!pixCopiaECola;

        if (!isReady && codigoSolicitacao) {
            console.log(`[SAAS PIX] Cobrança assíncrona. Iniciando busca (Ticket: ${codigoSolicitacao})...`);
            const maxRetries = 5;
            const delays = [3000, 3000, 4000, 5000, 5000];

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                console.log(`[SAAS PIX] Tentativa ${attempt + 1}/${maxRetries} - Aguardando ${delays[attempt]}ms...`);
                await new Promise(r => setTimeout(r, delays[attempt]));

                try {
                    let found: any = null;

                    // Estratégia A: Consulta por Solicitação
                    try {
                        const solRes = await inter.getBillingBySolicitacao(codigoSolicitacao);
                        const possiblePix = solRes.pix;
                        if (possiblePix?.pixCopiaECola) {
                            found = { ...solRes.cobranca, pixCopiaECola: possiblePix.pixCopiaECola };
                        }
                    } catch (e: any) {
                        console.log('[SAAS PIX] Estratégia A falhou, pulando para B.');
                    }

                    // Estratégia B: Busca na Lista (+/- 1 dia)
                    if (!found) {
                        const now = new Date();
                        const dInit = new Date(now); dInit.setDate(dInit.getDate() - 1);
                        const dEnd = new Date(now); dEnd.setDate(dEnd.getDate() + 1);

                        const listRes = await inter.listBillings(
                            dInit.toISOString().split('T')[0],
                            dEnd.toISOString().split('T')[0]
                        );
                        const items = listRes.cobrancas || listRes.content || [];
                        found = items.find((it: any) => it.seuNumero === seuNumero);
                    }

                    if (found && (found.pixCopiaECola || found.pix?.pixCopiaECola)) {
                        interRes = found;
                        pixCopiaECola = found.pixCopiaECola || found.pix?.pixCopiaECola;
                        isReady = true;
                        console.log('[SAAS PIX] ✅ Pix localizado!');
                        break;
                    }
                } catch (e: any) {
                    console.error(`[SAAS PIX] Erro tentativa ${attempt + 1}:`, e.message);
                }
            }
        }

        // 5. Salvar registro local
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
                    txid: codigoSolicitacao || 'N/A',
                    seu_numero: seuNumero,
                    tenant_id: tenant.id,
                    method: 'pix_inter',
                    pix_payload: pixCopiaECola
                }
            });

        if (isReady) {
            const identifier = interRes.nossoNumero || interRes.identificador || codigoSolicitacao;
            return addCorsHeaders(req, NextResponse.json({
                success: true,
                pixPayload: pixCopiaECola,
                amount: amount,
                expiresAt: dueDateStr,
                pdfUrl: `/api/checkout/inter-boleto/pdf?nossoNumero=${identifier}&codigoSolicitacao=${codigoSolicitacao || ''}`
            }));
        }

        return addCorsHeaders(req, NextResponse.json({
            success: true,
            pending: true,
            message: 'O Pix está sendo processado pelo banco.',
            seu_numero: seuNumero,
            amount: amount
        }));

    } catch (error: any) {
        console.error('[SAAS PIX CHECKOUT ERROR]', error);
        return addCorsHeaders(req, NextResponse.json({ error: error.message }, { status: 500 }));
    }
}
