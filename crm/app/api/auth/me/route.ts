// GET /api/auth/me
// Returns the current user + their crm.profiles row. 401 if not signed in.
// Used by the frontend on initial render to decide what to show.

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth } = result;
  return NextResponse.json({
    user: { id: auth.userId, name: auth.name, role: auth.role },
  });
}
