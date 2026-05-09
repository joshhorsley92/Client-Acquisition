// GET /api/reports/monthly — last 12 months of revenue, with one-time and
// recurring revenue tracked as separate series. One-time revenue lands in
// the close month; MRR is distributed across each month from close_at
// forward, bounded by contract_months when set (otherwise spread to today).

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

interface Bucket {
  revenue: number;
  one_time_revenue: number;
  recurring_revenue: number;
  count: number;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function GET() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { data, error } = await supabase
    .from('engagements')
    .select('closed_at, closed_value, estimated_value, closed_monthly_value, monthly_recurring_value, contract_months')
    .eq('status', 'won')
    .not('closed_at', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const buckets = new Map<string, Bucket>();
  const ensure = (key: string): Bucket => {
    let cur = buckets.get(key);
    if (!cur) {
      cur = { revenue: 0, one_time_revenue: 0, recurring_revenue: 0, count: 0 };
      buckets.set(key, cur);
    }
    return cur;
  };

  const now = new Date();
  const horizonStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  for (const row of data || []) {
    if (!row.closed_at) continue;
    const closeDate = new Date(row.closed_at);
    const oneTime = Number(row.closed_value) || Number(row.estimated_value) || 0;
    const mrr = Number(row.closed_monthly_value) || Number(row.monthly_recurring_value) || 0;

    // One-time portion: lands in the close month + counted as one deal.
    const closeKey = monthKey(closeDate);
    const closeBucket = ensure(closeKey);
    closeBucket.one_time_revenue += oneTime;
    closeBucket.revenue += oneTime;
    closeBucket.count += 1;

    if (mrr <= 0) continue;

    // MRR portion: distribute across months from close month forward,
    // bounded by contract_months when set, capped at "now" so we don't
    // count revenue that hasn't actually been earned yet.
    const cap = row.contract_months ? Number(row.contract_months) : null;
    const cursor = new Date(Date.UTC(closeDate.getUTCFullYear(), closeDate.getUTCMonth(), 1));
    let monthsCounted = 0;
    while (cursor <= now) {
      if (cap !== null && monthsCounted >= cap) break;
      const key = monthKey(cursor);
      // Only credit MRR for the months we actually want in the response —
      // anything before the 12-month horizon won't be returned, but we
      // still need to accumulate it to keep "current month" math consistent.
      const bucket = ensure(key);
      bucket.recurring_revenue += mrr;
      bucket.revenue += mrr;
      monthsCounted += 1;
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  // Trim to last 12 months.
  const monthly = Array.from(buckets.entries())
    .filter(([key]) => {
      const [yStr, mStr] = key.split('-');
      const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, 1));
      return d >= horizonStart;
    })
    .map(([month, b]) => ({
      month,
      revenue: Math.round(b.revenue * 100) / 100,
      one_time_revenue: Math.round(b.one_time_revenue * 100) / 100,
      recurring_revenue: Math.round(b.recurring_revenue * 100) / 100,
      count: b.count,
    }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12);

  return NextResponse.json({ monthly });
}
