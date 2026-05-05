'use client';

// Full engagement detail UI. Inline-editable fields, call timeline,
// brand-profile extraction history, generated docs, activity feed.
// Server page (`engagements/[id]/page.tsx`) does the initial fetch and
// hands the snapshots in as props.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import { cn } from '@/lib/cn';
import AutomationRunModal from './AutomationRunModal';

interface Engagement {
  id: number;
  client_id: number;
  status: 'new' | 'working' | 'won' | 'lost';
  package_type: string | null;
  source: string | null;
  source_detail: string | null;
  estimated_value: number | string;
  closed_value: number | string | null;
  lost_reason: string | null;
  notes: string | null;
  opened_at: string;
  status_changed_at: string;
  closed_at: string | null;
}

interface ClientLite {
  id: number;
  name: string;
  industry?: string | null;
  location?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface CallLite {
  id: number;
  call_date: string | null;
  duration_minutes: number | null;
  transcript_source: string | null;
  review_status: string;
  audio_storage_path: string | null;
  extracted_profile_json: any;
  created_at: string;
}

interface GenerationJob {
  id: number;
  type: 'analysis_deck' | 'proposal' | 'ai_content';
  status: 'running' | 'completed' | 'failed';
  output: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

interface ActivityRow {
  id: number;
  type: string;
  content: string | null;
  created_at: string;
}

const STATUS_TONES: Record<string, string> = {
  new:     'bg-warning-bg text-warning border-warning-border',
  working: 'bg-blue-50 text-blue-800 border-blue-200',
  won:     'bg-success-bg text-success border-success-border',
  lost:    'bg-danger-bg text-danger-strong border-danger-border',
};

const PACKAGES = ['boost', 'launch', 'both', 'undecided'] as const;
const SOURCES = ['referral', 'cold', 'web', 'content', 'paid_ads'] as const;

export default function EngagementDetailClient({
  initialEngagement, client, calls, jobs, activities,
}: {
  initialEngagement: Engagement;
  client: ClientLite | null;
  calls: CallLite[];
  jobs: GenerationJob[];
  activities: ActivityRow[];
}) {
  const [engagement, setEngagement] = useState<Engagement>(initialEngagement);
  const [showAutomate, setShowAutomate] = useState(false);
  const router = useRouter();

  async function patch(updates: Partial<Engagement>): Promise<boolean> {
    try {
      const { engagement: updated } = await api.patch<{ engagement: Engagement }>(
        `/api/engagements/${engagement.id}`, updates,
      );
      setEngagement(updated);
      toast.success('Saved.');
      return true;
    } catch (err: unknown) {
      toast.error(humanizeError(err, 'Failed to save.'));
      return false;
    }
  }

  const value = Number(engagement.closed_value) || Number(engagement.estimated_value) || 0;

  return (
    <div>
      <Link href="/engagements" className="text-brand-mint text-[13px] hover:underline">
        ← Back to engagements
      </Link>

      <header className="mt-3 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[22px] font-bold m-0">
            {engagement.package_type || 'Engagement'} #{engagement.id}
          </h1>
          <InlineSelect
            value={engagement.status}
            options={['new', 'working', 'won', 'lost']}
            onCommit={(v) => patch({ status: v as Engagement['status'] })}
            display={(v) => (
              <span className={cn(
                'inline-block text-xs px-2.5 py-0.5 rounded-full border font-semibold capitalize',
                STATUS_TONES[v] || STATUS_TONES.new,
              )}>
                {v}
              </span>
            )}
          />
          {value > 0 && (
            <span className="text-base text-ink font-semibold">
              ${value.toLocaleString()}
            </span>
          )}
        </div>
        <div className="text-[13px] text-ink-muted mt-1.5">
          Client:{' '}
          {client ? (
            <Link href={`/clients/${client.id}`} className="text-brand-mint hover:underline">
              {client.name}
            </Link>
          ) : 'Unknown'}
          {engagement.opened_at && (
            <> · Opened {new Date(engagement.opened_at).toLocaleDateString()}</>
          )}
          {engagement.closed_at && (
            <> · Closed {new Date(engagement.closed_at).toLocaleDateString()}</>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
        {/* LEFT — main timeline */}
        <div className="flex flex-col gap-4">
          <Panel title="Call timeline">
            {calls.length === 0 ? (
              <Empty>No calls linked to this engagement yet.</Empty>
            ) : (
              <ul className="list-none p-0 m-0 flex flex-col gap-2">
                {calls.map((c) => {
                  const completion = c.extracted_profile_json?.completion_percent;
                  return (
                    <li key={c.id} className="border border-edge rounded-md p-3 hover:border-brand-mint transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/calls/${c.id}`} className="text-[13px] font-semibold text-ink hover:text-brand-mint">
                          Call #{c.id}
                        </Link>
                        <span className="text-[11px] text-ink-muted">
                          {c.call_date
                            ? new Date(c.call_date).toLocaleDateString()
                            : new Date(c.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-[11px] text-ink-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {c.duration_minutes ? <span>{c.duration_minutes} min</span> : null}
                        {c.transcript_source ? <span>{c.transcript_source}</span> : null}
                        {c.audio_storage_path ? <span>Audio attached</span> : null}
                        <span className="capitalize">Review: {c.review_status}</span>
                        {completion != null && <span>{completion}% extracted</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Brand profile extractions">
            <ExtractionHistory calls={calls} />
          </Panel>

          <Panel
            title="Generated documents"
            action={
              <button
                type="button"
                onClick={() => setShowAutomate(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-mint hover:text-brand-mint-dark"
              >
                <Sparkles size={12} /> Run automation
              </button>
            }
          >
            {jobs.length === 0 ? (
              <Empty>
                No automation runs against this engagement yet.{' '}
                <button
                  type="button"
                  onClick={() => setShowAutomate(true)}
                  className="text-brand-mint hover:underline"
                >
                  Run one
                </button>{' '}
                to get started.
              </Empty>
            ) : (
              <ul className="list-none p-0 m-0 flex flex-col gap-2">
                {jobs.map((j) => <GenerationJobRow key={j.id} job={j} />)}
              </ul>
            )}
          </Panel>

          <Panel title="Activity">
            {activities.length === 0 ? (
              <Empty>No activity logged for this engagement yet.</Empty>
            ) : (
              <ul className="list-none p-0 m-0">
                {activities.map((a) => (
                  <li key={a.id} className="py-2 border-b border-surface-alt last:border-b-0">
                    <div className="text-[13px] text-ink whitespace-pre-wrap">
                      {a.content || <span className="text-ink-faint">(no content)</span>}
                    </div>
                    <div className="text-[11px] text-ink-faint mt-0.5">
                      {a.type} · {new Date(a.created_at).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* RIGHT — editable details */}
        <aside className="flex flex-col gap-4">
          <Panel title="Details">
            <DetailRow label="Package">
              <InlineSelect
                value={engagement.package_type || ''}
                options={['', ...PACKAGES] as readonly string[]}
                onCommit={(v) => patch({ package_type: v || null })}
                display={(v) => v ? <span className="capitalize">{v}</span> : <span className="text-ink-faint">—</span>}
              />
            </DetailRow>
            <DetailRow label="Source">
              <InlineSelect
                value={engagement.source || ''}
                options={['', ...SOURCES] as readonly string[]}
                onCommit={(v) => patch({ source: v || null })}
                display={(v) => v ? <span className="capitalize">{v.replace('_', ' ')}</span> : <span className="text-ink-faint">—</span>}
              />
            </DetailRow>
            <DetailRow label="Source detail">
              <InlineText
                value={engagement.source_detail || ''}
                onCommit={(v) => patch({ source_detail: v || null })}
                placeholder="e.g. LinkedIn intro from..."
              />
            </DetailRow>
            <DetailRow label="Estimated $">
              <InlineNumber
                value={Number(engagement.estimated_value) || 0}
                onCommit={(v) => patch({ estimated_value: v ?? 0 })}
                format={(n) => `$${(n ?? 0).toLocaleString()}`}
              />
            </DetailRow>
            <DetailRow label="Closed $">
              <InlineNumber
                value={engagement.closed_value == null ? null : Number(engagement.closed_value)}
                onCommit={(v) => patch({ closed_value: v })}
                format={(n) => n == null ? '—' : `$${n.toLocaleString()}`}
                allowNull
              />
            </DetailRow>
            {engagement.status === 'lost' && (
              <DetailRow label="Lost reason">
                <InlineText
                  value={engagement.lost_reason || ''}
                  onCommit={(v) => patch({ lost_reason: v || null })}
                  placeholder="Why did this fall through?"
                />
              </DetailRow>
            )}
          </Panel>

          <Panel title="Notes">
            <InlineTextarea
              value={engagement.notes || ''}
              onCommit={(v) => patch({ notes: v || null })}
              placeholder="Click to add notes..."
            />
          </Panel>

          {client && (
            <Panel title="Client contact">
              {client.industry && <Detail label="Industry" value={client.industry} />}
              {client.location && <Detail label="Location" value={client.location} />}
              {client.email && <Detail label="Email" value={client.email} />}
              {client.phone && <Detail label="Phone" value={client.phone} />}
              {client.website && (
                <a href={client.website} target="_blank" rel="noreferrer" className="text-xs text-brand-mint hover:underline">
                  Visit website →
                </a>
              )}
            </Panel>
          )}
        </aside>
      </div>

      <AutomationRunModal
        open={showAutomate}
        onClose={() => setShowAutomate(false)}
        engagement={{
          id: engagement.id,
          client_id: engagement.client_id,
          client_name: client?.name,
          package_type: engagement.package_type,
        }}
        onCompleted={() => router.refresh()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------
function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="bg-surface border border-edge rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-bold text-ink-muted uppercase tracking-wider m-0">
          {title}
        </h3>
        {action}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] text-ink-faint">{children}</div>;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1 border-b border-surface-alt last:border-b-0">
      <span className="text-xs text-ink-muted pt-1">{label}</span>
      <div className="text-right text-[13px] text-ink min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="text-ink-muted">{label}: </span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline-edit primitives. Pattern: click value → edit mode. Enter or blur
// commits, Esc reverts. Each manages its own draft state and commits via
// onCommit (parent does the PATCH and updates the canonical value).
// ---------------------------------------------------------------------------
const inputClass =
  'px-2 py-1 border border-brand-mint rounded text-[13px] bg-surface ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-mint';

function InlineText({
  value, onCommit, placeholder,
}: { value: string; onCommit: (v: string) => Promise<boolean>; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  async function commit() {
    if (draft === value) { setEditing(false); return; }
    const ok = await onCommit(draft);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void commit(); }
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        placeholder={placeholder}
        className={cn(inputClass, 'w-full text-right')}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value); setEditing(true); }}
      className="group inline-flex items-center gap-1.5 text-right hover:bg-surface-alt rounded px-1 py-0.5 -mx-1 -my-0.5 w-full justify-end"
    >
      <span className={cn(value ? 'text-ink' : 'text-ink-faint')}>
        {value || placeholder || '—'}
      </span>
      <Pencil size={11} className="text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  );
}

function InlineNumber({
  value, onCommit, format, allowNull,
}: {
  value: number | null;
  onCommit: (v: number | null) => Promise<boolean>;
  format: (v: number | null) => string;
  allowNull?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? '' : String(value));

  async function commit() {
    const trimmed = draft.trim();
    let next: number | null;
    if (trimmed === '') {
      if (!allowNull) { setDraft(String(value ?? '')); setEditing(false); return; }
      next = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) { setDraft(String(value ?? '')); setEditing(false); return; }
      next = n;
    }
    if (next === value) { setEditing(false); return; }
    const ok = await onCommit(next);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        step="any"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void commit(); }
          if (e.key === 'Escape') { setDraft(value == null ? '' : String(value)); setEditing(false); }
        }}
        className={cn(inputClass, 'w-full text-right tabular-nums')}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value == null ? '' : String(value)); setEditing(true); }}
      className="group inline-flex items-center gap-1.5 hover:bg-surface-alt rounded px-1 py-0.5 -mx-1 -my-0.5 w-full justify-end tabular-nums"
    >
      <span className={cn(value == null ? 'text-ink-faint' : 'text-ink')}>{format(value)}</span>
      <Pencil size={11} className="text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  );
}

function InlineSelect({
  value, options, onCommit, display,
}: {
  value: string;
  options: readonly string[];
  onCommit: (v: string) => Promise<boolean>;
  display: (v: string) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  async function pick(next: string) {
    if (next === value) { setEditing(false); return; }
    const ok = await onCommit(next);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <select
        autoFocus
        value={value}
        onChange={(e) => void pick(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
        className={inputClass}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o || '—'}</option>
        ))}
      </select>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-1.5 hover:bg-surface-alt rounded px-1 py-0.5 -mx-1 -my-0.5"
    >
      {display(value)}
      <Pencil size={11} className="text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  );
}

function InlineTextarea({
  value, onCommit, placeholder,
}: { value: string; onCommit: (v: string) => Promise<boolean>; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  async function commit() {
    if (draft === value) { setEditing(false); return; }
    const ok = await onCommit(draft);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setDraft(value); setEditing(false); }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void commit(); }
          }}
          rows={5}
          placeholder={placeholder}
          className={cn(inputClass, 'w-full text-left font-sans resize-y leading-relaxed')}
        />
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-ink-faint">Cmd/Ctrl-Enter to save · Esc to cancel</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => { setDraft(value); setEditing(false); }}
              className="text-ink-muted hover:text-ink p-1"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
            <button
              type="button"
              onClick={() => void commit()}
              className="text-brand-mint hover:text-brand-mint-dark p-1"
              aria-label="Save"
            >
              <Check size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value); setEditing(true); }}
      className={cn(
        'group text-left text-[13px] leading-relaxed whitespace-pre-wrap rounded px-1 py-0.5 -mx-1 -my-0.5 hover:bg-surface-alt min-h-[20px] w-full',
        value ? 'text-ink' : 'text-ink-faint italic',
      )}
    >
      {value || placeholder || 'Click to edit…'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Brand-profile extraction history — derived from calls
// ---------------------------------------------------------------------------
function ExtractionHistory({ calls }: { calls: CallLite[] }) {
  const extracted = calls
    .filter((c) => c.extracted_profile_json)
    .sort((a, b) => {
      const at = a.extracted_profile_json?.extracted_at || a.created_at;
      const bt = b.extracted_profile_json?.extracted_at || b.created_at;
      return new Date(bt).getTime() - new Date(at).getTime();
    });

  if (extracted.length === 0) {
    return <Empty>No Brand Profile extractions on this engagement&apos;s calls yet.</Empty>;
  }

  return (
    <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
      {extracted.map((c) => {
        const ext = c.extracted_profile_json;
        const completion = ext?.completion_percent;
        const at = ext?.extracted_at || c.created_at;
        return (
          <li key={c.id} className="flex items-center justify-between text-[13px] py-1 border-b border-surface-alt last:border-b-0">
            <div className="flex items-center gap-2">
              <Link href={`/calls/${c.id}`} className="text-brand-mint font-semibold hover:underline">
                Call #{c.id}
              </Link>
              <span className="text-[11px] text-ink-muted capitalize">{c.review_status}</span>
            </div>
            <div className="text-[11px] text-ink-muted">
              {completion != null && <span className="font-semibold text-ink">{completion}%</span>}
              {' · '}
              {new Date(at).toLocaleDateString()}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Generation job row — collapsed by default, expand to see output
// ---------------------------------------------------------------------------
function GenerationJobRow({ job }: { job: GenerationJob }) {
  const [open, setOpen] = useState(false);
  const tone =
    job.status === 'completed' ? 'bg-success-bg text-success border-success-border'
    : job.status === 'failed' ? 'bg-danger-bg text-danger-strong border-danger-border'
    : 'bg-warning-bg text-warning border-warning-border';
  const ts = job.completed_at || job.started_at;

  return (
    <li className="border border-edge rounded-md">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 w-full p-3 text-left hover:bg-surface-alt rounded-md"
      >
        <span className="text-[13px] font-semibold text-ink capitalize">
          {job.type.replace('_', ' ')}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold capitalize', tone)}>
            {job.status}
          </span>
          <span className="text-[11px] text-ink-muted">
            {new Date(ts).toLocaleString()}
          </span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-surface-alt">
          {job.status === 'failed' && job.error && (
            <div className="text-xs text-danger-strong mt-2">{job.error}</div>
          )}
          {job.status === 'completed' && job.output && (
            <pre className="bg-surface-page p-3 rounded text-xs whitespace-pre-wrap break-words font-sans max-h-[40vh] overflow-auto mt-2">
              {job.output}
            </pre>
          )}
          {job.status === 'running' && (
            <div className="text-xs text-ink-muted mt-2">Job is still running — refresh in a moment.</div>
          )}
        </div>
      )}
    </li>
  );
}
