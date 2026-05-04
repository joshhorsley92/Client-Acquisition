// GET /api/integrations — list all integration_settings rows

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { data, error } = await supabase
    .from('integration_settings').select('*').order('type', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ integrations: data });
}
