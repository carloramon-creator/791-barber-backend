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

    // CASO 1: GERAR LINK PARA ID EXISTENTE
    if (userId && generateInvite) {
      const { data: u } = await supabaseAdmin.from('users').select('email').eq('id', userId).single();
      if (u) targetEmail = u.email;
    }

    // CASO 2: NOVO CONVITE OU RECUPERAÇÃO POR EMAIL
    if (!userId && targetEmail) {
      // Tenta criar o usuário no Auth
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: targetEmail,
        email_confirm: true,
        user_metadata: { name }
      });

      if (createError) {
        // Se já existe, precisamos achar o ID dele na lista do Auth
        if (createError.message.includes('already been registered')) {
          console.log('[BACKEND] User already exists in Auth, searching ID...');
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

    // Vincular ou Atualizar no public.users
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

    // Remove campos undefined para não sobrescrever com null se não enviado
    Object.keys(userPayload).forEach(key => userPayload[key] === undefined && delete userPayload[key]);

    const { data: newUser, error: upsertError } = await supabaseAdmin.from('users').upsert(userPayload).select().single();
    
    // Se der erro de coluna (caso a migration ainda não tenha batido 100% no cache), remove campos extras
    if (upsertError && upsertError.message.includes('column')) {
        const minimalFields = ['id', 'tenant_id', 'email', 'name', 'role', 'phone', 'cpf', 'cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state'];
        const cleanPayload: any = {};
        minimalFields.forEach(f => { if (userPayload[f] !== undefined) cleanPayload[f] = userPayload[f]; });
        const { data: retry } = await supabaseAdmin.from('users').upsert(cleanPayload).select().single();
        if (generateInvite) {
           const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
             type: 'invite', email: targetEmail, options: { redirectTo: `${process.env.NEXT_PUBLIC_OWNER_URL || 'https://791barber.com'}/login` }
           });
           return NextResponse.json({ ...retry, inviteLink: linkData.properties?.action_link });
        }
        return NextResponse.json(retry);
    }

    if (upsertError) throw upsertError;

    let inviteLink = null;
    if (generateInvite) {
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: targetEmail,
        options: { redirectTo: `${process.env.NEXT_PUBLIC_OWNER_URL || 'https://791barber.com'}/login` }
      });
      if (!linkErr) inviteLink = linkData.properties?.action_link;
    }

    return NextResponse.json({ ...newUser, inviteLink });
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
       // Fallback se colunas novas falharem
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
