import { NextResponse } from 'next/server';
import { getCurrentUserAndTenant } from '@/app/lib/utils';
import { InterAPIV3 } from '@/app/lib/inter-api-v3';
import { supabaseAdmin } from '@/app/lib/supabase';

export async function GET(req: Request) {
    try {
        const { isSystemAdmin } = await getCurrentUserAndTenant();
        // Allow ONLY system admins to run this setup
        if (!isSystemAdmin) {
            return NextResponse.json({ error: 'Acesso Negado' }, { status: 403 });
        }

        const cert = (process.env.INTER_CERT_CONTENT || '').replace(/\\n/g, '\n');
        const key = (process.env.INTER_KEY_CONTENT || '').replace(/\\n/g, '\n');

        if (!process.env.INTER_CLIENT_ID || !cert || !key) {
            return NextResponse.json({ error: 'Configuração do Inter incompleta (env vars missing)' }, { status: 500 });
        }

        const inter = new InterAPIV3({
            clientId: process.env.INTER_CLIENT_ID,
            clientSecret: process.env.INTER_CLIENT_SECRET || '',
            cert: cert,
            key: key
        });

        // IMPORTANT: Use production URL to ensure Inter calls the right place
        const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.791barber.com';
        const webhookUrl = `${baseUrl}/api/webhooks/inter`;

        console.log('[SETUP] Registering Webhook:', webhookUrl);

        // Register both Boleto and Pix webhooks
        const res1 = await inter.registerWebhook(webhookUrl, 'boleto');
        const res2 = await inter.registerWebhook(webhookUrl, 'pix');

        return NextResponse.json({
            success: true,
            registeredUrl: webhookUrl,
            details: [res1, res2]
        });

    } catch (error: any) {
        console.error('[SETUP ERROR]', error);
        return NextResponse.json({
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
