import { createBrowserClient } from '@supabase/ssr';

// Browser-side Supabase client — singleton so the auth subscription
// doesn't get duplicated across renders. Always reads from the `crm`
// schema; the auth cookies are managed automatically.

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { db: { schema: 'crm' } },
    );
  }
  return browserClient;
}
