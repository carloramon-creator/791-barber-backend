import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, checkRolePermission } from '@/app/lib/utils';
import { UserRole } from '@/app/lib/types';

export async function GET(req: Request) {
  try {
    const { tenant, role } = await getCurrentUserAndTenant();
    checkRolePermission(role, 'manage_users');
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenant, role: currentUserRole } = await getCurrentUserAndTenant();
    checkRolePermission(currentUserRole, 'manage_users');

    const body = await req.json();
    const { userId: existingUserId, email, name, role: requestRole, generateInvite = false } = body;

    // CASO 1: APENAS GERAR LINK PARA USUÁRIO QUE JÁ EXISTE NA LISTA
    if (existingUserId && generateInvite) {
      const { data: u } = await supabaseAdmin.from('users').select('email').eq('id', existingUserId).single();
      if (!u) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
      
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: u.email,
        options: { redirectTo: `${process.env.NEXT_PUBLIC_OWNER_URL || 'https://791barber.com'}/login` }
      });
      if (linkError) return NextResponse.json({ error: linkError.message }, { status: 400 });
      return NextResponse.json({ inviteLink: linkData.properties?.action_link });
    }

    // CASO 2: NOVO USUÁRIO (OU RE-CONVITE POR FORMULÁRIO)
    if (!email) return NextResponse.json({ error: 'Email é obrigatório' }, { status: 400 });

    // 1. Verificar se já existe no Auth
    const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();
    let authUser = authUsers?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    let userId = authUser?.id;

    if (!userId) {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name }
      });
      if (createError) throw createError;
      userId = created.user?.id;
    }

    // 2. Upsert no public.users (ignorar colunas que podem não existir ainda no banco)
    const userPayload: any = {
      id: userId,
      tenant_id: tenant.id,
      email: email.toLowerCase(),
      name: name,
      role: requestRole,
      phone: body.phone,
      cpf: body.cpf,
      cep: body.cep,
      street: body.street,
      number: body.number,
      complement: body.complement || '',
      neighborhood: body.neighborhood,
      city: body.city,
      state: body.state
    };

    // Tentar incluir campos de barbeiro apenas se vierem no body (evita erro de coluna se não existirem)
    if (body.avg_service_time) userPayload.avg_service_time = body.avg_service_time;
    if (body.commission_type) userPayload.commission_type = body.commission_type;
    if (body.commission_value) userPayload.commission_value = body.commission_value;

    const { data: newUser, error: upsertError } = await supabaseAdmin
      .from('users')
      .upsert(userPayload)
      .select()
      .single();

    if (upsertError && upsertError.message.includes('avg_service_time')) {
       // Se o erro for a coluna, tenta salvar sem as colunas novas
       delete userPayload.avg_service_time;
       delete userPayload.commission_type;
       delete userPayload.commission_value;
       const { data: retryUser, error: retryError } = await supabaseAdmin.from('users').upsert(userPayload).select().single();
       if (retryError) throw retryError;
       return NextResponse.json({ ...retryUser, inviteLink: null });
    }

    if (upsertError) throw upsertError;

    // 3. Link se solicitado
    let inviteLink = null;
    if (generateInvite) {
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: { redirectTo: `${process.env.NEXT_PUBLIC_OWNER_URL || 'https://791barber.com'}/login` }
      });
      inviteLink = linkData.properties?.action_link;
    }

    return NextResponse.json({ ...newUser, inviteLink });
  } catch (error: any) {
    console.error('[BACKEND USERS] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const { tenant, role: currentUserRole } = await getCurrentUserAndTenant();
    checkRolePermission(currentUserRole, 'manage_users');
    const body = await req.json();
    
    const updates: any = {
      name: body.name,
      role: body.role,
      phone: body.phone,
      cpf: body.cpf,
      cep: body.cep,
      street: body.street,
      number: body.number,
      complement: body.complement || '', // Forçar vazio se vir nulo
      neighborhood: body.neighborhood,
      city: body.city,
      state: body.state
    };

    if (body.avg_service_time) updates.avg_service_time = body.avg_service_time;
    if (body.commission_type) updates.commission_type = body.commission_type;
    if (body.commission_value) updates.commission_value = body.commission_value;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single();

    if (error && error.message.includes('avg_service_time')) {
        delete updates.avg_service_time;
        delete updates.commission_type;
        delete updates.commission_value;
        const { data: retry } = await supabaseAdmin.from('users').update(updates).eq('id', body.id).select().single();
        return NextResponse.json(retry);
    }

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
