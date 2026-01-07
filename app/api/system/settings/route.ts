import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function GET(req: Request) {
    try {
        const { isSystemAdmin } = await getCurrentUserAndTenant();
        if (!isSystemAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const { data, error } = await supabaseAdmin
            .from('system_settings')
            .select('*');

        if (error) throw error;

        // Converter array para objeto { [key]: value }
        const dbSettings = data.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {} as Record<string, any>);

        // Mesclar com valores padrão do .env se estiverem vazios no DB
        const settings = {
            ...dbSettings,
            stripe_config: {
                public_key: dbSettings.stripe_config?.public_key || process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || '',
                secret_key: dbSettings.stripe_config?.secret_key || process.env.STRIPE_SECRET_KEY || '',
                webhook_secret: dbSettings.stripe_config?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET || '',
            },
            inter_config: {
                client_id: dbSettings.inter_config?.client_id || process.env.INTER_CLIENT_ID || '',
                client_secret: dbSettings.inter_config?.client_secret || process.env.INTER_CLIENT_SECRET || '',
                pix_key: dbSettings.inter_config?.pix_key || process.env.INTER_PIX_KEY || '',
                crt: dbSettings.inter_config?.crt || '',
                key: dbSettings.inter_config?.key || '',
                ca_crt: dbSettings.inter_config?.ca_crt || '',
            }
        };

        return NextResponse.json(settings);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

export async function PUT(req: Request) {
    try {
        const { isSystemAdmin } = await getCurrentUserAndTenant();
        if (!isSystemAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const body = await req.json(); // { key: string, value: any }

        const { error } = await supabaseAdmin
            .from('system_settings')
            .upsert({
                key: body.key,
                value: body.value,
                updated_at: new Date()
            }, { onConflict: 'key' });

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
