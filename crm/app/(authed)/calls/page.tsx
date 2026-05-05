'use client';

// Calls list — all call recordings, filterable by client + review status.
// Add Call modal lives here; clicking a row opens the detail page.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import NewCallModal from '@/components/NewCallModal';

interface CallRow {
  id: number;
  client_id: number;
  client_name?: string;
  call_date?: string | null;
  transcript_source?: string | null;
  review_status?: string;
  created_at: string;
  duration_minutes?: number | null;
  audio_storage_path?: string | null;
}

const STATUS_OPTIONS = ['', 'none', 'pending', 'approved', 'rejected'];

export default function CallsPage() {
  const sp = useSearchParams();
  const initialClientId = sp.get('client_id') || '';
  const [clientFilter, setClientFilter] = useState(initialClientId);
  const [statusFilter, setStatusFilter] = useState('');
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setLoading(true); setErr('');
    try {
      const params = new URLSearchParams();
      if (clientFilter) params.set('client_id', clientFilter);
      if (statusFilter) params.set('review_status', statusFilter);
      const data = await api.get<{ calls: CallRow[] }>(`/api/calls?${params}`);
      setCalls(data.calls || []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientFilter, statusFilter]);

  // Client list for the filter dropdown + the New Call modal
  useEffect(() => {
    api.get<{ clients: any[] }>('/api/clients?sort_by=name&sort_dir=asc')
      .then((d) => setClients((d.clients || []).map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, []);

  return (
    <div>
      <div style={headerRow}>
        <h1 style={h1}>Calls</h1>
        <button onClick={() => setShowNew(true)} style={primaryBtn}>+ Add Call</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={selectStyle}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="">All review statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {err && <div style={errorBox}>{err}</div>}

      {loading ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>
      ) : calls.length === 0 ? (
        <div style={{
          background: '#fff', padding: 40, borderRadius: 8, border: '1px solid #E2E6EB',
          textAlign: 'center', color: '#64748B', fontSize: 13,
        }}>
          No calls yet. Hit <strong>+ Add Call</strong> to create one with a pasted transcript.
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E2E6EB', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F7F8FA', textAlign: 'left' }}>
                <Th>ID</Th><Th>Client</Th><Th>Date</Th><Th>Duration</Th>
                <Th>Source</Th><Th>Review</Th><Th>Audio</Th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid #F0F2F5' }}>
                  <td style={td}>
                    <Link href={`/calls/${c.id}`} style={{ color: '#00D4AA', fontWeight: 600 }}>#{c.id}</Link>
                  </td>
                  <td style={td}>
                    {c.client_id ? (
                      <Link href={`/clients/${c.client_id}`} style={{ color: '#1B2838' }}>{c.client_name || `Client #${c.client_id}`}</Link>
                    ) : '—'}
                  </td>
                  <td style={td}>{c.call_date ? new Date(c.call_date).toLocaleDateString() : new Date(c.created_at).toLocaleDateString()}</td>
                  <td style={td}>{c.duration_minutes ? `${c.duration_minutes}m` : '—'}</td>
                  <td style={td}>{c.transcript_source || <span style={muted}>—</span>}</td>
                  <td style={td}>{c.review_status === 'none' ? <span style={muted}>—</span> : c.review_status}</td>
                  <td style={td}>{c.audio_storage_path ? '✓' : <span style={muted}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewCallModal
        open={showNew}
        clients={clients}
        defaultClientId={clientFilter ? Number(clientFilter) : undefined}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); void load(); }}
      />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</th>;
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
const muted: React.CSSProperties = { color: '#94a3b8' };
