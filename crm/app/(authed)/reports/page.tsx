// Reports page — KPI tiles + status / source / lost-reason / monthly /
// per-client revenue tables. Server component fetches everything in parallel.

import Link from 'next/link';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export default async function ReportsPage() {
  const result = await requireAuth();
  if (isAuthError(result)) return null;
  const { supabase } = result;

  const [
    { count: clientCount },
    { count: openEng, data: openRows },
    { count: wonCount, data: wonRows },
    { count: lostCount },
    { data: statusRows },
    { data: sourceRows },
    { data: lostReasonRows },
    { data: monthlyRows },
    { data: clientRevenueRows },
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('engagements').select('estimated_value', { count: 'exact' }).in('status', ['new', 'working']),
    supabase.from('engagements').select('estimated_value, closed_value, opened_at, closed_at', { count: 'exact' }).eq('status', 'won'),
    supabase.from('engagements').select('*', { count: 'exact', head: true }).eq('status', 'lost'),
    supabase.from('engagements').select('status'),
    supabase.from('engagements').select('source').not('source', 'is', null),
    supabase.from('engagements').select('lost_reason').eq('status', 'lost').not('lost_reason', 'is', null),
    supabase.from('engagements').select('closed_at, closed_value, estimated_value').eq('status', 'won').not('closed_at', 'is', null),
    supabase.from('clients_with_rollups').select('id, name, lifetime_revenue, won_engagements, open_engagements').order('lifetime_revenue', { ascending: false }).limit(20),
  ]);

  const pipelineValue = (openRows || []).reduce((s: number, r: any) => s + (Number(r.estimated_value) || 0), 0);
  const lifetimeRevenue = (wonRows || []).reduce(
    (s: number, r: any) => s + (Number(r.closed_value) || Number(r.estimated_value) || 0), 0,
  );
  const totalClosed = (wonCount || 0) + (lostCount || 0);
  const winRate = totalClosed > 0 ? Math.round(((wonCount || 0) / totalClosed) * 100) : 0;
  const cycles = (wonRows || [])
    .filter((r: any) => r.closed_at && r.opened_at)
    .map((r: any) => (new Date(r.closed_at).getTime() - new Date(r.opened_at).getTime()) / (1000 * 60 * 60 * 24));
  const avgCycle = cycles.length ? Math.round(cycles.reduce((a: number, b: number) => a + b, 0) / cycles.length) : null;

  const statusTally = tally(statusRows, (r: any) => r.status);
  const sourceTally = tally(sourceRows, (r: any) => r.source);
  const lostReasonTally = tally(lostReasonRows, (r: any) => r.lost_reason);
  const monthly = bucketMonthly(monthlyRows || []);

  return (
    <div>
      <h1 className="text-2xl font-bold m-0 mb-4">Reports</h1>

      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <KpiTile label="Clients" value={String(clientCount || 0)} />
        <KpiTile label="Open engagements" value={String(openEng || 0)} />
        <KpiTile label="Pipeline value" value={fmtMoney(pipelineValue)} />
        <KpiTile label="Lifetime revenue" value={fmtMoney(lifetimeRevenue)} />
        <KpiTile label="Win rate" value={`${winRate}%`} />
        <KpiTile label="Avg cycle" value={avgCycle != null ? `${avgCycle}d` : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ReportPanel title="Engagements by status">
          <SimpleTable rows={statusTally.map(([k, v]) => ({ label: k, value: v }))} />
        </ReportPanel>
        <ReportPanel title="Engagements by source">
          {sourceTally.length === 0 ? (
            <div className="text-xs text-ink-faint">No source data yet.</div>
          ) : (
            <SimpleTable rows={sourceTally.map(([k, v]) => ({ label: k, value: v }))} />
          )}
        </ReportPanel>
        <ReportPanel title="Why we lost">
          {lostReasonTally.length === 0 ? (
            <div className="text-xs text-ink-faint">No lost engagements with reasons recorded yet.</div>
          ) : (
            <BarList rows={lostReasonTally.map(([k, v]) => ({ label: k, value: v }))} />
          )}
        </ReportPanel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ReportPanel title="Monthly closed-won revenue (last 12)">
          {monthly.length === 0 ? (
            <div className="text-xs text-ink-faint">No closed deals yet.</div>
          ) : (
            <SimpleTable rows={monthly.map(({ month, revenue, count }) => ({
              label: month, value: `${count} · ${fmtMoney(revenue)}`,
            }))} />
          )}
        </ReportPanel>
        <ReportPanel title="Top clients by lifetime revenue">
          {(clientRevenueRows || []).length === 0 ? (
            <div className="text-xs text-ink-faint">No revenue yet.</div>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left">
                  <th className="px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Client</th>
                  <th className="px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted uppercase tracking-wider text-right">Won</th>
                  <th className="px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted uppercase tracking-wider text-right">Open</th>
                  <th className="px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted uppercase tracking-wider text-right">Lifetime $</th>
                </tr>
              </thead>
              <tbody>
                {(clientRevenueRows || []).map((r: any) => (
                  <tr key={r.id} className="border-t border-surface-alt">
                    <td className="px-2.5 py-1.5">
                      <Link href={`/clients/${r.id}`} className="text-ink font-semibold hover:text-brand-mint">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-2.5 py-1.5 text-ink text-right">{r.won_engagements ?? 0}</td>
                    <td className="px-2.5 py-1.5 text-ink text-right">{r.open_engagements ?? 0}</td>
                    <td className="px-2.5 py-1.5 text-ink text-right">{fmtMoney(Number(r.lifetime_revenue) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportPanel>
      </div>
    </div>
  );
}

function tally(rows: any[] | null, key: (r: any) => string | undefined): Array<[string, number]> {
  if (!rows) return [];
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function bucketMonthly(rows: any[]) {
  const m = new Map<string, { revenue: number; count: number }>();
  for (const r of rows) {
    const month = String(r.closed_at).slice(0, 7);
    const value = Number(r.closed_value) || Number(r.estimated_value) || 0;
    const cur = m.get(month) || { revenue: 0, count: 0 };
    cur.revenue += value; cur.count += 1;
    m.set(month, cur);
  }
  return [...m.entries()].map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);
}
function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-lg p-4 border border-edge">
      <div className="text-[22px] font-bold text-ink">{value}</div>
      <div className="text-[11px] text-ink-muted mt-1">{label}</div>
    </div>
  );
}
function ReportPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-lg p-4 border border-edge">
      <h2 className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mt-0 mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}
function SimpleTable({ rows }: { rows: Array<{ label: string; value: string | number }> }) {
  return (
    <ul className="list-none p-0 m-0 text-[13px]">
      {rows.map((r, i) => (
        <li
          key={i}
          className={`flex justify-between py-1.5 ${i === 0 ? '' : 'border-t border-surface-alt'}`}
        >
          <span className="text-ink">{r.label}</span>
          <span className="text-ink-muted font-semibold">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

// Bar list — same shape as SimpleTable but each row gets a horizontal
// bar showing relative magnitude. Useful when the comparison matters
// more than the absolute count.
function BarList({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="list-none p-0 m-0 text-[13px] space-y-2">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="flex justify-between text-ink mb-0.5">
            <span className="capitalize">{r.label}</span>
            <span className="text-ink-muted font-semibold tabular-nums">{r.value}</span>
          </div>
          <div className="h-1.5 bg-surface-alt rounded-full overflow-hidden">
            <div
              className="h-full bg-danger rounded-full"
              style={{ width: `${Math.round((r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
