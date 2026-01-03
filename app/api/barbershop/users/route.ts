import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, checkRolePermission } from '@/app/lib/utils';

// Função auxiliar para garantir o URL correto de redirecionamento
const getRedirectUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_OWNER_URL;
  if (envUrl && !envUrl.includes('localhost')) {
    return `${envUrl}/login`;
  }
  return 'https://791barber.com/login';
};

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
    const { tenant, roles: currentUserRoles } = await getCurrentUserAndTenant();
    checkRolePermission(currentUserRoles, 'manage_users');
    const body = await req.json();
    const { userId: existingUserId, email, name, role: requestRole, roles: requestRoles, generateInvite = false, photo_url } = body;

    let targetEmail = email?.toLowerCase();
    let userId = existingUserId;

    // Determinar roles finais (preferência pelo array roles, fallback para role)
    const finalRoles = requestRoles || (requestRole ? [requestRole] : ['staff']);
    const primaryRole = finalRoles[0] || 'staff';

    if (userId && generateInvite) {
      const { data: u } = await supabaseAdmin.from('users').select('email').eq('id', userId).single();
      if (u) targetEmail = u.email;
    }

    if (!userId && targetEmail) {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: targetEmail,
        email_confirm: true,
        user_metadata: { name }
      });

      if (createError) {
        if (createError.message.includes('already been registered')) {
          const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();
          const found = authUsers?.find(u => u.email?.toLowerCase() === targetEmail);
          userId = found?.id;
        } else {
          throw createError;
        }
      } else {
        userId = created.user?.id;
      }
    }

    if (!userId) throw new Error('Não foi possível identificar o usuário');

    let finalUserRecord = null;
    if (!(existingUserId && generateInvite)) {
      const userPayload: any = {
        id: userId,
        tenant_id: tenant.id,
        email: targetEmail,
        name: name || targetEmail.split('@')[0],
        role: primaryRole,
        roles: finalRoles,
        photo_url,
        phone: body.phone,
        cpf: body.cpf,
        cep: body.cep,
        street: body.street,
        number: body.number,
        complement: body.complement || '',
        neighborhood: body.neighborhood,
        city: body.city,
        state: body.state,
        avg_service_time: body.avg_service_time || 30,
        commission_type: body.commission_type || 'percentage',
        commission_value: body.commission_value || 50
      };

      Object.keys(userPayload).forEach(key => userPayload[key] === undefined && delete userPayload[key]);
      const { data: upserted, error: upsertError } = await supabaseAdmin.from('users').upsert(userPayload).select().single();

      if (upsertError) throw upsertError;
      finalUserRecord = upserted;

      // Sincronizar com a tabela de barbeiros se a role barber estiver presente
      if (finalRoles.includes('barber')) {
        await supabaseAdmin.from('barbers').upsert({
          tenant_id: tenant.id,
          user_id: userId,
          name: name || targetEmail.split('@')[0],
          photo_url: photo_url,
          avg_time_minutes: body.avg_service_time || 30,
          commission_percentage: body.commission_type === 'percentage' ? body.commission_value : 0,
          is_active: true
        }, { onConflict: 'tenant_id,user_id' });
      }
    } else {
      const { data: existing } = await supabaseAdmin.from('users').select('*').eq('id', userId).single();
      finalUserRecord = existing;
    }

    let inviteLink = null;
    if (generateInvite && targetEmail) {
      const redirectTo = getRedirectUrl();

      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: targetEmail,
        options: { redirectTo }
      });

      if (linkErr || !linkData.properties?.action_link) {
        const { data: recoveryData, error: recoveryErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: targetEmail,
          options: { redirectTo }
        });
        if (!recoveryErr) inviteLink = recoveryData.properties?.action_link;
      } else {
        inviteLink = linkData.properties?.action_link;
      }
    }

    if (generateInvite && !inviteLink) {
      throw new Error('O sistema de login não permitiu gerar um link para este e-mail.');
    }

    return NextResponse.json({ ...finalUserRecord, inviteLink });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const { tenant, roles: currentUserRoles } = await getCurrentUserAndTenant();
    checkRolePermission(currentUserRoles, 'manage_users');
    const body = await req.json();

    const finalRoles = body.roles || (body.role ? [body.role] : undefined);
    const primaryRole = finalRoles ? finalRoles[0] : undefined;

    const updates: any = {
      name: body.name,
      role: primaryRole,
      roles: finalRoles,
      photo_url: body.photo_url,
      phone: body.phone,
      cpf: body.cpf,
      cep: body.cep,
      street: body.street,
      number: body.number,
      complement: body.complement || '',
      neighborhood: body.neighborhood,
      city: body.city,
      state: body.state,
      avg_service_time: body.avg_service_time,
      commission_type: body.commission_type,
      commission_value: body.commission_value
    };

    Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);
    const { data, error } = await supabaseAdmin.from('users').update(updates).eq('id', body.id).select().single();

    if (error) throw error;

    // Sincronizar com a tabela de barbeiros
    const currentRoles = data.roles || [];
    if (currentRoles.includes('barber')) {
      await supabaseAdmin.from('barbers').upsert({
        tenant_id: tenant.id,
        user_id: body.id,
        name: data.name,
        photo_url: data.photo_url,
        avg_time_minutes: data.avg_service_time || 30,
        commission_percentage: data.commission_type === 'percentage' ? data.commission_value : 0,
        is_active: true
      }, { onConflict: 'tenant_id,user_id' });
    } else {
      // Se não for mais barbeiro, desativar na tabela de barbeiros
      await supabaseAdmin.from('barbers').update({ is_active: false }).eq('tenant_id', tenant.id).eq('user_id', body.id);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { tenant, role } = await getCurrentUserAndTenant();
    checkRolePermission(role, 'manage_users');
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('ID é obrigatório');
    const { error } = await supabaseAdmin.from('users').delete().eq('id', id).eq('tenant_id', tenant.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
