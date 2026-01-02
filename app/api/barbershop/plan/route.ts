import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, addCorsHeaders } from '@/app/lib/utils';

export async function OPTIONS(req: Request) {
    const response = new NextResponse(null, { status: 200 });
    return addCorsHeaders(req, response);
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        let tenantId = searchParams.get('tenant_id');

        console.log('[API GET PLAN] Initial tenant_id:', tenantId);

        // Try to get tenant from session (More robust)
        try {
            const { tenant } = await getCurrentUserAndTenant();
            if (tenant && tenant.id) {
                console.log('[API GET PLAN] Found tenant from session:', tenant.id);
                tenantId = tenant.id;
            }
        } catch (e) {
            console.log('[API GET PLAN] Session check failed, valid if public access or distinct context:', e);
            // Continue with param tenantId
        }

        if (!tenantId) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Tenant ID required and no session found' }, { status: 400 }));
        }

        const { data: tenant, error } = await supabaseAdmin
            .from('tenants')
            .select('id, plan')
            .eq('id', tenantId)
            .maybeSingle(); // Safe query

        if (error) {
            console.error('[API GET PLAN] DB Error:', error);
            throw error;
        }

        if (!tenant) {
            const response = NextResponse.json(
                { error: `Barbearia não encontrada (ID: ${tenantId})` },
                { status: 404 }
            );
            return addCorsHeaders(req, response);
        }

        const response = NextResponse.json({
            currentPlan: tenant.plan || 'basic'
        });
        return addCorsHeaders(req, response);
    } catch (error: any) {
        console.error('[API GET PLAN] Erro:', error.message);
        const response = NextResponse.json(
            { error: error.message },
            { status: 400 }
        );
        return addCorsHeaders(req, response);
    }
}

export async function POST(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        let tenantId = searchParams.get('tenant_id');
        const body = await req.json();
        const { newPlan } = body;

        // Try to get tenant from session
        try {
            const { tenant, role } = await getCurrentUserAndTenant();
            if (tenant && tenant.id) {
                tenantId = tenant.id;
                if (role !== 'owner') {
                    return addCorsHeaders(req, NextResponse.json({ error: 'Apenas proprietários podem mudar o plano' }, { status: 403 }));
                }
            }
        } catch (e) {
            console.log('[API POST PLAN] Session check failed:', e);
        }

        console.log('[API POST PLAN] Mudando plano para:', newPlan, 'Tenant:', tenantId);

        if (!tenantId) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Tenant ID required' }, { status: 400 }));
        }

        if (!['basic', 'complete', 'premium'].includes(newPlan)) {
            const response = NextResponse.json(
                { error: 'Plano inválido' },
                { status: 400 }
            );
            return addCorsHeaders(req, response);
        }

        const { data: updated, error } = await supabaseAdmin
            .from('tenants')
            .update({ plan: newPlan })
            .eq('id', tenantId)
            .select('plan')
            .maybeSingle();

        if (error) throw error;

        if (!updated) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Barbearia não encontrada ao tentar atualizar' }, { status: 404 }));
        }

        console.log('[API POST PLAN] Plano atualizado:', updated.plan);

        const response = NextResponse.json({
            currentPlan: updated.plan
        }, { status: 200 });
        return addCorsHeaders(req, response);
    } catch (error: any) {
        console.error('[API POST PLAN] Erro:', error.message);
        const response = NextResponse.json(
            { error: error.message },
            { status: 400 }
        );
        return addCorsHeaders(req, response);
    }
}
