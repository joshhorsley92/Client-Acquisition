'use client';

// Engagements list — kanban-ish view grouped by status, with inline
// quick-create. Click into an engagement to edit it (lives on the client
// detail page's Engagements tab in v1.0; dedicated detail page deferred).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { StickyNote, Sparkles, GripVertical } from 'lucide-react';
import { api } from '@/lib/api';
import NewEngagementModal from '@/components/NewEngagementModal';
import QuickNoteModal from '@/components/QuickNoteModal';
import AutomationRunModal from '@/components/AutomationRunModal';
import { ErrorBox, PrimaryButton } from '@/components/ui/Forms';
import { Spinner } from '@/components/Skeleton';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import { cn } from '@/lib/cn';
import {
  formatPackages, formatPricingChip, engagementTitle, SOURCE_LABELS,
  type SourceSlug, type EngagementPackage,
} from '@/lib/engagement-options';

const STATUSES = ['new', 'working', 'won', 'lost'] as const;
type Status = (typeof STATUSES)[number];

interface EngagementRow {
  id: number;
  client_id: number;
  client_name?: string;
  status: Status;
  title?: string | null;
  packages?: Array<EngagementPackage | string> | null;
  estimated_value?: number;
  closed_value?: number | null;
  monthly_recurring_value?: number | null;
  closed_monthly_value?: number | null;
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
  const [noteFor, setNoteFor] = useState<{ engagementId: number; clientId: number; label: string } | null>(null);
  const [automateFor, setAutomateFor] = useState<EngagementRow | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);

  async function load() {
    setLoading(true); setErr('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (clientFilter) params.set('client_id', clientFilter);
      const data = await api.get<{ engagements: EngagementRow[] }>(`/api/engagements?${params}`);
      setEngagements(data.engagements || []);
    } catch (e: unknown) {
      setErr(humanizeError(e, 'Failed to load engagements.'));
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, clientFilter]);

  // Drag-and-drop status change. Optimistically moves the card into the
  // target column and PATCHes the engagement; reverts on failure.
  // Special-cases the 'lost' transition because the API requires a
  // lost_reason — if none is set yet, we surface a clear toast instead
  // of leaving the user wondering why the move silently failed.
  async function moveEngagement(id: number, target: Status) {
    const original = engagements;
    const current = original.find((e) => e.id === id);
    if (!current || current.status === target) return;

    // Optimistic update.
    setEngagements((prev) => prev.map((e) => (e.id === id ? { ...e, status: target } : e)));

    try {
      await api.patch(`/api/engagements/${id}`, { status: target });
    } catch (err: unknown) {
      // Revert + tell the user what went wrong.
      setEngagements(original);
      const msg = humanizeError(err, 'Failed to move engagement.');
      // The API surfaces "lost_reason is required when closing as lost"
      // — point the user at the engagement detail to fix it.
      if (target === 'lost' && /lost_reason/i.test(msg)) {
        toast.error('Open the engagement and set a Lost reason before moving it to Lost.');
      } else {
        toast.error(msg);
      }
    }
  }

  async function loadClients() {
    try {
      const d = await api.get<{ clients: any[] }>('/api/clients?sort_by=name&sort_dir=asc');
      setClients((d.clients || []).map((c) => ({ id: c.id, name: c.name })));
    } catch { /* silent — clients dropdown just stays empty */ }
  }

  useEffect(() => { void loadClients(); }, []);

  const grouped: Record<Status, EngagementRow[]> = {
    new: [], working: [], won: [], lost: [],
  };
  for (const e of engagements) grouped[e.status]?.push(e);

  const hasFilters = Boolean(statusFilter || clientFilter);
  const clearFilters = () => { setStatusFilter(''); setClientFilter(''); };
  const selectClass = 'px-2.5 py-2 border border-edge rounded bg-surface text-[13px] min-w-[180px] focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none';

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold m-0">Engagements</h1>
        <PrimaryButton onClick={() => setShowNew(true)}>+ New Engagement</PrimaryButton>
      </div>

      <div className="flex gap-2 items-center mb-4">
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={selectClass}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={selectClass}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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
          <Spinner /> Loading engagements…
        </div>
      ) : engagements.length === 0 ? (
        <div className="bg-surface p-10 rounded-lg border border-edge text-center text-ink-muted text-[13px]">
          {hasFilters ? (
            <>No engagements match those filters. <button onClick={clearFilters} className="text-brand-mint hover:underline">Clear filters</button></>
          ) : (
            <>No engagements yet. Hit <strong>+ New Engagement</strong> to start one.</>
          )}
        </div>
      ) : statusFilter ? (
        <EngagementTable rows={engagements} onNote={setNoteFor} onAutomate={setAutomateFor} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {STATUSES.map((s) => (
            <Column
              key={s}
              status={s}
              rows={grouped[s]}
              onNote={setNoteFor}
              onAutomate={setAutomateFor}
              draggingId={draggingId}
              isDragOver={dragOverStatus === s}
              onDragStart={(id) => setDraggingId(id)}
              onDragEnd={() => { setDraggingId(null); setDragOverStatus(null); }}
              onDragEnterColumn={() => setDragOverStatus(s)}
              onDragLeaveColumn={() => setDragOverStatus((cur) => (cur === s ? null : cur))}
              onDropToColumn={() => {
                setDragOverStatus(null);
                if (draggingId != null) void moveEngagement(draggingId, s);
                setDraggingId(null);
              }}
            />
          ))}
        </div>
      )}

      <NewEngagementModal
        open={showNew}
        clients={clients}
        defaultClientId={clientFilter ? Number(clientFilter) : undefined}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); void load(); void loadClients(); }}
      />
      <QuickNoteModal
        open={noteFor !== null}
        onClose={() => setNoteFor(null)}
        onSaved={() => void load()}
        clientId={noteFor?.clientId ?? 0}
        engagementId={noteFor?.engagementId}
        contextLabel={noteFor?.label}
      />
      {automateFor && (
        <AutomationRunModal
          open={automateFor !== null}
          onClose={() => setAutomateFor(null)}
          engagement={{
            id: automateFor.id,
            client_id: automateFor.client_id,
            client_name: automateFor.client_name,
            packages: automateFor.packages ?? [],
          }}
        />
      )}
    </div>
  );
}

type NoteTarget = { engagementId: number; clientId: number; label: string };

function Column({
  status, rows, onNote, onAutomate,
  draggingId, isDragOver,
  onDragStart, onDragEnd,
  onDragEnterColumn, onDragLeaveColumn, onDropToColumn,
}: {
  status: Status;
  rows: EngagementRow[];
  onNote: (t: NoteTarget) => void;
  onAutomate: (r: EngagementRow) => void;
  draggingId: number | null;
  isDragOver: boolean;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onDragEnterColumn: () => void;
  onDragLeaveColumn: () => void;
  onDropToColumn: () => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        // Required for drop to fire. Only accept if a card is actually
        // being dragged (not arbitrary OS drags).
        if (draggingId != null) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDragEnter={(e) => {
        if (draggingId != null) {
          e.preventDefault();
          onDragEnterColumn();
        }
      }}
      onDragLeave={(e) => {
        // dragLeave fires for child enters too; ignore unless we left
        // the column container itself.
        if (e.currentTarget === e.target) onDragLeaveColumn();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropToColumn();
      }}
      className={cn(
        'bg-surface-page rounded-lg p-2.5 transition-colors',
        isDragOver && 'ring-2 ring-brand-mint bg-brand-mint/5',
      )}
    >
      <div className="text-[11px] text-ink-muted font-bold uppercase tracking-wider mb-2 px-1">
        {status} ({rows.length})
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <EngagementCard
            key={r.id}
            row={r}
            onNote={onNote}
            onAutomate={onAutomate}
            isDragging={draggingId === r.id}
            onDragStart={() => onDragStart(r.id)}
            onDragEnd={onDragEnd}
          />
        ))}
        {rows.length === 0 && (
          <div className="text-xs text-ink-faint text-center py-4">
            {isDragOver ? 'Drop here' : 'None'}
          </div>
        )}
      </div>
    </div>
  );
}

function EngagementCard({
  row, onNote, onAutomate,
  isDragging, onDragStart, onDragEnd,
}: {
  row: EngagementRow;
  onNote: (t: NoteTarget) => void;
  onAutomate: (r: EngagementRow) => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const oneTime = Number(row.closed_value) || Number(row.estimated_value) || 0;
  const mrr = Number(row.closed_monthly_value) || Number(row.monthly_recurring_value) || 0;
  const valueChip = formatPricingChip({ one_time: oneTime, monthly: mrr });
  const titleLabel = engagementTitle(row);
  return (
    <div
      draggable
      onDragStart={(e) => {
        // Required for Firefox to start the drag.
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(row.id));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative bg-surface rounded-md p-2.5 border border-edge transition-all cursor-grab active:cursor-grabbing',
        isDragging
          ? 'opacity-40 border-brand-mint ring-2 ring-brand-mint/40'
          : 'hover:border-brand-mint hover:shadow-card',
      )}
    >
      <GripVertical
        size={12}
        className="absolute top-2.5 left-1 text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity"
        aria-hidden
      />
      <Link href={`/engagements/${row.id}`} className="block no-underline pl-2.5" draggable={false}>
        <div className="text-[13px] font-semibold text-ink pr-12">{row.client_name}</div>
        <div className="text-[11px] text-ink-muted mt-1" title={titleLabel || undefined}>
          {titleLabel
            ? <span className="line-clamp-1">{titleLabel}</span>
            : <>Engagement #{row.id}</>}
        </div>
        {valueChip && (
          <div className="text-xs text-ink font-semibold mt-1">{valueChip}</div>
        )}
        {row.notes && (
          <div className="text-[11px] text-ink-muted mt-1.5 line-clamp-2">
            {row.notes}
          </div>
        )}
      </Link>
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAutomate(row); }}
          className="p-1 text-ink-faint hover:text-brand-mint"
          title="Run automation"
        >
          <Sparkles size={14} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNote({
              engagementId: row.id,
              clientId: row.client_id,
              label: `${row.client_name || 'Client'} #${row.id}`,
            });
          }}
          className="p-1 text-ink-faint hover:text-brand-mint"
          title="Add note"
        >
          <StickyNote size={14} />
        </button>
      </div>
    </div>
  );
}

function EngagementTable({ rows, onNote, onAutomate }: { rows: EngagementRow[]; onNote: (t: NoteTarget) => void; onAutomate: (r: EngagementRow) => void }) {
  return (
    <div className="bg-surface rounded-lg border border-edge overflow-hidden">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-surface-page text-left">
            <Th>Client</Th><Th>Package</Th><Th>Status</Th>
            <Th>Source</Th><Th align="right">Value</Th><Th>Opened</Th><Th></Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-surface-alt hover:bg-surface-page transition-colors">
              <td className="px-3.5 py-2.5 text-ink">
                <Link href={`/engagements/${r.id}`} className="text-ink font-semibold hover:text-brand-mint">
                  {r.client_name || `Client #${r.client_id}`}
                </Link>
              </td>
              <td className="px-3.5 py-2.5 text-ink">
                <span title={engagementTitle(r) || undefined}>
                  {engagementTitle(r) || '—'}
                </span>
              </td>
              <td className="px-3.5 py-2.5 text-ink">{r.status}</td>
              <td className="px-3.5 py-2.5 text-ink">
                {r.source ? (SOURCE_LABELS[r.source as SourceSlug] || r.source) : '—'}
              </td>
              <td className="px-3.5 py-2.5 text-ink text-right">
                {(() => {
                  const ot = Number(r.closed_value || r.estimated_value || 0);
                  const mo = Number(r.closed_monthly_value || r.monthly_recurring_value || 0);
                  const chip = formatPricingChip({ one_time: ot, monthly: mo });
                  return chip || '—';
                })()}
              </td>
              <td className="px-3.5 py-2.5 text-ink">{new Date(r.opened_at).toLocaleDateString()}</td>
              <td className="px-3.5 py-2.5 text-right">
                <div className="flex justify-end items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onAutomate(r)}
                    className="text-ink-faint hover:text-brand-mint p-1 rounded transition-colors"
                    title="Run automation"
                  >
                    <Sparkles size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNote({
                      engagementId: r.id,
                      clientId: r.client_id,
                      label: `${r.client_name || 'Client'} #${r.id}`,
                    })}
                    className="text-ink-faint hover:text-brand-mint p-1 rounded transition-colors"
                    title="Add note"
                  >
                    <StickyNote size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
