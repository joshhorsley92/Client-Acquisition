'use client';

// Clients list — table with status tabs, search box, sort dropdown, and
// rollup columns (open engagements, lifetime revenue, last activity, fit
// score). + New Client button opens NewClientModal; Import CSV button
// opens ImportCsvModal.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StickyNote } from 'lucide-react';
import { api } from '@/lib/api';
import NewClientModal from '@/components/NewClientModal';
import ImportCsvModal from '@/components/ImportCsvModal';
import QuickNoteModal from '@/components/QuickNoteModal';
import EnrichmentBadge from '@/components/EnrichmentBadge';
import { ErrorBox, PrimaryButton, SecondaryButton } from '@/components/ui/Forms';
import { Spinner } from '@/components/Skeleton';
import { humanizeError } from '@/lib/humanize-error';
import { cn } from '@/lib/cn';

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'working', label: 'Working' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

const SORT_OPTIONS = [
  // Default: fit score descending. The whole product story is "fit informs
  // decisions" — the list should show high-fit prospects first.
  { key: 'fit_score', label: 'Fit score', dir: 'desc' },
  { key: 'lifetime_revenue', label: 'Lifetime revenue', dir: 'desc' },
  { key: 'last_activity_at', label: 'Last activity', dir: 'desc' },
  { key: 'name', label: 'Name', dir: 'asc' },
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
  const [searchPending, setSearchPending] = useState(false);
  const [sort, setSort] = useState<SortOpt>(SORT_OPTIONS[0]);
  const [showNew, setShowNew] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [noteFor, setNoteFor] = useState<{ id: number; name: string } | null>(null);

  // Debounced search input
  useEffect(() => {
    if (searchInput.trim() !== search) setSearchPending(true);
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setSearchPending(false);
    }, 250);
    return () => clearTimeout(id);
  }, [searchInput, search]);

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
    } catch (e: unknown) {
      setErr(humanizeError(e, 'Failed to load clients.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, search, sort.key, sort.dir]);

  const hasFilters = Boolean(status || search);
  const clearFilters = () => {
    setStatus('');
    setSearchInput('');
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-2xl font-bold m-0">Clients</h1>
        <div className="flex gap-2">
          <SecondaryButton onClick={() => setShowImportCsv(true)}>Import CSV</SecondaryButton>
          <PrimaryButton onClick={() => setShowNew(true)}>+ New Client</PrimaryButton>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key || 'all'}
            onClick={() => setStatus(t.key)}
            className={cn(
              'px-3.5 py-1.5 text-xs rounded border transition-colors',
              status === t.key
                ? 'bg-brand-charcoal text-white border-brand-charcoal font-semibold'
                : 'bg-surface text-ink-muted border-edge font-normal hover:border-brand-charcoal',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + sort + clear */}
      <div className="flex gap-2 items-center mb-4">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email, contact, or website..."
            className="w-full px-3 py-2 border border-edge rounded text-[13px] bg-surface focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none"
          />
          {searchPending && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              <Spinner size={14} />
            </span>
          )}
        </div>
        <select
          value={sort.key}
          onChange={(e) => {
            const opt = SORT_OPTIONS.find((o) => o.key === e.target.value);
            if (opt) setSort(opt);
          }}
          className="px-2.5 py-2 border border-edge rounded bg-surface text-[13px] focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>Sort: {o.label}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-xs text-ink-muted hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </div>

      {err && <ErrorBox>{err}</ErrorBox>}

      {loading ? (
        <div className="text-ink-faint text-[13px] flex items-center gap-2">
          <Spinner /> Loading clients…
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-surface p-10 rounded-lg border border-edge text-center text-ink-muted text-[13px]">
          {hasFilters ? (
            <>No clients match those filters. <button onClick={clearFilters} className="text-brand-mint hover:underline">Clear filters</button></>
          ) : (
            <>No clients yet. Hit <strong>+ New Client</strong> or <strong>Import CSV</strong> to get started.</>
          )}
        </div>
      ) : (
        <div className="bg-surface rounded-lg border border-edge overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-surface-page text-left">
                <Th>Name</Th>
                <Th>Industry</Th>
                <Th>Location</Th>
                <Th align="right">Fit</Th>
                <Th align="right">Open</Th>
                <Th align="right">Won</Th>
                <Th align="right">Lifetime $</Th>
                <Th>Last activity</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-t border-surface-alt hover:bg-surface-page transition-colors">
                  <td className="px-3.5 py-2.5 text-ink">
                    <Link href={`/clients/${c.id}`} className="text-ink font-semibold hover:text-brand-mint">
                      {c.name}
                    </Link>
                    <EnrichmentBadge status={c.enrichment_status} />
                  </td>
                  <td className="px-3.5 py-2.5 text-ink">
                    {c.industry || <span className="text-ink-faint">—</span>}
                  </td>
                  <td className="px-3.5 py-2.5 text-ink">
                    {c.location || <span className="text-ink-faint">—</span>}
                  </td>
                  <td className="px-3.5 py-2.5 text-ink text-right">
                    <FitBadge score={c.fit_score} />
                  </td>
                  <td className="px-3.5 py-2.5 text-ink text-right">{c.open_engagements ?? 0}</td>
                  <td className="px-3.5 py-2.5 text-ink text-right">{c.won_engagements ?? 0}</td>
                  <td className="px-3.5 py-2.5 text-ink text-right">{money(c.lifetime_revenue)}</td>
                  <td className="px-3.5 py-2.5">
                    <ActivityFreshness ts={c.last_activity_at} />
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setNoteFor({ id: c.id, name: c.name })}
                      title="Add note"
                      className="text-ink-faint hover:text-brand-mint p-1 rounded transition-colors"
                    >
                      <StickyNote size={14} />
                    </button>
                  </td>
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
      <QuickNoteModal
        open={noteFor !== null}
        onClose={() => setNoteFor(null)}
        onSaved={() => void load()}
        clientId={noteFor?.id ?? 0}
        contextLabel={noteFor?.name}
      />
    </div>
  );
}

function Th({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={cn(
        'px-3.5 py-2.5 text-[11px] font-semibold text-ink-muted uppercase tracking-wider',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

// Fit score badge with traffic-light color. <34 red, 34-66 yellow, ≥67 green.
// Null shows as a dash since "not computed yet" should be visually distinct
// from "computed and low".
function FitBadge({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-ink-faint" title="Not computed yet">—</span>;
  const tone =
    score >= 67 ? 'bg-success-bg text-success border-success-border'
    : score >= 34 ? 'bg-warning-bg text-warning border-warning-border'
    : 'bg-danger-bg text-danger-strong border-danger-border';
  return (
    <span
      className={cn(
        'inline-block min-w-[36px] px-2 py-0.5 rounded-full border text-xs font-semibold tabular-nums',
        tone,
      )}
    >
      {score}
    </span>
  );
}

// "Last activity" cell with a colored dot — green if <7d, yellow 7-30d,
// red >30d. Surfaces stalled deals at a glance without a separate column.
function ActivityFreshness({ ts }: { ts?: string | null }) {
  if (!ts) return <span className="text-ink-faint">—</span>;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return <span className="text-ink-faint">{String(ts)}</span>;
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  const tone =
    days < 7 ? 'bg-success'
    : days <= 30 ? 'bg-warning'
    : 'bg-danger';
  const label =
    days === 0 ? 'today'
    : days === 1 ? '1 day ago'
    : days < 30 ? `${days} days ago`
    : days < 365 ? `${Math.floor(days / 30)} mo ago`
    : `${Math.floor(days / 365)}y ago`;
  return (
    <span className="inline-flex items-center gap-2 text-ink" title={d.toLocaleString()}>
      <span className={cn('w-2 h-2 rounded-full', tone)} aria-hidden="true" />
      {label}
    </span>
  );
}
