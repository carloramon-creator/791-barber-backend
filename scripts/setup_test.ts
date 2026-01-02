
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    // 1. Get a barber
    const { data: barbers, error: barberError } = await supabase
        .from('barbers')
        .select('id, name, tenant_id')
        .limit(1);

    if (barberError || !barbers?.length) {
        console.error('No barbers found or error:', barberError);
        return;
    }

    const barber = barbers[0];
    console.log(`Found barber: ${barber.name} (${barber.id})`);

    // 2. Create a ticket
    const { data: ticket, error: ticketError } = await supabase
        .from('client_queue')
        .insert({
            tenant_id: barber.tenant_id,
            barber_id: barber.id,
            client_name: 'Usuário de Teste',
            status: 'waiting',
            position: 99, // Arbitrary
            estimated_time_minutes: 30
        })
        .select()
        .single();

    if (ticketError) {
        console.error('Error creating ticket:', ticketError);
        return;
    }

    console.log('TICKET_CREATED:', ticket.id);
    console.log(`URL: http://localhost:3000/fila/${ticket.id}`);
}

main();
