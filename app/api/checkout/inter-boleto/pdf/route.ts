import { NextResponse } from 'next/server';
import { getSystemInterClient } from '@/app/lib/inter-api';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const nossoNumero = searchParams.get('nossoNumero');

        if (!nossoNumero) {
            return NextResponse.json({ error: 'Nosso Número não informado' }, { status: 400 });
        }

        const inter = await getSystemInterClient();
        if (!inter) {
            return NextResponse.json({ error: 'Configuração Inter não encontrada' }, { status: 500 });
        }

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
