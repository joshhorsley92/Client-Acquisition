// GET /api/integrations/google/auth — admin-only OAuth init
// **v1.0: 501 Not Implemented.** Google OAuth lands in v1.x. The whole
// Gmail + Calendar integration was tied to local-disk token storage in
// the prototype; porting cleanly needs the integration_settings.config
// JSONB to hold tokens + refresh logic, plus a public callback URL.
// Defer until we actually need email tracking on the cloud version.

import { NextResponse } from 'next/server';
import { requireAdminAuth, isAuthError } from '@/lib/api-auth';

export async function GET() {
  const result = await requireAdminAuth();
  if (isAuthError(result)) return result;
  return NextResponse.json(
    { error: 'Google OAuth integration is not wired in v1.0. Comes back in v1.x.' },
    { status: 501 },
  );
}
