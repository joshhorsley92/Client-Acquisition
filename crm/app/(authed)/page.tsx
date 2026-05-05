// Home dashboard — top-level KPI tiles + recent activity feed.
// Server Component: data fetched on the server; first paint has real numbers.

import Link from 'next/link';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export default async function HomePage() {
  const result = await requireAuth();
  if (isAuthError(result)) return null;
  const { supabase } = result;

  const [
    { count: clientCount },
    { count: openEngagements, data: openRows },
    { data: wonRows },
    { data: recentActivities },
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('engagements')
      .select('estimated_value', { count: 'exact' })
      .in('status', ['new', 'working']),
    supabase.from('engagements')
      .select('estimated_value, closed_value')
      .eq('status', 'won'),
    supabase.from('activities')
      .select('id, type, content, created_at, client_id, clients(name)')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const pipelineValue = (openRows || []).reduce(
    (s: number, r: any) => s + (Number(r.estimated_value) || 0), 0,
  );
  const lifetimeRevenue = (wonRows || []).reduce(
    (s: number, r: any) => s + (Number(r.closed_value) || Number(r.estimated_value) || 0), 0,
  );

  return (
    <div>
      <div style={headerRow}>
        <h1 style={h1Style}>Home</h1>
        <Link href="/clients" style={primaryLinkBtn}>+ New Client</Link>
      </div>

      <div style={kpiGrid}>
        <KpiTile label="Clients" value={String(clientCount || 0)} href="/clients" />
        <KpiTile label="Open engagements" value={String(openEngagements || 0)} href="/engagements" />
        <KpiTile label="Pipeline value" value={fmtMoney(pipelineValue)} href="/engagements?status=working" />
        <KpiTile label="Lifetime revenue" value={fmtMoney(lifetimeRevenue)} href="/reports" />
      </div>

      <section style={panel}>
        <h2 style={h2Style}>Recent activity</h2>
        {(!recentActivities || recentActivities.length === 0) ? (
          <p style={{ color: '#94a3b8', fontSize: 13 }}>
            No activity yet. Add a client or import a CSV to get started.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {recentActivities.map((a: any) => (
              <li key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid #F0F2F5' }}>
                <div style={{ fontSize: 13, color: '#1B2838' }}>
                  {a.client_id && a.clients?.name && (
                    <Link href={`/clients/${a.client_id}`} style={{ color: '#00D4AA', fontWeight: 600 }}>
                      {a.clients.name}
                    </Link>
                  )}
                  <span style={{ marginLeft: 8 }}>{a.content || '(no content)'}</span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {a.type} · {fmtRelative(a.created_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function KpiTile({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} style={kpiTileStyle}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#1B2838' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{label}</div>
    </Link>
  );
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
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

const headerRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24,
};
const h1Style: React.CSSProperties = { fontSize: 24, fontWeight: 700, margin: 0 };
const h2Style: React.CSSProperties = { fontSize: 14, fontWeight: 700, margin: 0, marginBottom: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 };
const kpiGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24,
};
const kpiTileStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 20,
  border: '1px solid #E2E6EB', textDecoration: 'none',
  display: 'block',
};
const panel: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 20,
  border: '1px solid #E2E6EB',
};
const primaryLinkBtn: React.CSSProperties = {
  background: '#00D4AA', color: '#1B2838',
  borderRadius: 6, padding: '8px 16px',
  fontWeight: 600, fontSize: 13,
  textDecoration: 'none',
};
