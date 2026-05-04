// GET /api/reports/sources — count of engagements per source

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { data, error } = await supabase.from('engagements').select('source').not('source', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tally = new Map<string, number>();
  for (const row of data || []) {
    if (!row.source) continue;
    tally.set(row.source, (tally.get(row.source) || 0) + 1);
  }
  const sources = Array.from(tally, ([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ sources });
}
