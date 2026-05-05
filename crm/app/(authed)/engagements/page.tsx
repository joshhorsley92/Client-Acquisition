'use client';

// Engagements list — kanban-ish view grouped by status, with inline
// quick-create. Click into an engagement to edit it (lives on the client
// detail page's Engagements tab in v1.0; dedicated detail page deferred).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import NewEngagementModal from '@/components/NewEngagementModal';

const STATUSES = ['new', 'working', 'won', 'lost'] as const;
type Status = (typeof STATUSES)[number];

interface EngagementRow {
  id: number;
  client_id: number;
  client_name?: string;
  status: Status;
  package_type?: string | null;
  estimated_value?: number;
  closed_value?: number | null;
  source?: string | null;
  notes?: string | null;
  opened_at: string;
}

export default function EngagementsPage() {
  const sp = useSearchParams();
  const initialStatus = (sp.get('status') as Status) || '';
  const initialClientId = sp.get('client_id') || '';

  const [statusFilter, setStatusFilter] = useState<Status | ''>(initialStatus);
  const [clientFilter, setClientFilter] = useState(initialClientId);
  const [engagements, setEngagements] = useState<EngagementRow[]>([]);
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setLoading(true); setErr('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (clientFilter) params.set('client_id', clientFilter);
      const data = await api.get<{ engagements: EngagementRow[] }>(`/api/engagements?${params}`);
      setEngagements(data.engagements || []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, clientFilter]);

  useEffect(() => {
    api.get<{ clients: any[] }>('/api/clients?sort_by=name&sort_dir=asc')
      .then((d) => setClients((d.clients || []).map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, []);

  // Group by status for the kanban view (only when no status filter set)
  const grouped: Record<Status, EngagementRow[]> = {
    new: [], working: [], won: [], lost: [],
  };
  for (const e of engagements) grouped[e.status]?.push(e);

  return (
    <div>
      <div style={headerRow}>
        <h1 style={h1}>Engagements</h1>
        <button onClick={() => setShowNew(true)} style={primaryBtn}>+ New Engagement</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={selectStyle}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={selectStyle}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {err && <div style={errorBox}>{err}</div>}

      {loading ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>
      ) : engagements.length === 0 ? (
        <div style={{
          background: '#fff', padding: 40, borderRadius: 8, border: '1px solid #E2E6EB',
          textAlign: 'center', color: '#64748B', fontSize: 13,
        }}>
          No engagements yet. Hit <strong>+ New Engagement</strong> to start one.
        </div>
      ) : statusFilter ? (
        <EngagementTable rows={engagements} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {STATUSES.map((s) => (
            <Column key={s} status={s} rows={grouped[s]} />
          ))}
        </div>
      )}

      <NewEngagementModal
        open={showNew}
        clients={clients}
        defaultClientId={clientFilter ? Number(clientFilter) : undefined}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); void load(); }}
      />
    </div>
  );
}

function Column({ status, rows }: { status: Status; rows: EngagementRow[] }) {
  return (
    <div style={{ background: '#F7F8FA', borderRadius: 8, padding: 10 }}>
      <div style={{
        fontSize: 11, color: '#64748B', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: 0.5, marginBottom: 8, padding: '0 4px',
      }}>
        {status} ({rows.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => <EngagementCard key={r.id} row={r} />)}
        {rows.length === 0 && (
          <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 16 }}>
            None
          </div>
        )}
      </div>
    </div>
  );
}

function EngagementCard({ row }: { row: EngagementRow }) {
  return (
    <Link href={`/clients/${row.client_id}`} style={{
      background: '#fff', borderRadius: 6, padding: 10, border: '1px solid #E2E6EB',
      display: 'block', textDecoration: 'none',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2838' }}>{row.client_name}</div>
      <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
        {row.package_type || 'Engagement'} #{row.id}
      </div>
      {(Number(row.closed_value) || Number(row.estimated_value) || 0) > 0 && (
        <div style={{ fontSize: 12, color: '#1B2838', fontWeight: 600, marginTop: 4 }}>
          ${(Number(row.closed_value) || Number(row.estimated_value) || 0).toLocaleString()}
        </div>
      )}
    </Link>
  );
}

function EngagementTable({ rows }: { rows: EngagementRow[] }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E2E6EB', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#F7F8FA', textAlign: 'left' }}>
            <Th>Client</Th><Th>Package</Th><Th>Status</Th>
            <Th>Source</Th><Th align="right">Value</Th><Th>Opened</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid #F0F2F5' }}>
              <td style={td}>
                <Link href={`/clients/${r.client_id}`} style={{ color: '#1B2838', fontWeight: 600 }}>
                  {r.client_name || `Client #${r.client_id}`}
                </Link>
              </td>
              <td style={td}>{r.package_type || '—'}</td>
              <td style={td}>{r.status}</td>
              <td style={td}>{r.source || '—'}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                ${Number(r.closed_value || r.estimated_value || 0).toLocaleString()}
              </td>
              <td style={td}>{new Date(r.opened_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: align }}>{children}</th>;
}
const headerRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 };
const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, margin: 0 };
const primaryBtn: React.CSSProperties = {
  background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
  padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const selectStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4,
  background: '#fff', fontSize: 13, minWidth: 180,
};
const errorBox: React.CSSProperties = {
  background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991b1b',
  padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 12,
};
const td: React.CSSProperties = { padding: '10px 14px', color: '#1B2838' };
