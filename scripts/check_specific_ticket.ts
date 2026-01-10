import { supabaseAdmin } from '../app/lib/supabase';

async function checkTicket() {
    const ticketId = '525bedb3-ef36-48ad-9be8-594fa15e413e';
    const { data, error } = await supabaseAdmin
        .from('client_queue')
        .select('*, tenants(name, slug)')
        .eq('id', ticketId)
        .single();

    if (error) {
        console.error('Error fetching ticket:', error);
    } else {
        console.log('Ticket data:', JSON.stringify(data, null, 2));
    }
}

checkTicket();
