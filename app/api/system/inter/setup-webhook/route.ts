import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getSystemInterClient } from '@/app/lib/inter-api';

export async function POST(req: Request) {
    try {
        // 1. Get settings
        const { data: setting, error: settingError } = await supabaseAdmin
            .from('system_settings')
            .select('*')
            .eq('key', 'inter_config')
            .single();

        if (settingError || !setting) {
            throw new Error('Configurações do Inter não encontradas no sistema.');
        }

        const config = setting.value;
        const chave = config.pix_key;

        if (!chave) {
            throw new Error('A Chave Pix SaaS precisa estar configurada antes de registrar o Webhook.');
        }

        // 2. Get Inter API client
        const inter = await getSystemInterClient();
        if (!inter) {
            throw new Error('Não foi possível inicializar o cliente da API do Inter com as chaves fornecidas.');
        }

        // 3. Setup Webhook
        // The URL for our backend
        const webhookUrl = 'https://api.791barber.com/api/webhooks/inter';

        console.log(`[INTER WEBHOOK] Tentando registrar URL ${webhookUrl} para a chave ${chave}`);

        await inter.setupWebhook(webhookUrl, chave);

        return NextResponse.json({ success: true, url: webhookUrl });
    } catch (error: any) {
        console.error('[INTER WEBHOOK SETUP ERROR]', error);

        let errorMessage = error.message;
        if (error.message.includes('403')) {
            errorMessage = 'Acesso negado pela API do Inter. Verifique se as permissões (Escopos) de Webhook estão ativas na sua aplicação no Internet Banking.';
        }

        return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
}
