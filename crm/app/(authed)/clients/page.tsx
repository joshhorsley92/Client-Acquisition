'use client';

// Clients list — table with status tabs, search box, sort dropdown, and
// rollup columns (open engagements, lifetime revenue, last activity, fit
// score). + New Client button opens NewClientModal; Import CSV button
// opens ImportCsvModal.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import NewClientModal from '@/components/NewClientModal';
import ImportCsvModal from '@/components/ImportCsvModal';
import EnrichmentBadge from '@/components/EnrichmentBadge';

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'working', label: 'Working' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

const SORT_OPTIONS = [
  { key: 'lifetime_revenue', label: 'Lifetime revenue', dir: 'desc' },
  { key: 'last_activity_at', label: 'Last activity', dir: 'desc' },
  { key: 'name', label: 'Name', dir: 'asc' },
  { key: 'fit_score', label: 'Fit score', dir: 'desc' },
  { key: 'created_at', label: 'Recently added', dir: 'desc' },
] as const;

type SortOpt = (typeof SORT_OPTIONS)[number];

const money = (n: number | null | undefined) => '$' + Number(n || 0).toLocaleString();

function fmtDate(ts: string | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString();
}

interface Client {
  id: number;
  name: string;
  industry?: string;
  location?: string;
  fit_score?: number | null;
  enrichment_status?: string;
  total_engagements?: number;
  open_engagements?: number;
  won_engagements?: number;
  lifetime_revenue?: number;
  last_activity_at?: string | null;
  source_platform?: string | null;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOpt>(SORT_OPTIONS[0]);
  const [showNew, setShowNew] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);

  // Debounce search input
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      params.set('sort_by', sort.key);
      params.set('sort_dir', sort.dir);
      const data = await api.get<{ clients: Client[] }>(`/api/clients?${params}`);
      setClients(data.clients || []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  // Reload on any filter/sort change
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, search, sort.key, sort.dir]);

  const counts = useMemo(() => {
    // Engagement-status counts come from the rollup view. Use total_engagements
    // for the "All" tab; for status-specific tabs we'd need a server roundtrip,
    // so skip per-tab counts in v1.
    return { all: clients.length };
  }, [clients]);

  return (
    <div>
      <div style={headerRow}>
        <h1 style={h1}>Clients</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowImportCsv(true)} style={secondaryBtn}>
            Import CSV
          </button>
          <button onClick={() => setShowNew(true)} style={primaryBtn}>
            + New Client
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.key || 'all'}
            onClick={() => setStatus(t.key)}
            style={tabStyle(status === t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + sort */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name, email, contact, or website..."
          style={{
            flex: 1, padding: '8px 12px', border: '1px solid #E2E6EB',
            borderRadius: 4, fontSize: 13,
          }}
        />
        <select
          value={sort.key}
          onChange={(e) => {
            const opt = SORT_OPTIONS.find((o) => o.key === e.target.value);
            if (opt) setSort(opt);
          }}
          style={{
            padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4,
            background: '#fff', fontSize: 13,
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>Sort: {o.label}</option>
          ))}
        </select>
      </div>

      {err && (
        <div style={errorBox}>{err}</div>
      )}

      {loading ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>
      ) : clients.length === 0 ? (
        <div style={{
          background: '#fff', padding: 40, borderRadius: 8, border: '1px solid #E2E6EB',
          textAlign: 'center', color: '#64748B', fontSize: 13,
        }}>
          No clients yet. Hit <strong>+ New Client</strong> or <strong>Import CSV</strong> to get started.
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E2E6EB', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F7F8FA', textAlign: 'left' }}>
                <Th>Name</Th>
                <Th>Industry</Th>
                <Th>Location</Th>
                <Th align="right">Fit</Th>
                <Th align="right">Open</Th>
                <Th align="right">Won</Th>
                <Th align="right">Lifetime $</Th>
                <Th>Last activity</Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid #F0F2F5' }}>
                  <td style={td}>
                    <Link href={`/clients/${c.id}`} style={{ color: '#1B2838', fontWeight: 600 }}>
                      {c.name}
                    </Link>
                    <EnrichmentBadge status={c.enrichment_status} />
                  </td>
                  <td style={td}>{c.industry || <span style={muted}>—</span>}</td>
                  <td style={td}>{c.location || <span style={muted}>—</span>}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {c.fit_score == null ? <span style={muted}>—</span> : c.fit_score}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.open_engagements ?? 0}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.won_engagements ?? 0}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(c.lifetime_revenue)}</td>
                  <td style={td}>{fmtDate(c.last_activity_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewClientModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); void load(); }}
      />
      <ImportCsvModal
        open={showImportCsv}
        onClose={() => setShowImportCsv(false)}
        onCompleted={() => { setShowImportCsv(false); void load(); }}
      />
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{
      padding: '10px 14px', fontSize: 11, fontWeight: 600,
      color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5,
      textAlign: align,
    }}>{children}</th>
  );
}

const headerRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
};
const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, margin: 0 };
const primaryBtn: React.CSSProperties = {
  background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
  padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  background: '#fff', color: '#1B2838', border: '1px solid #E2E6EB', borderRadius: 6,
  padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px', fontSize: 12, borderRadius: 4, border: '1px solid #E2E6EB',
  background: active ? '#1B2838' : '#fff',
  color: active ? '#fff' : '#64748B',
  cursor: 'pointer', fontWeight: active ? 600 : 400,
});
const td: React.CSSProperties = { padding: '10px 14px', color: '#1B2838' };
const muted: React.CSSProperties = { color: '#94a3b8' };
const errorBox: React.CSSProperties = {
  background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991b1b',
  padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 12,
};
