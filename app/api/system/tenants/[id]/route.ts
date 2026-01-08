import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, addCorsHeaders } from '@/app/lib/utils';

export async function OPTIONS(req: Request) {
    return addCorsHeaders(req, new NextResponse(null, { status: 200 }));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { user } = await getCurrentUserAndTenant();

        // Verificar se é super admin
        const { data: userData } = await supabaseAdmin
            .from('users')
            .select('is_system_admin')
            .eq('id', user.id)
            .single();

        if (!userData || !userData.is_system_admin) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Acesso negado: Requer privilégios de Super Admin' }, { status: 403 }));
        }

        const body = await req.json();
        // Em Next 15, params pode ser promise awaitable
        const { id: tenantId } = await params;

        // Validar campos permitidos para segurança
        const allowedFields = ['plan', 'subscription_status', 'trial_ends_at', 'name', 'active'];
        const updates: any = {};

        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updates[field] = body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Nenhum campo válido para atualização' }, { status: 400 }));
        }

        console.log(`[SYSTEM] Admin ${user.id} updating tenant ${tenantId}:`, updates);

        const { error } = await supabaseAdmin
            .from('tenants')
            .update(updates)
            .eq('id', tenantId);

        if (error) {
            console.error('[SYSTEM] Error updating tenant:', error);
            throw error;
        }

        return addCorsHeaders(req, NextResponse.json({ success: true, updates }));
    } catch (error: any) {
        console.error('[SYSTEM] Failed to update tenant:', error);
        return addCorsHeaders(req, NextResponse.json({ error: error.message }, { status: 500 }));
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { user } = await getCurrentUserAndTenant();

        const { data: userData } = await supabaseAdmin
            .from('users')
            .select('is_system_admin')
            .eq('id', user.id)
            .single();

        if (!userData || !userData.is_system_admin) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Acesso negado' }, { status: 403 }));
        }

        const { id: tenantId } = await params;

        console.log(`[SYSTEM] Admin ${user.id} deleting tenant ${tenantId}`);

        const { error } = await supabaseAdmin
            .from('tenants')
            .delete()
            .eq('id', tenantId);

        if (error) {
            throw error;
        }

        return addCorsHeaders(req, NextResponse.json({ success: true }));
    } catch (error: any) {
        console.error('[SYSTEM] Failed to delete tenant:', error);
        return addCorsHeaders(req, NextResponse.json({ error: error.message }, { status: 500 }));
    }
}
