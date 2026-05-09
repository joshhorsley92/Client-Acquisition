// GET /api/reports/summary — top-level KPIs, with one-time vs MRR split.
// `pipelineValue` is one-time only for cash-flow forecasting that doesn't
// double-count multi-month retainers. `mrrPipeline` is the parallel MRR
// figure (sum of monthly_recurring_value across open engagements).
// `activeMrr` / `annualizedMrr` measure locked-in retainer revenue from
// won engagements.

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
    supabase
      .from('engagements')
      .select('estimated_value, monthly_recurring_value', { count: 'exact' })
      .in('status', ['new', 'working']),
    supabase
      .from('engagements')
      .select('estimated_value, closed_value, monthly_recurring_value, closed_monthly_value, contract_months, opened_at, closed_at', { count: 'exact' })
      .eq('status', 'won'),
    supabase.from('engagements').select('*', { count: 'exact', head: true }).eq('status', 'lost'),
  ]);

  const pipelineValue = (openRows || []).reduce(
    (s: number, r: any) => s + (Number(r.estimated_value) || 0), 0,
  );
  const mrrPipeline = (openRows || []).reduce(
    (s: number, r: any) => s + (Number(r.monthly_recurring_value) || 0), 0,
  );

  // Lifetime revenue counts the one-time portion of every won deal plus
  // realized MRR (closed_monthly_value × elapsed months, capped by
  // contract_months when set). For ongoing retainers without a closed date,
  // realized months = months since closed_at.
  const now = Date.now();
  let lifetimeRevenue = 0;
  let activeMrr = 0;
  for (const r of wonRows || []) {
    const oneTime = Number(r.closed_value) || Number(r.estimated_value) || 0;
    const mrr = Number(r.closed_monthly_value) || Number(r.monthly_recurring_value) || 0;
    lifetimeRevenue += oneTime;

    if (mrr > 0) {
      const startMs = r.closed_at ? new Date(r.closed_at).getTime() : null;
      const elapsedMonths = startMs ? Math.max(0, (now - startMs) / (1000 * 60 * 60 * 24 * 30.4375)) : 0;
      const contractCap = r.contract_months ? Number(r.contract_months) : null;
      const months = contractCap ? Math.min(elapsedMonths, contractCap) : elapsedMonths;
      lifetimeRevenue += mrr * months;

      // "Active" = retainer still inside its contract window (or open-ended).
      if (!contractCap || elapsedMonths < contractCap) {
        activeMrr += mrr;
      }
    }
  }

  const totalClosed = (won || 0) + (lost || 0);
  const winRate = totalClosed > 0 ? Math.round(((won || 0) / totalClosed) * 100) : 0;

  const cycles = (wonRows || [])
    .filter((r: any) => r.closed_at && r.opened_at)
    .map((r: any) => (new Date(r.closed_at).getTime() - new Date(r.opened_at).getTime()) / (1000 * 60 * 60 * 24));
  const avgEngagementCycle = cycles.length ? Math.round(cycles.reduce((a: number, b: number) => a + b, 0) / cycles.length) : null;

  return NextResponse.json({
    summary: {
      clients: clients || 0,
      openEngagements: openEngagements || 0,
      pipelineValue,
      mrrPipeline,
      activeMrr,
      annualizedMrr: activeMrr * 12,
      lifetimeRevenue: Math.round(lifetimeRevenue * 100) / 100,
      winRate,
      totalWon: won || 0,
      totalLost: lost || 0,
      avgEngagementCycle,
    },
  });
}
