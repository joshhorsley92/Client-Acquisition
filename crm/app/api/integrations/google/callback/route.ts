// GET /api/integrations/google/callback — Google redirects here after consent.
// **v1.0: 501** — see /api/integrations/google/auth for why.

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'Google OAuth callback is not wired in v1.0.' },
    { status: 501 },
  );
}
