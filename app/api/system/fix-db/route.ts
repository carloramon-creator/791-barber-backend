import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';

export async function GET() {
    try {
        console.log('Aplicando correção de banco de dados...');

        // 1. Adicionar coluna expires_at
        const { error: error1 } = await supabaseAdmin.rpc('run_sql_query', {
            query: "ALTER TABLE system_coupons ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;"
        });

        // Se RPC não existir (comum), tentamos via SQL direto se tiver permissão, 
        // mas o supabase-js não permite DDL direto normalmente.
        // Então vamos tentar uma abordagem mais criativa se o RPC não estiver disponível:
        // Mensagem explicativa.

        return NextResponse.json({
            message: "Para aplicar esta mudança, você precisa rodar o SQL no painel do Supabase.",
            sql: "ALTER TABLE system_coupons ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE; NOTIFY pgrst, 'reload schema';",
            instruction: "Copie o SQL acima e cole no SQL Editor do Supabase."
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
