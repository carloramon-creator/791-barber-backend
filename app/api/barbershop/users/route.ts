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

    if (!email) return NextResponse.json({ error: 'Email é obrigatório' }, { status: 400 });

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
      state: body.state,
      avg_service_time: body.avg_service_time || 30,
      commission_type: body.commission_type || 'percentage',
      commission_value: body.commission_value || 50
    };

    // Filtro inteligente: tenta salvar. Se der erro de coluna, remove a coluna e tenta de novo.
    let { data: newUser, error: upsertError } = await supabaseAdmin.from('users').upsert(userPayload).select().single();

    if (upsertError && upsertError.message.includes('column')) {
       console.warn('[BACKEND] Reduzindo payload devido a colunas ausentes...');
       const cleanPayload = { ...userPayload };
       // Se o erro mencionar uma coluna específica, poderíamos remover só ela, 
       // mas para garantir o funcionamento do usuário agora, vamos remover os campos novos se falhar.
       const newFields = ['phone', 'cpf', 'cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'avg_service_time', 'commission_type', 'commission_value'];
       newFields.forEach(f => {
         if (upsertError?.message.includes(`column "${f}"`)) delete cleanPayload[f];
       });
       const { data: retry, error: retryErr } = await supabaseAdmin.from('users').upsert(cleanPayload).select().single();
       if (retryErr) throw retryErr;
       newUser = retry;
    } else if (upsertError) throw upsertError;

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

    let { data, error } = await supabaseAdmin.from('users').update(updates).eq('id', body.id).select().single();

    if (error && error.message.includes('column')) {
        const cleanUpdates = { ...updates };
        const newFields = ['phone', 'cpf', 'cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'avg_service_time', 'commission_type', 'commission_value'];
        newFields.forEach(f => {
            if (error?.message.includes(`column "${f}"`)) delete cleanUpdates[f];
        });
        const { data: retry } = await supabaseAdmin.from('users').update(cleanUpdates).eq('id', body.id).select().single();
        return NextResponse.json(retry);
    }

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
