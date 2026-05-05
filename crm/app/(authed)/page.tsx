// Home dashboard. Doubles as the analytics page since they're really the
// same thing — KPIs + by-source breakdown + quarterly cohort + recent
// activity. Server-rendered; first paint has real numbers.
//
// What we deliberately don't compute:
//   - CAC: needs marketing spend (not in the CRM).
//   - ROI / hours: time tracking lives in Freshbooks (see
//     project_freshbooks_time_tracking memo). Future Freshbooks
//     integration unlocks both.

import Link from 'next/link';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { cn } from '@/lib/cn';

type Engagement = {
  id: number;
  client_id: number;
  status: 'new' | 'working' | 'won' | 'lost';
  source: string | null;
  estimated_value: number | string;
  closed_value: number | string | null;
  opened_at: string;
  closed_at: string | null;
};

type Activity = {
  id: number;
  type: string;
  content: string | null;
  created_at: string;
  client_id: number | null;
  // PostgREST embeds the joined `clients(name)` row as an object when a
  // single match exists; the generated types describe it as an array.
  // We tolerate either shape rather than fight the types.
  clients?: { name: string } | { name: string }[] | null;
};

type SourceMetrics = {
  source: string;
  count: number;
  open: number;
  won: number;
  lost: number;
  pipeline: number;
  closed: number;
  avgDealSize: number | null;
  winRate: number | null;
  avgCycleDays: number | null;
};

const SOURCE_ORDER = ['referral', 'cold', 'web', 'content', 'paid_ads', 'unset'] as const;
const SOURCE_LABELS: Record<string, string> = {
  referral: 'Referral',
  cold: 'Cold',
  web: 'Web',
  content: 'Content',
  paid_ads: 'Paid ads',
  unset: 'Unset',
};

export default async function HomePage() {
  const result = await requireAuth();
  if (isAuthError(result)) return null;
  const { supabase } = result;

  const [
    { count: clientCount },
    { data: engagementsRaw },
    { data: recentActivities },
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('engagements')
      .select('id, client_id, status, source, estimated_value, closed_value, opened_at, closed_at'),
    supabase.from('activities')
      .select('id, type, content, created_at, client_id, clients(name)')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const engagements = (engagementsRaw as Engagement[] | null) || [];
  const bySource = aggregateBySource(engagements);
  const quarterly = aggregateQuarterly(engagements);

  const won = engagements.filter((e) => e.status === 'won');
  const lost = engagements.filter((e) => e.status === 'lost');
  const open = engagements.filter((e) => e.status === 'new' || e.status === 'working');
  const pipeline = sumNum(open.map((e) => Number(e.estimated_value) || 0));
  const lifetimeRevenue = sumNum(won.map((e) => Number(e.closed_value) || Number(e.estimated_value) || 0));
  const overallWinRate = (won.length + lost.length) > 0
    ? won.length / (won.length + lost.length) : null;
  const cycleDays = won
    .filter((e) => e.opened_at && e.closed_at)
    .map((e) => (new Date(e.closed_at!).getTime() - new Date(e.opened_at).getTime()) / 86400000);
  const avgCycle = cycleDays.length ? Math.round(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) : null;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold m-0">Home</h1>
        <Link
          href="/clients"
          className="bg-brand-mint text-brand-charcoal rounded-md px-4 py-2 font-semibold text-[13px] hover:bg-brand-mint-dark transition-colors"
        >
          + New Client
        </Link>
      </div>

      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <KpiTile label="Clients" value={String(clientCount || 0)} href="/clients" />
        <KpiTile label="Open engagements" value={String(open.length)} href="/engagements" />
        <KpiTile label="Pipeline" value={fmtMoney(pipeline)} href="/engagements?status=working" />
        <KpiTile label="Lifetime revenue" value={fmtMoney(lifetimeRevenue)} />
        <KpiTile label="Win rate" value={overallWinRate == null ? '—' : `${Math.round(overallWinRate * 100)}%`} />
        <KpiTile label="Avg cycle" value={avgCycle == null ? '—' : `${avgCycle}d`} />
      </div>

      <Panel title="By source">
        {bySource.length === 0 ? (
          <Empty>No engagements yet — channel analytics light up once you add a few.</Empty>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-[13px] min-w-[720px]">
              <thead>
                <tr className="text-left">
                  <Th>Source</Th>
                  <Th align="right">Count</Th>
                  <Th align="right">Open</Th>
                  <Th align="right">Won</Th>
                  <Th align="right">Lost</Th>
                  <Th align="right">Win rate</Th>
                  <Th align="right">Pipeline</Th>
                  <Th align="right">Closed</Th>
                  <Th align="right">Avg deal</Th>
                  <Th align="right">Avg cycle</Th>
                </tr>
              </thead>
              <tbody>
                {bySource.map((m) => (
                  <tr key={m.source} className="border-t border-surface-alt">
                    <Td className="font-semibold">{SOURCE_LABELS[m.source] || m.source}</Td>
                    <Td align="right">{m.count}</Td>
                    <Td align="right">{m.open}</Td>
                    <Td align="right" className="text-success font-semibold">{m.won}</Td>
                    <Td align="right" className="text-danger font-semibold">{m.lost}</Td>
                    <Td align="right"><WinRatePill rate={m.winRate} /></Td>
                    <Td align="right">{fmtMoney(m.pipeline)}</Td>
                    <Td align="right" className="font-semibold">{fmtMoney(m.closed)}</Td>
                    <Td align="right">{m.avgDealSize == null ? '—' : fmtMoney(m.avgDealSize)}</Td>
                    <Td align="right">{m.avgCycleDays == null ? '—' : `${m.avgCycleDays}d`}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-ink-faint mt-3 leading-relaxed">
          Win rate = won / (won + lost). Open engagements are excluded from cycle time and avg deal calculations.
          {' '}<strong>CAC and ROI</strong> require Freshbooks (hours) + a marketing-spend source — not computable from CRM data alone.
        </p>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 mt-4">
        <Panel title="Quarterly cohort (closed engagements)">
          {quarterly.length === 0 ? (
            <Empty>No closed engagements yet.</Empty>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left">
                  <Th>Quarter</Th>
                  <Th align="right">Won</Th>
                  <Th align="right">Lost</Th>
                  <Th align="right">Win rate</Th>
                  <Th align="right">Revenue</Th>
                  <Th align="right">Avg cycle</Th>
                </tr>
              </thead>
              <tbody>
                {quarterly.map((q) => (
                  <tr key={q.quarter} className="border-t border-surface-alt">
                    <Td className="font-semibold tabular-nums">{q.quarter}</Td>
                    <Td align="right" className="text-success font-semibold">{q.won}</Td>
                    <Td align="right" className="text-danger font-semibold">{q.lost}</Td>
                    <Td align="right"><WinRatePill rate={q.winRate} /></Td>
                    <Td align="right" className="font-semibold">{fmtMoney(q.revenue)}</Td>
                    <Td align="right">{q.avgCycleDays == null ? '—' : `${q.avgCycleDays}d`}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Recent activity">
          {(!recentActivities || recentActivities.length === 0) ? (
            <Empty>No activity yet. Add a client or import a CSV to get started.</Empty>
          ) : (
            <ul className="list-none p-0 m-0">
              {(recentActivities as unknown as Activity[]).filter((a) => a.content).map((a) => {
                const clientName = Array.isArray(a.clients) ? a.clients[0]?.name : a.clients?.name;
                return (
                  <li key={a.id} className="py-2 border-b border-surface-alt last:border-b-0">
                    <div className="text-[13px] text-ink">
                      {a.client_id && clientName && (
                        <Link href={`/clients/${a.client_id}`} className="text-brand-mint font-semibold hover:underline">
                          {clientName}
                        </Link>
                      )}
                      <span className="ml-2">{a.content}</span>
                    </div>
                    <div className="text-[11px] text-ink-faint mt-0.5">
                      {a.type} · {fmtRelative(a.created_at)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------
function aggregateBySource(rows: Engagement[]): SourceMetrics[] {
  const groups = new Map<string, Engagement[]>();
  for (const r of rows) {
    const key = r.source || 'unset';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return SOURCE_ORDER
    .filter((s) => groups.has(s))
    .map((s) => metricsForGroup(s, groups.get(s)!))
    .sort((a, b) => (a.source === 'unset' ? 1 : 0) - (b.source === 'unset' ? 1 : 0));
}

function metricsForGroup(source: string, rows: Engagement[]): SourceMetrics {
  const open = rows.filter((r) => r.status === 'new' || r.status === 'working');
  const won = rows.filter((r) => r.status === 'won');
  const lost = rows.filter((r) => r.status === 'lost');

  const pipeline = sumNum(open.map((r) => Number(r.estimated_value) || 0));
  const wonValues = won.map((r) => Number(r.closed_value) || Number(r.estimated_value) || 0);
  const closed = sumNum(wonValues);

  const winRate = (won.length + lost.length) > 0
    ? won.length / (won.length + lost.length) : null;

  const cycleDays = won
    .filter((r) => r.opened_at && r.closed_at)
    .map((r) => (new Date(r.closed_at!).getTime() - new Date(r.opened_at).getTime()) / 86400000);
  const avgCycleDays = cycleDays.length
    ? Math.round(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) : null;

  return {
    source,
    count: rows.length,
    open: open.length,
    won: won.length,
    lost: lost.length,
    pipeline,
    closed,
    avgDealSize: wonValues.length ? Math.round(closed / wonValues.length) : null,
    winRate,
    avgCycleDays,
  };
}

function aggregateQuarterly(rows: Engagement[]) {
  type Q = {
    quarter: string;
    won: number;
    lost: number;
    revenue: number;
    cycles: number[];
  };
  const m = new Map<string, Q>();
  for (const r of rows) {
    if (r.status !== 'won' && r.status !== 'lost') continue;
    if (!r.closed_at) continue;
    const d = new Date(r.closed_at);
    const q = `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
    if (!m.has(q)) m.set(q, { quarter: q, won: 0, lost: 0, revenue: 0, cycles: [] });
    const bucket = m.get(q)!;
    if (r.status === 'won') {
      bucket.won++;
      bucket.revenue += Number(r.closed_value) || Number(r.estimated_value) || 0;
      if (r.opened_at) {
        bucket.cycles.push((new Date(r.closed_at).getTime() - new Date(r.opened_at).getTime()) / 86400000);
      }
    } else {
      bucket.lost++;
    }
  }
  return Array.from(m.values())
    .sort((a, b) => b.quarter.localeCompare(a.quarter))
    .map((q) => ({
      quarter: q.quarter,
      won: q.won,
      lost: q.lost,
      revenue: q.revenue,
      winRate: (q.won + q.lost) > 0 ? q.won / (q.won + q.lost) : null,
      avgCycleDays: q.cycles.length
        ? Math.round(q.cycles.reduce((a, b) => a + b, 0) / q.cycles.length) : null,
    }));
}

function sumNum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`.replace('.0K', 'K');
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtRelative(iso: string): string {
  const date = new Date(iso);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 86400 * 7) return `${Math.round(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// UI primitives
// ---------------------------------------------------------------------------
function KpiTile({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <>
      <div className="text-[22px] font-bold text-ink tabular-nums">{value}</div>
      <div className="text-[11px] text-ink-muted mt-1">{label}</div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block bg-surface rounded-lg p-4 border border-edge no-underline hover:border-brand-mint hover:shadow-card transition-all"
      >
        {content}
      </Link>
    );
  }
  return (
    <div className="bg-surface rounded-lg p-4 border border-edge">
      {content}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-lg p-4 border border-edge">
      <h2 className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mt-0 mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] text-ink-faint">{children}</div>;
}

function Th({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={cn(
      'px-3 py-2 text-[11px] font-semibold text-ink-muted uppercase tracking-wider',
      align === 'right' ? 'text-right' : 'text-left',
    )}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left', className }: { children: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <td className={cn(
      'px-3 py-2 text-ink',
      align === 'right' ? 'text-right tabular-nums' : 'text-left',
      className,
    )}>
      {children}
    </td>
  );
}

function WinRatePill({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-ink-faint">—</span>;
  const pct = Math.round(rate * 100);
  const tone =
    pct >= 67 ? 'bg-success-bg text-success border-success-border'
    : pct >= 34 ? 'bg-warning-bg text-warning border-warning-border'
    : 'bg-danger-bg text-danger-strong border-danger-border';
  return (
    <span className={cn(
      'inline-block min-w-[44px] px-2 py-0.5 rounded-full border text-xs font-semibold tabular-nums',
      tone,
    )}>
      {pct}%
    </span>
  );
}
