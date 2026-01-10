import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mfbiwvhxztejuzcasclv.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey!);

async function checkRecentTickets() {
    const { data, error } = await supabase
        .from('client_queue')
        .select('id, client_name, status, created_at, tenants(name)')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Last 20 tickets:');
        console.table(data);
    }
}

checkRecentTickets();
