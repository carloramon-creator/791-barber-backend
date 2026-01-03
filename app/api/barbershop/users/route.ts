import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, checkRolePermission } from '@/app/lib/utils';

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

    let targetEmail = email?.toLowerCase();
    let userId = existingUserId;

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
        role: requestRole || 'staff',
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
      
      if (upsertError && upsertError.message.includes('column')) {
          const minimalFields = ['id', 'tenant_id', 'email', 'name', 'role', 'phone', 'cpf', 'cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state'];
          const cleanPayload: any = {};
          minimalFields.forEach(f => { if (userPayload[f] !== undefined) cleanPayload[f] = userPayload[f]; });
          const { data: retry } = await supabaseAdmin.from('users').upsert(cleanPayload).select().single();
          finalUserRecord = retry;
      } else if (upsertError) throw upsertError;
      else finalUserRecord = upserted;
    } else {
      const { data: existing } = await supabaseAdmin.from('users').select('*').eq('id', userId).single();
      finalUserRecord = existing;
    }

    let inviteLink = null;
    if (generateInvite && targetEmail) {
      // Tenta Convite
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: targetEmail,
        options: { redirectTo: `${process.env.NEXT_PUBLIC_OWNER_URL || 'https://791barber.com'}/login` }
      });

      if (linkErr || !linkData.properties?.action_link) {
        console.log('[BACKEND] Invite link failed, trying recovery link as fallback...');
        // Tenta Recuperação de Senha (funciona para quem já existe)
        const { data: recoveryData, error: recoveryErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: targetEmail,
          options: { redirectTo: `${process.env.NEXT_PUBLIC_OWNER_URL || 'https://791barber.com'}/login` }
        });
        if (!recoveryErr) inviteLink = recoveryData.properties?.action_link;
      } else {
        inviteLink = linkData.properties?.action_link;
      }
    }

    if (generateInvite && !inviteLink) {
        throw new Error('O sistema de login não permitiu gerar um link para este e-mail. Verifique se o e-mail está correto.');
    }

    return NextResponse.json({ ...finalUserRecord, inviteLink });
  } catch (error: any) {
    console.error('[BACKEND USERS] POST Error:', error.message);
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

    if (error && error.message.includes('column')) {
       const legacy = { ...updates };
       delete legacy.avg_service_time; delete legacy.commission_type; delete legacy.commission_value;
       const { data: retry } = await supabaseAdmin.from('users').update(legacy).eq('id', body.id).select().single();
       return NextResponse.json(retry);
    }

    if (error) throw error;
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
