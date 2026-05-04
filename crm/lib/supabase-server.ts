import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// All CRM tables live in the `crm` Postgres schema (sibling Dashboard
// owns `public`). Setting `db.schema` here means every `.from('clients')`
// call resolves to `crm.clients` automatically.
const CRM_SCHEMA = 'crm';

// Server-side Supabase client (user-scoped, subject to RLS). Use in API
// route handlers and Server Components. Reads/writes the auth cookies via
// Next.js's cookies() helper. Async because Next 15+ made cookies() async.
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: CRM_SCHEMA },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set({ name, value, ...options });
            }
          } catch {
            // Server Components can't set cookies — ignore silently.
            // Middleware refreshes the session cookie before the request
            // reaches the Server Component, so this is fine.
          }
        },
      },
    },
  );
}

// Service-role Supabase client (bypasses RLS). Use ONLY in API routes for
// admin work like seeding users or writing audit_log rows. Never expose to
// the client. Errors loudly if SUPABASE_SERVICE_ROLE_KEY isn't set.
//
// Connection pooling: when SUPABASE_POOLER_URL is set, uses the pooler
// endpoint (PgBouncer transaction mode) so serverless workers don't
// exhaust direct Postgres connections.
export function createServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for admin operations. ' +
        'Find it in your Supabase dashboard under Settings > API.',
    );
  }

  const supabaseUrl =
    process.env.SUPABASE_POOLER_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;

  return createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: CRM_SCHEMA },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
