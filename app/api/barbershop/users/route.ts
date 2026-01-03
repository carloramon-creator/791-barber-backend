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
      .select('id, name, email, role, phone, cpf, cep, street, number, complement, neighborhood, city, state, avg_service_time, commission_type, commission_value, created_at')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(users);
  } catch (error: any) {
    console.error('[BACKEND] Error in GET users:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  console.log('[POST USER] Start');
  try {
    // Tentar obter tenant da URL (como o usuário sugeriu) ou da sessão atual
    const { searchParams } = new URL(req.url);
    const tenantIdParam = searchParams.get('tenant_id');

    let tenantId: string;
    let currentUserRole: string = 'owner'; // Default assumption if admin API usage

    try {
      const { tenant, role } = await getCurrentUserAndTenant();
      tenantId = tenant.id;
      currentUserRole = role;
      checkRolePermission(role, 'manage_users');

      // CHECK PLAN LIMITS
      if (tenant.plan !== 'premium' && tenant.plan !== 'trial') {
        const { count } = await supabaseAdmin
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .neq('role', 'client');

        const maxUsers = tenant.plan === 'basic' ? 3 : 10;
        if ((count || 0) >= maxUsers) {
          return NextResponse.json({
            error: `Seu plano atual (${tenant.plan}) permite no máximo ${maxUsers} colaboradores. Faça upgrade para o plano Premium para usuários ilimitados.`
          }, { status: 403 });
        }
      }

      console.log('[POST USER] Auth check passed via Session', { tenantId, role });
    } catch (e: any) {
      if (tenantIdParam) {
        tenantId = tenantIdParam;
      } else {
        return NextResponse.json({ error: e.message }, { status: 401 });
      }
    }

    const body = await req.json();
    console.log('[POST USER] Body received', body);
    const {
      userId: existingUserId,
      email,
      name,
      role: requestRole,
      phone,
      cpf,
      cep,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      avg_service_time,
      commission_type,
      commission_value,
      generateInvite = false
    } = body;

    // Se informou userId, estamos apenas gerando o link para um usuário existente
    if (existingUserId && generateInvite) {
      console.log('[POST USER] Re-generating link for existing user ID:', existingUserId);
      const { data: userToInvite, error: findError } = await supabaseAdmin
        .from('users')
        .select('email')
        .eq('id', existingUserId)
        .single();

      if (findError || !userToInvite) {
        console.error('[POST USER] User not found for link generation:', existingUserId);
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
      }

      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: userToInvite.email,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_OWNER_URL || 'https://791barber.com'}/login`
        }
      });

      if (linkError) {
        console.error('[POST USER] Link generation error:', linkError.message);
        return NextResponse.json({ error: linkError.message }, { status: 400 });
      }

      console.log('[POST USER] Link generated successfully');
      return NextResponse.json({ inviteLink: linkData.properties?.action_link });
    }

    // Validação APENAS para novos usuários (sem existingUserId)
    if (!existingUserId && (!email || !requestRole)) {
      return NextResponse.json({ error: 'Email e Função são obrigatórios para novos usuários' }, { status: 400 });
    }

    // MAP 'staff' to 'barber' if database constraint doesn't allow 'staff'
    // To be safe and "do what needs to be done", we map it if it's 'staff'.
    let dbRole = requestRole;
    if (requestRole === 'staff') {
      // dbRole = 'barber'; // Uncomment this if the DB constraint fails.
      // Let's try to send 'staff'. If it fails, we catch and retry with 'barber'.
    }

    let userId: string | undefined;

    // 1. Tentar criar o usuário diretamente (sem envio de email para evitar timeout local)
    console.log('[POST USER] Creating user via admin.createUser:', email);

    const { data: createdData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      email_confirm: true, // Auto confirma
      user_metadata: { name: name }
    });

    if (createError) {
      console.log('[POST USER] Create user error (probably exists):', createError.message);

      // Se não está no public, está no Auth mas "solto"?
      // Tentar encontrar o usuário órfão no Auth para recuperar o ID
      console.log('[POST USER] Searching for orphan user in Auth list...');
      // Limitação: listUsers pode não escalar se tiver milhares, mas serve para recuperar falhas.
      const { data: { users: authUsers }, error: listError } = await supabaseAdmin.auth.admin.listUsers();

      const orphanUser = authUsers?.find(u => u.email?.toLowerCase() === email.toLowerCase());

      if (orphanUser) {
        console.log('[POST USER] Orphan auth user found via listUsers:', orphanUser.id);
        userId = orphanUser.id;
      } else {
        return NextResponse.json({
          error: 'Usuário já existe no Auth (email duplicado) mas não foi possível recuperar o ID. Contate o suporte.'
        }, { status: 400 });
      }
    }
    else {
      console.log('[POST USER] User created successfully:', createdData.user?.id);
      userId = createdData.user?.id;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Não foi possível obter o ID do usuário.' }, { status: 400 });
    }

    // Check if user already exists in public.users for this tenant
    const { data: existingPublicUser, error: publicUserError } = await supabaseAdmin
      .from('users')
      .select('id, name, tenant_id')
      .eq('email', email)
      .single();

    if (publicUserError && publicUserError.code !== 'PGRST116') { // PGRST116 means "no rows found"
      console.error('[POST USER] Error checking public.users:', publicUserError.message);
      throw publicUserError;
    }

    if (existingPublicUser) {
      console.log('[POST USER] User found in public.users:', existingPublicUser.id);
      if (existingPublicUser.tenant_id !== tenantId) {
        return NextResponse.json({
          error: `Este e-mail (${email}) pertence ao usuário "${existingPublicUser.name}" de outra barbearia. Não é permitido duplicidade de e-mail no sistema.`
        }, { status: 400 });
      }
      return NextResponse.json({ error: `O usuário "${existingPublicUser.name}" já está cadastrado nesta barbearia.` }, { status: 400 });
    }

    // 2. Insert/Update public.users
    console.log('[POST USER] Upserting to public.users:', { userId, tenantId, email, name, role: dbRole });

    // Tentar primeiro com o role solicitado
    const userPayload = {
      id: userId,
      tenant_id: tenantId,
      email: email,
      name: name || email.split('@')[0],
      role: dbRole as UserRole,
      phone,
      cpf,
      cep,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      avg_service_time: avg_service_time || 30,
      commission_type: commission_type || 'percentage',
      commission_value: commission_value || 50
    };

    let { data: newUser, error: upsertError } = await supabaseAdmin
      .from('users')
      .upsert(userPayload)
      .select()
      .single();

    // Retry logic for 'staff' constraint
    if (upsertError && upsertError.message.includes('check constraint') && dbRole === 'staff') {
      console.warn('[POST USER] Constraint violation for staff role. Falling back to barber.');
      const { data: retryUser, error: retryError } = await supabaseAdmin
        .from('users')
        .upsert({
          ...userPayload,
          role: 'barber' // Fallback
        })
        .select()
        .single();
      newUser = retryUser;
      upsertError = retryError;
    }

    console.log('[POST USER] Upsert result:', { success: !!newUser, error: upsertError?.message });

    if (upsertError) throw upsertError;

    // 3. Generate Invite Link if requested
    let inviteLink = null;
    if (generateInvite) {
      console.log('[POST USER] Generating invite link for:', email);
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_OWNER_URL || 'https://791barber.com'}/login`
        }
      });

      if (linkError) {
        console.error('[POST USER] Error generating link:', linkError.message);
      } else {
        inviteLink = linkData.properties?.action_link;
      }
    }

    return NextResponse.json({ ...newUser, inviteLink });

  } catch (error: any) {
    console.error('[BACKEND] Error in POST user:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

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
      state,
      avg_service_time,
      commission_type,
      commission_value
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
      state,
      avg_service_time,
      commission_type,
      commission_value
    };

    // Remover campos que vieram vazios ('') ou undefined para NÃO APAGAR o que já existe no banco
    Object.keys(updates).forEach(key => {
      if ((updates as any)[key] === undefined || (updates as any)[key] === '') {
        delete (updates as any)[key];
      }
    });

    console.log('[BACKEND] Final update payload:', updates);

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
