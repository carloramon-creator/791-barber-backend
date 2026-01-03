import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function GET() {
    try {
        const { tenant } = await getCurrentUserAndTenant();

        const { data: barbers, error } = await supabaseAdmin
            .from('barbers')
            .select('*')
            .eq('tenant_id', tenant.id);

        if (error) throw error;
        return NextResponse.json(barbers || []);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { tenant, role } = await getCurrentUserAndTenant();
        if (role !== 'owner' && role !== 'staff') {
            return NextResponse.json({ error: 'Somente o dono ou funcionários podem gerenciar barbeiros' }, { status: 403 });
        }

        const { name, photo_url, avg_time_minutes, commission_percentage, is_active } = await req.json();

        // Usamos supabaseAdmin para o INSERT para evitar erros de RLS 
        // A validação de tenant já foi feita acima no getCurrentUserAndTenant
        const { data: barber, error } = await supabaseAdmin
            .from('barbers')
            .insert({
                tenant_id: tenant.id,
                name,
                photo_url,
                avg_time_minutes: avg_time_minutes || 30,
                commission_percentage: commission_percentage || 0,
                is_active: is_active !== undefined ? is_active : true
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(barber);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
