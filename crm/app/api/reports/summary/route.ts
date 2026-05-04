// GET /api/reports/summary — top-level KPIs

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const [
    { count: clients },
    { count: openEngagements, data: openRows },
    { count: won, data: wonRows },
    { count: lost },
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('engagements').select('estimated_value', { count: 'exact' }).in('status', ['new', 'working']),
    supabase.from('engagements').select('estimated_value, closed_value, opened_at, closed_at', { count: 'exact' }).eq('status', 'won'),
    supabase.from('engagements').select('*', { count: 'exact', head: true }).eq('status', 'lost'),
  ]);

  const pipelineValue = (openRows || []).reduce(
    (s: number, r: any) => s + (Number(r.estimated_value) || 0), 0,
  );
  const lifetimeRevenue = (wonRows || []).reduce(
    (s: number, r: any) => s + (Number(r.closed_value) || Number(r.estimated_value) || 0), 0,
  );
  const totalClosed = (won || 0) + (lost || 0);
  const winRate = totalClosed > 0 ? Math.round(((won || 0) / totalClosed) * 100) : 0;

  // Avg cycle days: avg(closed_at - opened_at) over won engagements with closed_at set
  const cycles = (wonRows || [])
    .filter((r: any) => r.closed_at && r.opened_at)
    .map((r: any) => (new Date(r.closed_at).getTime() - new Date(r.opened_at).getTime()) / (1000 * 60 * 60 * 24));
  const avgEngagementCycle = cycles.length ? Math.round(cycles.reduce((a: number, b: number) => a + b, 0) / cycles.length) : null;

  return NextResponse.json({
    summary: {
      clients: clients || 0,
      openEngagements: openEngagements || 0,
      pipelineValue,
      lifetimeRevenue,
      winRate,
      totalWon: won || 0,
      totalLost: lost || 0,
      avgEngagementCycle,
    },
  });
}
