import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';
import { addDays, addWeeks, addMonths, parseISO, format } from 'date-fns';

export async function GET() {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        const { data, error } = await supabaseAdmin
            .from('finance')
            .select(`
                *,
                finance_categories (
                    id,
                    name,
                    type
                )
            `)
            .eq('tenant_id', tenant.id)
            .order('date', { ascending: false });

        if (error) throw error;
        return NextResponse.json(data || []);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { tenant, roles } = await getCurrentUserAndTenant();
        if (!roles.includes('owner')) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const body = await req.json();
        console.log('[BACKEND] Creating finance record(s):', body);

        const recordsToInsert = [];
        let currentIterDate = parseISO(body.date);
        const count = body.is_recurring ? Math.min(parseInt(body.recurrence_count) || 1, 48) : 1;

        for (let i = 0; i < count; i++) {
            recordsToInsert.push({
                tenant_id: tenant.id,
                type: body.type,
                value: body.value,
                description: body.is_recurring && count > 1
                    ? `${body.description} [${i + 1}/${count}]`
                    : body.description,
                date: format(currentIterDate, 'yyyy-MM-dd'),
                category_id: body.category_id,
                is_recurring: body.is_recurring,
                recurrence_period: body.recurrence_period,
                recurrence_count: count,
                is_paid: body.is_paid !== undefined ? body.is_paid : true
            });

            if (body.is_recurring) {
                if (body.recurrence_period === 'day') currentIterDate = addDays(currentIterDate, 1);
                else if (body.recurrence_period === 'week') currentIterDate = addWeeks(currentIterDate, 1);
                else if (body.recurrence_period === 'fortnight') currentIterDate = addDays(currentIterDate, 14);
                else if (body.recurrence_period === 'month') currentIterDate = addMonths(currentIterDate, 1);
            }
        }

        const { data, error } = await supabaseAdmin
            .from('finance')
            .insert(recordsToInsert)
            .select();

        if (error) {
            if (error.message.includes('column') && error.message.includes('not found')) {
                throw new Error('A estrutura do banco de dados ainda não foi atualizada. Por favor, execute a migração SQL para adicionar as colunas de recorrência na tabela "finance".');
            }
            throw error;
        }
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[BACKEND] Error creating finance record:', error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
