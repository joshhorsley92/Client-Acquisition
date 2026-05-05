// GET /api/integrations — admin-only list of integration_settings rows.
// Each row's `config` JSONB may hold API keys / OAuth tokens, so this is
// gated behind requireAdminAuth, not requireAuth.

import { NextResponse } from 'next/server';
import { requireAdminAuth, isAuthError } from '@/lib/api-auth';

export async function GET() {
  const result = await requireAdminAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { data, error } = await supabase
    .from('integration_settings').select('*').order('type', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ integrations: data });
}
