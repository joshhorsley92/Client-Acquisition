// GET /api/reports/client-revenue — per-client lifetime revenue + pipeline,
// MRR-aware. Lifetime revenue counts realized one-time + realized MRR
// (capped by contract_months or "now" — whichever is sooner).

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;

export async function GET() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const [{ data: clients, error: cErr }, { data: engagements, error: eErr }] = await Promise.all([
    supabase.from('clients').select('id, name, industry, website'),
    supabase
      .from('engagements')
      .select('client_id, status, estimated_value, closed_value, monthly_recurring_value, closed_monthly_value, contract_months, closed_at'),
  ]);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  const byClient = new Map<number | string, any[]>();
  for (const e of engagements || []) {
    const arr = byClient.get(e.client_id) || [];
    arr.push(e);
    byClient.set(e.client_id, arr);
  }

  const now = Date.now();

  const out = (clients || []).map((c) => {
    const engs = byClient.get(c.id) || [];
    const won = engs.filter((e) => e.status === 'won');
    const open = engs.filter((e) => ['new', 'working'].includes(e.status));

    let lifetime_revenue = 0;
    let active_mrr = 0;
    for (const e of won) {
      lifetime_revenue += Number(e.closed_value) || Number(e.estimated_value) || 0;
      const mrr = Number(e.closed_monthly_value) || Number(e.monthly_recurring_value) || 0;
      if (mrr > 0) {
        const startMs = e.closed_at ? new Date(e.closed_at).getTime() : null;
        const elapsedMonths = startMs ? Math.max(0, (now - startMs) / MS_PER_MONTH) : 0;
        const cap = e.contract_months ? Number(e.contract_months) : null;
        const months = cap ? Math.min(elapsedMonths, cap) : elapsedMonths;
        lifetime_revenue += mrr * months;
        if (!cap || elapsedMonths < cap) active_mrr += mrr;
      }
    }

    const open_pipeline = open.reduce(
      (s: number, e: any) => s + (Number(e.estimated_value) || 0), 0,
    );
    const open_mrr_pipeline = open.reduce(
      (s: number, e: any) => s + (Number(e.monthly_recurring_value) || 0), 0,
    );

    const wonDates = won.map((e) => e.closed_at).filter(Boolean).sort();
    return {
      id: c.id,
      name: c.name,
      industry: c.industry,
      website: c.website,
      total_engagements: engs.length,
      won_engagements: won.length,
      open_engagements: open.length,
      lifetime_revenue: Math.round(lifetime_revenue * 100) / 100,
      active_mrr,
      open_pipeline,
      open_mrr_pipeline,
      first_won_at: wonDates[0] || null,
      last_won_at: wonDates[wonDates.length - 1] || null,
    };
  }).sort((a, b) => b.lifetime_revenue - a.lifetime_revenue);

  return NextResponse.json({ clients: out });
}
