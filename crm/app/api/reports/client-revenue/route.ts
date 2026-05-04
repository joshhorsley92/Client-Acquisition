// GET /api/reports/client-revenue — per-client lifetime revenue + pipeline

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  // Pull all clients + their engagements; aggregate in JS so we get
  // first/last won timestamps + per-status breakdowns. The clients_with_rollups
  // view has totals but lacks the per-client first_won_at / last_won_at.
  const [{ data: clients, error: cErr }, { data: engagements, error: eErr }] = await Promise.all([
    supabase.from('clients').select('id, name, industry, website'),
    supabase.from('engagements').select('client_id, status, estimated_value, closed_value, closed_at'),
  ]);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  // Group engagements by client_id once.
  const byClient = new Map<number | string, any[]>();
  for (const e of engagements || []) {
    const arr = byClient.get(e.client_id) || [];
    arr.push(e);
    byClient.set(e.client_id, arr);
  }

  const out = (clients || []).map((c) => {
    const engs = byClient.get(c.id) || [];
    const won = engs.filter((e) => e.status === 'won');
    const open = engs.filter((e) => ['new', 'working'].includes(e.status));
    const lifetime_revenue = won.reduce(
      (s: number, e: any) => s + (Number(e.closed_value) || Number(e.estimated_value) || 0), 0,
    );
    const open_pipeline = open.reduce(
      (s: number, e: any) => s + (Number(e.estimated_value) || 0), 0,
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
      lifetime_revenue,
      open_pipeline,
      first_won_at: wonDates[0] || null,
      last_won_at: wonDates[wonDates.length - 1] || null,
    };
  }).sort((a, b) => b.lifetime_revenue - a.lifetime_revenue);

  return NextResponse.json({ clients: out });
}
