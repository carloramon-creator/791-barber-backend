import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mfbiwvhxztejuzcasclv.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey!);

async function checkTicket(partialId: string) {
    const { data, error } = await supabase
        .from('client_queue')
        .select('id, client_name, status, created_at, tenants(id, name)')
        .or(`id.ilike.${partialId}%,id.eq.${partialId}`)
        .maybeSingle();

    if (error) {
        console.error('Error:', error);
    } else if (!data) {
        console.log(`Ticket starting with ${partialId} not found.`);
    } else {
        console.log('Ticket found:');
        console.table([data]);
    }
}

const partial = process.argv[2] || '525bedb3';
checkTicket(partial);
