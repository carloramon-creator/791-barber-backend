import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://mfbiwvhxztejuzcasclv.supabase.co', 
  'sb_secret_CO1qjgf7SMQ4QQRzugzbGg_U5uVpcwS'
);

async function run() {
  const { data, error } = await sb.from('tenants').select('id, name');
  if (error) {
      console.error('ERROR:', JSON.stringify(error, null, 2));
      process.exit(1);
  }
  else console.log(JSON.stringify(data, null, 2));
}
run();
