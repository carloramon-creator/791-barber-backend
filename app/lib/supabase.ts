import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';

const DEFAULT_URL = 'https://mfb1wvhxztejuzcasclv.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mYjF3dmh4enRlanV6Y2FzY2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1ODM4NjUsImV4cCI6MjA4Mjc1OTg2NX0.DcGhBBvGlj_sipsryHgojiSZoLSVggqPFjLG7hj2OY4k';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mYjF3dmh4enRlanV6Y2FzY2x2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzU4Mzg2NSwiZXhwIjoyMDgyNzU5ODY1fQ.4_P_B9_B_B_B_B_B_B_B_B_B_B_B_B_B_B_B_B_B_B_Y'; // Placeholder if needed

export const supabase = async () => {
  const headerList = await headers();
  const authHeader = headerList.get('Authorization');

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL).trim();
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_KEY).trim();

  if (authHeader) {
    const token = authHeader.split(' ')[1];
    if (token) {
      return createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false }
      });
    }
  }

  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch { }
      }
    }
  });
};

export const supabaseAdmin = createClient(
  (process.env.SUPABASE_URL || DEFAULT_URL).trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
);
