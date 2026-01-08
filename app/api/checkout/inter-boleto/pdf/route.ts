import { NextResponse } from 'next/server';
import { InterAPIV3 } from '@/app/lib/inter-api-v3';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const nossoNumero = searchParams.get('nossoNumero');

        if (!nossoNumero || nossoNumero === 'undefined') {
            return NextResponse.json({ error: 'Nosso Número não informado ou inválido' }, { status: 400 });
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

        const pdfBuffer = await inter.getBillingPdf(nossoNumero);

        return new NextResponse(new Uint8Array(pdfBuffer), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=boleto-${nossoNumero}.pdf`,
            },
        });
    } catch (error: any) {
        console.error('[BOLETO PDF PROXY ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
