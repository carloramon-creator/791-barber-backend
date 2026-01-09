import { NextResponse } from 'next/server';
import { InterAPIV3 } from '@/app/lib/inter-api-v3';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const nossoNumero = searchParams.get('nossoNumero');
        const codigoSolicitacao = searchParams.get('codigoSolicitacao');

        const cleanNossoNumero = nossoNumero ? nossoNumero.replace(/\D/g, '') : null;
        const solicitacaoId = (codigoSolicitacao && codigoSolicitacao !== 'undefined' && codigoSolicitacao !== 'N/A') ? codigoSolicitacao : null;

        if (!cleanNossoNumero && !solicitacaoId) {
            return NextResponse.json({ error: 'Identificador (nossoNumero ou codigoSolicitacao) não informado' }, { status: 400 });
        }

        // Configuração V3
        const cert = (process.env.INTER_CERT_CONTENT || '').replace(/\\n/g, '\n');
        const key = (process.env.INTER_KEY_CONTENT || '').replace(/\\n/g, '\n');

        if (!process.env.INTER_CLIENT_ID || !cert || !key) {
            return NextResponse.json({ error: 'Configuração do Inter incompleta no servidor' }, { status: 500 });
        }

        const inter = new InterAPIV3({
            clientId: process.env.INTER_CLIENT_ID,
            clientSecret: process.env.INTER_CLIENT_SECRET || '',
            cert: cert,
            key: key
        });

        // Tenta primeiro pelo Solicitação ID (UUID) se existir, depois pelo Nosso Número
        let pdfBuffer: Buffer | null = null;
        let usedId = '';

        try {
            if (solicitacaoId) {
                console.log(`[PDF] Tentando baixar pelo Solicitação ID: ${solicitacaoId}`);
                pdfBuffer = await inter.getBillingPdf(solicitacaoId);
                usedId = solicitacaoId;
            }
        } catch (e) {
            console.warn(`[PDF] Falha ao baixar pelo Solicitação ID, tentando Nosso Número...`);
        }

        if (!pdfBuffer && cleanNossoNumero) {
            console.log(`[PDF] Tentando baixar pelo Nosso Número: ${cleanNossoNumero}`);
            pdfBuffer = await inter.getBillingPdf(cleanNossoNumero);
            usedId = cleanNossoNumero;
        }

        if (!pdfBuffer) {
            return NextResponse.json({ error: 'Não foi possível baixar o PDF com nenhum dos identificadores.' }, { status: 404 });
        }

        return new NextResponse(new Uint8Array(pdfBuffer), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename=boleto-${usedId}.pdf`,
            },
        });
    } catch (error: any) {
        console.error('[BOLETO PDF PROXY ERROR]', error.message || error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
