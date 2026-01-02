import { NextResponse } from 'next/server';
import { QrCodePix } from 'qrcode-pix';

/**
 * Gera payload PIX e QR Code Base64.
 */
export async function POST(req: Request) {
    try {
        const { value, description, key = '791barber@pix.com', city = 'São Paulo' } = await req.json();

        if (!value) {
            return NextResponse.json({ error: 'Valor é obrigatório' }, { status: 400 });
        }

        const pix = QrCodePix({
            version: '01',
            key,
            name: '791 Barber',
            city,
            transactionId: crypto.randomUUID().replace(/-/g, '').slice(0, 25),
            value: parseFloat(value),
            message: description || 'Pagamento 791 Barber'
        });

        const qrBase64 = await pix.base64();
        const payload = pix.payload();

        return NextResponse.json({
            qrBase64,
            payload,
            copyText: payload,
            total: value
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
