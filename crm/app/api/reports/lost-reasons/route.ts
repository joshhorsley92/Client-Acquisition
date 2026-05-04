// GET /api/reports/lost-reasons — count of lost engagements per reason

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { data, error } = await supabase
    .from('engagements')
    .select('lost_reason')
    .eq('status', 'lost')
    .not('lost_reason', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tally = new Map<string, number>();
  for (const row of data || []) {
    if (!row.lost_reason) continue;
    tally.set(row.lost_reason, (tally.get(row.lost_reason) || 0) + 1);
  }
  const reasons = Array.from(tally, ([lost_reason, count]) => ({ lost_reason, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ reasons });
}
