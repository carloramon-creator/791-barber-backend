import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, checkRolePermission } from '@/app/lib/utils';

export async function PUT(req: Request) {
  try {
    const { tenant, role: currentUserRole } = await getCurrentUserAndTenant();
    checkRolePermission(currentUserRole, 'manage_users');

    const body = await req.json();
    const { 
      id: userId,
      name,
      role,
      phone,
      cpf,
      cep,
      street,
      number,
      complement,
      neighborhood,
      city,
      state
    } = body;

    if (!userId) {
      return NextResponse.json({ error: 'ID do usuário é obrigatório' }, { status: 400 });
    }

    // Verificar se o usuário pertence ao mesmo tenant
    const { data: targetUser, error: findError } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('id', userId)
      .single();

    if (findError || !targetUser) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    if (targetUser.tenant_id !== tenant.id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const updates = {
      name,
      role,
      phone,
      cpf,
      cep,
      street,
      number,
      complement,
      neighborhood,
      city,
      state
    };

    // Remover campos undefined
    Object.keys(updates).forEach(key => (updates as any)[key] === undefined && delete (updates as any)[key]);

    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json(updatedUser);
  } catch (error: any) {
    console.error('[BACKEND] Error updating user:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
