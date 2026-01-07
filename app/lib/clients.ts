import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Encontra um cliente pelo telefone ou cria um novo.
 *
 * @param client Supabase client (deve ter permissão para ler/gravar na tabela clients)
 * @param tenantId ID da barbearia
 * @param name Nome do cliente
 * @param phone Telefone do cliente
 * @returns O objeto cliente (com id)
 */
export async function findOrCreateClientByPhone(
    client: SupabaseClient,
    tenantId: string,
    name: string,
    phone: string,
    cpf?: string,
    photoUrl?: string
) {
    // 1. Tenta encontrar cliente existente
    const { data: existing, error: findError } = await client
        .from('clients')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('phone', phone)
        .maybeSingle();

    if (findError) {
        throw new Error(`Erro ao buscar cliente: ${findError.message}`);
    }

    if (existing) {
        // Atualizar dados se mudaram
        const updates: any = {};
        if (existing.name !== name) updates.name = name;
        if (cpf && existing.cpf !== cpf) updates.cpf = cpf;
        if (photoUrl && existing.photo_url !== photoUrl) updates.photo_url = photoUrl;

        if (Object.keys(updates).length > 0) {
            const { data: updated } = await client
                .from('clients')
                .update(updates)
                .eq('id', existing.id)
                .select()
                .single();
            return updated || existing;
        }
        return existing;
    }

    // 2. Se não existir, cria novo
    const { data: created, error: createError } = await client
        .from('clients')
        .insert({
            tenant_id: tenantId,
            name,
            phone,
            cpf,
            photo_url: photoUrl
        })
        .select('*')
        .single();

    if (createError) {
        // Pode haver race condition se dois requests chegarem juntos. Tentar buscar de novo.
        if (createError.code === '23505') { // Unique violation
            const { data: retryExisting } = await client
                .from('clients')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('phone', phone)
                .maybeSingle();
            if (retryExisting) return retryExisting;
        }
        throw new Error(`Erro ao criar cliente: ${createError.message}`);
    }

    return created;
}
