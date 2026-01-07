import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function GET(req: Request) {
    try {
        const { isSystemAdmin } = await getCurrentUserAndTenant();
        if (!isSystemAdmin) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const { data: stats, error } = await supabaseAdmin.rpc('get_system_global_stats');

        if (error) throw error;

        return NextResponse.json(stats);
    } catch (error: any) {
        console.error('[SYSTEM STATS GET] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
