// POST /api/integrations/google/disconnect — clear Gmail + Calendar tokens

import { NextResponse } from 'next/server';
import { requireAdminAuth, isAuthError } from '@/lib/api-auth';

export async function POST() {
  const result = await requireAdminAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  // Clear both rows (Gmail + google_calendar share the same OAuth grant).
  await supabase
    .from('integration_settings')
    .upsert([
      { type: 'gmail', config: {}, enabled: false },
      { type: 'google_calendar', config: {}, enabled: false },
    ], { onConflict: 'type' });

  return NextResponse.json({ ok: true });
}
