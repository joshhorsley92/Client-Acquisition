// GET /api/reports/status — count of engagements per status

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { data, error } = await supabase.from('engagements').select('status');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tally = new Map<string, number>();
  for (const row of data || []) {
    tally.set(row.status, (tally.get(row.status) || 0) + 1);
  }
  const status = Array.from(tally, ([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ status });
}
