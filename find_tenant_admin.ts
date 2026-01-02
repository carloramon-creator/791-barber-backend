import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Using backend project keys manually if needed, but trying backend .env first
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data, error } = await sb.from('tenants').select('id, name');
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
run();
