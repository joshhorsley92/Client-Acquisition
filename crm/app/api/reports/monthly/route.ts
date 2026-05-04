// GET /api/reports/monthly — last 12 months of closed-won revenue

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { data, error } = await supabase
    .from('engagements')
    .select('closed_at, closed_value, estimated_value')
    .eq('status', 'won')
    .not('closed_at', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bucket by YYYY-MM in JS (Postgres-side date_trunc would be slightly faster
  // but at low volume the JS path is fine and easier to reason about).
  const buckets = new Map<string, { revenue: number; count: number }>();
  for (const row of data || []) {
    if (!row.closed_at) continue;
    const month = String(row.closed_at).slice(0, 7); // YYYY-MM
    const value = Number(row.closed_value) || Number(row.estimated_value) || 0;
    const cur = buckets.get(month) || { revenue: 0, count: 0 };
    cur.revenue += value;
    cur.count += 1;
    buckets.set(month, cur);
  }

  const monthly = Array.from(buckets, ([month, { revenue, count }]) => ({ month, revenue, count }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12);

  return NextResponse.json({ monthly });
}
