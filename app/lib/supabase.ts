import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';

const DEFAULT_URL = 'https://mfb1wvhxztejuzcasclv.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mYjF3dmh4enRlanV6Y2FzY2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1ODM4NjUsImV4cCI6MjA4Mjc1OTg2NX0.DcGhBBvGlj_sipsryHgojiSZoLSVggqPFjLG7hj2OY4k';

export const supabase = async () => {
  const headerList = await headers();
  const authHeader = headerList.get('Authorization');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_KEY;

  // Se houver token no header (vindo do frontend cross-origin), usa ele
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    if (token) {
      return createClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false }
        }
      );
    }
  }

  // Senão, tenta via cookies (padrão Next.js local)
  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Pode ser ignorado se estiver em Middleware
          }
        },
      },
    }
  );
};

// Supabase Admin client for operations that bypass RLS
const supabaseUrl = 'https://mfb1wvhxztejuzcasclv.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey!
);
