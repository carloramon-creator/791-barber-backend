const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Carregar .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variáveis de ambiente não encontradas.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLastCharges() {
    console.log('--- Buscando últimas 5 transações de SAAS ---');
    const { data, error } = await supabase
        .from('finance')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Erro ao buscar financeiro:', error);
        return;
    }

    data.forEach(charge => {
        console.log(`\nID: ${charge.id}`);
        console.log(`Data: ${charge.created_at}`);
        console.log(`Descrição: ${charge.description}`);
        console.log(`Valor: R$ ${charge.value}`);
        console.log(`Status: ${charge.is_paid ? 'PAGO' : 'PENDENTE'}`);
        console.log(`Metadata:`, JSON.stringify(charge.metadata, null, 2));
    });
}

checkLastCharges();
