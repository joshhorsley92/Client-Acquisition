import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

// Shared auth helpers for API route handlers. Mirrors the Dashboard's
// `lib/api-auth.ts` so the team has one mental model across both apps.
//
// Usage:
//   const result = await requireAuth();
//   if (isAuthError(result)) return result;
//   const { auth, supabase } = result;

export interface AuthResult {
  userId: string;
  role: 'member' | 'admin';
  name?: string;
}

/**
 * Verify user is authenticated. Returns { auth, supabase } or 401 NextResponse.
 * Looks up the role from crm.profiles so callers can branch on it.
 */
type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export async function requireAuth(): Promise<
  | { auth: AuthResult; supabase: SupabaseServerClient }
  | NextResponse
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single();

  if (!profile) {
    // User is in auth.users but not crm.profiles — treat as forbidden,
    // not unauthenticated. The handle_new_user_to_crm() trigger should
    // have populated this; if it didn't, something's wrong.
    return NextResponse.json({ error: 'No CRM profile for this user' }, { status: 403 });
  }

  return {
    auth: { userId: user.id, role: profile.role as 'member' | 'admin', name: profile.name },
    supabase,
  };
}

/**
 * Verify user is an admin. Returns { auth, supabase } or 401/403 NextResponse.
 */
export async function requireAdminAuth(): Promise<
  | { auth: AuthResult; supabase: SupabaseServerClient }
  | NextResponse
> {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  if (result.auth.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  return result;
}

/**
 * Type guard: was the helper's result an error response (NextResponse)?
 */
export function isAuthError(result: unknown): result is NextResponse {
  return result instanceof NextResponse;
}
