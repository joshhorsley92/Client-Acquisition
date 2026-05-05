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
    { data: monthlyRows },
    { data: clientRevenueRows },
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('engagements').select('estimated_value', { count: 'exact' }).in('status', ['new', 'working']),
    supabase.from('engagements').select('estimated_value, closed_value, opened_at, closed_at', { count: 'exact' }).eq('status', 'won'),
    supabase.from('engagements').select('*', { count: 'exact', head: true }).eq('status', 'lost'),
    supabase.from('engagements').select('status'),
    supabase.from('engagements').select('source').not('source', 'is', null),
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
  const monthly = bucketMonthly(monthlyRows || []);

  return (
    <div>
      <h1 style={h1}>Reports</h1>

      <div style={kpiGrid}>
        <KpiTile label="Clients" value={String(clientCount || 0)} />
        <KpiTile label="Open engagements" value={String(openEng || 0)} />
        <KpiTile label="Pipeline value" value={fmtMoney(pipelineValue)} />
        <KpiTile label="Lifetime revenue" value={fmtMoney(lifetimeRevenue)} />
        <KpiTile label="Win rate" value={`${winRate}%`} />
        <KpiTile label="Avg cycle" value={avgCycle != null ? `${avgCycle}d` : '—'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ReportPanel title="Engagements by status">
          <SimpleTable rows={statusTally.map(([k, v]) => ({ label: k, value: v }))} />
        </ReportPanel>
        <ReportPanel title="Engagements by source">
          {sourceTally.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>No source data yet.</div>
          ) : (
            <SimpleTable rows={sourceTally.map(([k, v]) => ({ label: k, value: v }))} />
          )}
        </ReportPanel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <ReportPanel title="Monthly closed-won revenue (last 12)">
          {monthly.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>No closed deals yet.</div>
          ) : (
            <SimpleTable rows={monthly.map(({ month, revenue, count }) => ({
              label: month, value: `${count} · ${fmtMoney(revenue)}`,
            }))} />
          )}
        </ReportPanel>
        <ReportPanel title="Top clients by lifetime revenue">
          {(clientRevenueRows || []).length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>No revenue yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={th}>Client</th>
                  <th style={{ ...th, textAlign: 'right' }}>Won</th>
                  <th style={{ ...th, textAlign: 'right' }}>Open</th>
                  <th style={{ ...th, textAlign: 'right' }}>Lifetime $</th>
                </tr>
              </thead>
              <tbody>
                {(clientRevenueRows || []).map((r: any) => (
                  <tr key={r.id} style={{ borderTop: '1px solid #F0F2F5' }}>
                    <td style={td}>
                      <Link href={`/clients/${r.id}`} style={{ color: '#1B2838', fontWeight: 600 }}>
                        {r.name}
                      </Link>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{r.won_engagements ?? 0}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{r.open_engagements ?? 0}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(Number(r.lifetime_revenue) || 0)}</td>
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
    <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #E2E6EB' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1B2838' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{label}</div>
    </div>
  );
}
function ReportPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #E2E6EB' }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 0, marginBottom: 12 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}
function SimpleTable({ rows }: { rows: Array<{ label: string; value: string | number }> }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}>
      {rows.map((r, i) => (
        <li key={i} style={{
          display: 'flex', justifyContent: 'space-between', padding: '6px 0',
          borderTop: i === 0 ? 'none' : '1px solid #F0F2F5',
        }}>
          <span style={{ color: '#1B2838' }}>{r.label}</span>
          <span style={{ color: '#64748B', fontWeight: 600 }}>{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, margin: '0 0 16px 0' };
const kpiGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16,
};
const th: React.CSSProperties = { padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '6px 10px', color: '#1B2838' };
