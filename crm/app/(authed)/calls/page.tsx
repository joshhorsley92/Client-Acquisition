'use client';

// Calls list — all call recordings, filterable by client + review status.
// Add Call modal lives here; clicking a row opens the detail page.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import NewCallModal from '@/components/NewCallModal';
import { ErrorBox, PrimaryButton } from '@/components/ui/Forms';
import { Spinner } from '@/components/Skeleton';
import { humanizeError } from '@/lib/humanize-error';

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

const STATUS_OPTIONS = ['none', 'pending', 'approved', 'rejected'];

export default function CallsPage() {
  const sp = useSearchParams();
  const initialClientId = sp.get('client_id') || '';
  const [clientFilter, setClientFilter] = useState(initialClientId);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchPending, setSearchPending] = useState(false);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState('');

  // Debounced transcript search
  useEffect(() => {
    if (searchInput.trim() !== search) setSearchPending(true);
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setSearchPending(false);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput, search]);

  async function load() {
    setLoading(true); setErr('');
    try {
      const params = new URLSearchParams();
      if (clientFilter) params.set('client_id', clientFilter);
      if (statusFilter) params.set('review_status', statusFilter);
      if (search) params.set('q', search);
      const data = await api.get<{ calls: CallRow[] }>(`/api/calls?${params}`);
      setCalls(data.calls || []);
    } catch (e: unknown) {
      setErr(humanizeError(e, 'Failed to load calls.'));
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientFilter, statusFilter, search]);

  useEffect(() => {
    api.get<{ clients: any[] }>('/api/clients?sort_by=name&sort_dir=asc')
      .then((d) => setClients((d.clients || []).map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, []);

  const hasFilters = Boolean(clientFilter || statusFilter || search);
  const clearFilters = () => { setClientFilter(''); setStatusFilter(''); setSearchInput(''); };

  const selectClass = 'px-2.5 py-2 border border-edge rounded bg-surface text-[13px] min-w-[180px] focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none';

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold m-0">Calls</h1>
        <PrimaryButton onClick={() => setShowNew(true)}>+ Add Call</PrimaryButton>
      </div>

      <div className="flex gap-2 items-center mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search transcript text…"
            className="w-full px-3 py-2 border border-edge rounded text-[13px] bg-surface focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none"
          />
          {searchPending && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              <Spinner size={14} />
            </span>
          )}
        </div>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={selectClass}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
          <option value="">All review statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="px-3 py-2 text-xs text-ink-muted hover:text-ink">
            Clear filters
          </button>
        )}
      </div>

      {err && <ErrorBox>{err}</ErrorBox>}

      {loading ? (
        <div className="text-ink-faint text-[13px] flex items-center gap-2">
          <Spinner /> Loading calls…
        </div>
      ) : calls.length === 0 ? (
        <div className="bg-surface p-10 rounded-lg border border-edge text-center text-ink-muted text-[13px]">
          {hasFilters ? (
            <>No calls match those filters. <button onClick={clearFilters} className="text-brand-mint hover:underline">Clear filters</button></>
          ) : (
            <>No calls yet. Hit <strong>+ Add Call</strong> to create one with a pasted transcript.</>
          )}
        </div>
      ) : (
        <div className="bg-surface rounded-lg border border-edge overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-surface-page text-left">
                <Th>ID</Th><Th>Client</Th><Th>Date</Th><Th>Duration</Th>
                <Th>Source</Th><Th>Review</Th><Th>Audio</Th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} className="border-t border-surface-alt hover:bg-surface-page transition-colors">
                  <td className="px-3.5 py-2.5">
                    <Link href={`/calls/${c.id}`} className="text-brand-mint font-semibold hover:underline">#{c.id}</Link>
                  </td>
                  <td className="px-3.5 py-2.5 text-ink">
                    {c.client_id ? (
                      <Link href={`/clients/${c.client_id}`} className="text-ink hover:text-brand-mint">
                        {c.client_name || `Client #${c.client_id}`}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="px-3.5 py-2.5 text-ink">
                    {c.call_date ? new Date(c.call_date).toLocaleDateString() : new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3.5 py-2.5 text-ink">{c.duration_minutes ? `${c.duration_minutes}m` : '—'}</td>
                  <td className="px-3.5 py-2.5 text-ink">
                    {c.transcript_source || <span className="text-ink-faint">—</span>}
                  </td>
                  <td className="px-3.5 py-2.5 text-ink">
                    {c.review_status === 'none' ? <span className="text-ink-faint">—</span> : c.review_status}
                  </td>
                  <td className="px-3.5 py-2.5 text-ink" title={c.audio_storage_path ? 'Audio attached' : 'No audio'}>
                    {c.audio_storage_path ? '✓' : <span className="text-ink-faint">—</span>}
                  </td>
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
  return (
    <th className="px-3.5 py-2.5 text-[11px] font-semibold text-ink-muted uppercase tracking-wider text-left">
      {children}
    </th>
  );
}
