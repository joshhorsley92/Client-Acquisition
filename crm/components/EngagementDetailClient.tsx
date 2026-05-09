'use client';

// Full engagement detail UI. Inline-editable fields, call timeline,
// brand-profile extraction history, generated docs, activity feed.
// Server page (`engagements/[id]/page.tsx`) does the initial fetch and
// hands the snapshots in as props.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X, Sparkles, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import { cn } from '@/lib/cn';
import AutomationRunModal from './AutomationRunModal';
import type { ClientContact } from './ContactsPanel';
import {
  PACKAGE_SLUGS, PACKAGE_LABELS, type PackageSlug,
  SOURCE_SLUGS, SOURCE_LABELS, type SourceSlug,
  PRICING_TYPES, PRICING_TYPE_LABELS, type PricingType,
  formatPackages, formatPricingChip, engagementTitle,
  normalizePackages, packageDisplayName,
  type EngagementPackage,
} from '@/lib/engagement-options';

interface Engagement {
  id: number;
  client_id: number;
  status: 'new' | 'working' | 'won' | 'lost';
  title: string | null;
  packages: EngagementPackage[];
  monthly_recurring_value: number | string;
  closed_monthly_value: number | string | null;
  contract_months: number | null;
  contact_id: number | null;
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
  type?: string | null;
  primary_contact_name?: string | null;
  role?: string | null;
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


export default function EngagementDetailClient({
  initialEngagement, client: initialClient, calls, jobs, activities,
}: {
  initialEngagement: Engagement;
  client: ClientLite | null;
  calls: CallLite[];
  jobs: GenerationJob[];
  activities: ActivityRow[];
}) {
  const [engagement, setEngagement] = useState<Engagement>(() => ({
    ...initialEngagement,
    packages: normalizePackages(initialEngagement.packages),
  }));
  const [client, setClient] = useState<ClientLite | null>(initialClient);
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [showAutomate, setShowAutomate] = useState(false);
  const router = useRouter();

  // Load this client's contact list once so the engagement contact picker
  // has options to render.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const { contacts: rows } = await api.get<{ contacts: ClientContact[] }>(
          `/api/clients/${client.id}/contacts`,
        );
        if (!cancelled) setContacts(rows || []);
      } catch { /* tolerate failure — picker just stays minimal */ }
    })();
    return () => { cancelled = true; };
  }, [client?.id]);

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

  // Client-side patches against /api/clients/[id]. Used by the inline editors
  // in the Client contact panel so a user can fix the client's contact info
  // without leaving the engagement page.
  async function patchClient(updates: Partial<ClientLite>): Promise<boolean> {
    if (!client) return false;
    try {
      const { client: updated } = await api.patch<{ client: ClientLite }>(
        `/api/clients/${client.id}`, updates,
      );
      setClient(updated);
      toast.success('Client saved.');
      return true;
    } catch (err: unknown) {
      toast.error(humanizeError(err, 'Failed to save client.'));
      return false;
    }
  }

  const oneTime = Number(engagement.closed_value) || Number(engagement.estimated_value) || 0;
  const mrr = Number(engagement.closed_monthly_value) || Number(engagement.monthly_recurring_value) || 0;
  const valueChip = formatPricingChip({ one_time: oneTime, monthly: mrr });

  return (
    <div>
      <Link href="/engagements" className="text-brand-mint text-[13px] hover:underline">
        ← Back to engagements
      </Link>

      <header className="mt-3 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <EditableTitle
            engagement={engagement}
            onCommit={(v) => patch({ title: v })}
          />
          <span className="text-[22px] font-bold text-ink-faint">
            #{engagement.id}
          </span>
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
          {valueChip && (
            <span className="text-base text-ink font-semibold">{valueChip}</span>
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
          <Panel title="Package details">
            <p className="text-[12px] text-ink-faint mb-1.5">
              Flesh out scope per line item — these notes feed proposal generation.
            </p>
            {engagement.packages.length === 0 ? (
              <Empty>No packages yet. Add one below.</Empty>
            ) : (
              <div className="flex flex-col gap-2.5">
                {engagement.packages.map((pkg, idx) => (
                  <PackageDetailEditor
                    key={`${pkg.slug}-${idx}`}
                    pkg={pkg}
                    onChange={(next) => {
                      const updated = engagement.packages.map((p, i) => (i === idx ? next : p));
                      return patch({ packages: updated });
                    }}
                    onRemove={() => {
                      const updated = engagement.packages.filter((_, i) => i !== idx);
                      return patch({ packages: updated });
                    }}
                  />
                ))}
              </div>
            )}
            <div className="mt-3">
              <AddPackageButton
                existingSlugs={new Set(engagement.packages.map((p) => p.slug))}
                onAdd={(pkg) => patch({ packages: [...engagement.packages, pkg] })}
              />
            </div>
          </Panel>

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
            <DetailRow label="Packages">
              <PackageCheckboxes
                value={engagement.packages}
                onCommit={(next) => patch({ packages: next })}
              />
            </DetailRow>
            <DetailRow label="Source">
              <InlineSelect
                value={engagement.source || ''}
                options={['', ...SOURCE_SLUGS] as readonly string[]}
                onCommit={(v) => patch({ source: v || null })}
                display={(v) => v
                  ? <span>{SOURCE_LABELS[v as SourceSlug] || v}</span>
                  : <span className="text-ink-faint">—</span>}
              />
            </DetailRow>
            <DetailRow label="Source detail">
              <InlineText
                value={engagement.source_detail || ''}
                onCommit={(v) => patch({ source_detail: v || null })}
                placeholder="e.g. LinkedIn intro from..."
              />
            </DetailRow>
            <DetailRow label="One-time setup">
              <span className="text-ink tabular-nums">
                ${Number(engagement.estimated_value || 0).toLocaleString()}
                <span className="text-[11px] text-ink-faint ml-1">(from packages)</span>
              </span>
            </DetailRow>
            <DetailRow label="Monthly recurring">
              <span className="text-ink tabular-nums">
                {Number(engagement.monthly_recurring_value || 0) > 0
                  ? `$${Number(engagement.monthly_recurring_value).toLocaleString()}/mo`
                  : <span className="text-ink-faint">—</span>}
                <span className="text-[11px] text-ink-faint ml-1">(from packages)</span>
              </span>
            </DetailRow>
            <DetailRow label="Contract length">
              <InlineNumber
                value={engagement.contract_months == null ? null : Number(engagement.contract_months)}
                onCommit={(v) => patch({ contract_months: v })}
                format={(n) => n == null ? <span className="text-ink-faint">open-ended</span> as any : `${n} months`}
                allowNull
              />
            </DetailRow>
            <DetailRow label="Closed setup $">
              <InlineNumber
                value={engagement.closed_value == null ? null : Number(engagement.closed_value)}
                onCommit={(v) => patch({ closed_value: v })}
                format={(n) => n == null ? '—' : `$${n.toLocaleString()}`}
                allowNull
              />
            </DetailRow>
            {(engagement.status === 'won' || Number(engagement.closed_monthly_value) > 0) && (
              <DetailRow label="Closed MRR $">
                <InlineNumber
                  value={engagement.closed_monthly_value == null ? null : Number(engagement.closed_monthly_value)}
                  onCommit={(v) => patch({ closed_monthly_value: v })}
                  format={(n) => n == null ? '—' : `$${n.toLocaleString()}/mo`}
                  allowNull
                />
              </DetailRow>
            )}
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
            <Panel title="Engagement contact">
              <EngagementContactPicker
                contacts={contacts}
                contactId={engagement.contact_id}
                onPick={(id) => patch({ contact_id: id })}
                clientCacheFallback={{
                  name: client.primary_contact_name,
                  email: client.email,
                  phone: client.phone,
                  role: client.role,
                }}
              />
              <Divider />
              <DetailRow label="Industry">
                <InlineText
                  value={client.industry || ''}
                  onCommit={(v) => patchClient({ industry: v || null })}
                  placeholder="e.g. Tree services"
                />
              </DetailRow>
              <DetailRow label="Location">
                <InlineText
                  value={client.location || ''}
                  onCommit={(v) => patchClient({ location: v || null })}
                  placeholder="City, State"
                />
              </DetailRow>
              <DetailRow label="Type">
                <InlineSelect
                  value={client.type || ''}
                  options={['', 'B2B', 'B2C']}
                  onCommit={(v) => patchClient({ type: v || null })}
                  display={(v) => v
                    ? <span>{v}</span>
                    : <span className="text-ink-faint">—</span>}
                />
              </DetailRow>
              <DetailRow label="Website">
                <InlineText
                  value={client.website || ''}
                  onCommit={(v) => patchClient({ website: v || null })}
                  placeholder="https://..."
                />
              </DetailRow>
              {client.website && (
                <a
                  href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block mt-2 text-xs text-brand-mint hover:underline"
                >
                  Visit website →
                </a>
              )}
              <Link
                href={`/clients/${client.id}`}
                className="block mt-1 text-xs text-ink-faint hover:text-brand-mint"
              >
                Open full client profile →
              </Link>
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
          packages: engagement.packages,
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

// Picker for which of the client's contacts is "the contact" on this
// engagement. Default is the client's primary (contact_id=null) — the
// dropdown shows that as "Primary contact (default)". Selecting a specific
// contact persists `engagement.contact_id`. The selected contact's info
// renders below the dropdown for quick reference.
function EngagementContactPicker({
  contacts, contactId, onPick, clientCacheFallback,
}: {
  contacts: ClientContact[];
  contactId: number | null;
  onPick: (id: number | null) => Promise<boolean | void> | void;
  clientCacheFallback: {
    name: string | null | undefined;
    email: string | null | undefined;
    phone: string | null | undefined;
    role: string | null | undefined;
  };
}) {
  // Resolve which contact's info to render. If contact_id is set, look it
  // up in the contacts list. Otherwise use the primary from the contacts
  // list, falling back to the legacy client cache so this still renders
  // for clients whose contacts haven't been loaded yet.
  let resolved: { name: string | null; email: string | null; phone: string | null; role: string | null } | null = null;
  if (contactId != null) {
    const c = contacts.find((x) => x.id === contactId);
    if (c) resolved = { name: c.name, email: c.email, phone: c.phone, role: c.role };
  } else {
    const primary = contacts.find((c) => c.is_primary);
    if (primary) resolved = { name: primary.name, email: primary.email, phone: primary.phone, role: primary.role };
    else if (clientCacheFallback.name || clientCacheFallback.email) {
      resolved = {
        name: clientCacheFallback.name ?? null,
        email: clientCacheFallback.email ?? null,
        phone: clientCacheFallback.phone ?? null,
        role: clientCacheFallback.role ?? null,
      };
    }
  }

  return (
    <div>
      <DetailRow label="Contact">
        <select
          value={contactId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            void onPick(v === '' ? null : Number(v));
          }}
          className="text-[13px] bg-surface border border-edge rounded px-2 py-0.5 hover:border-brand-mint focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none"
        >
          <option value="">Primary contact (default)</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.is_primary ? ' (primary)' : ''}
            </option>
          ))}
        </select>
      </DetailRow>
      {resolved ? (
        <>
          <DetailRow label="Name">
            <span className="text-ink">{resolved.name || <span className="text-ink-faint">—</span>}</span>
          </DetailRow>
          <DetailRow label="Email">
            <span className="text-ink">{resolved.email || <span className="text-ink-faint">—</span>}</span>
          </DetailRow>
          <DetailRow label="Phone">
            <span className="text-ink">{resolved.phone || <span className="text-ink-faint">—</span>}</span>
          </DetailRow>
          <DetailRow label="Role">
            <span className="text-ink">{resolved.role || <span className="text-ink-faint">—</span>}</span>
          </DetailRow>
        </>
      ) : (
        <div className="text-[12px] text-ink-faint mt-1">
          No contacts yet — add one on the client page.
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <hr className="border-none border-t border-surface-alt my-2" />;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1 border-b border-surface-alt last:border-b-0">
      <span className="text-xs text-ink-muted pt-1">{label}</span>
      <div className="text-right text-[13px] text-ink min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Multi-select package editor used in the engagement detail right panel.
// Renders a comma-separated summary that opens a checkbox popover on click.
// Toggling a checkbox auto-saves; preserves any label/details already on
// retained packages so toggling another option doesn't wipe them.
function PackageCheckboxes({
  value, onCommit,
}: {
  value: EngagementPackage[];
  onCommit: (next: EngagementPackage[]) => Promise<boolean | void> | void;
}) {
  const [open, setOpen] = useState(false);
  const summary = formatPackages(value) || <span className="text-ink-faint">—</span>;
  const slugs = new Set(value.map((p) => p.slug));

  function toggle(slug: PackageSlug) {
    let next: EngagementPackage[];
    if (slugs.has(slug)) {
      next = value.filter((p) => p.slug !== slug);
    } else {
      // New 'other' rows go in with an empty label — the Package Details
      // panel below makes it editable. The PATCH validation requires
      // a non-empty label for 'other', so we set a placeholder until the
      // user fills one in. The DB will reject the patch, so we set a
      // "Other (rename me)" stub so the UI updates and the user knows
      // to fix it before the change persists.
      next = [
        ...value,
        slug === 'other'
          ? { slug: 'other', label: 'Other (rename me)' }
          : { slug },
      ];
    }
    void onCommit(next);
  }

  return (
    <div className="relative inline-block w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-right text-[13px] hover:text-brand-mint w-full"
      >
        {summary}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 bg-surface border border-edge rounded-lg shadow-card p-3 w-[260px] text-left">
            {PACKAGE_SLUGS.map((slug) => (
              <label key={slug} className="flex items-center gap-2 text-[13px] py-1 cursor-pointer hover:text-ink">
                <input
                  type="checkbox"
                  checked={slugs.has(slug)}
                  onChange={() => toggle(slug)}
                  className="accent-brand-mint"
                />
                <span>{PACKAGE_LABELS[slug]}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Click-to-edit engagement title. Empty input clears the override and
// reverts to the auto-derived package list (e.g., "Ad Copy, Landing Page").
// Hover shows a pencil affordance like the other inline editors.
function EditableTitle({
  engagement, onCommit,
}: {
  engagement: { title: string | null; packages: EngagementPackage[] };
  onCommit: (v: string | null) => Promise<boolean | void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(engagement.title ?? '');

  useEffect(() => { setDraft(engagement.title ?? ''); }, [engagement.title]);

  const auto = formatPackages(engagement.packages);
  const display = engagementTitle({ title: engagement.title, packages: engagement.packages }) || 'Engagement';

  async function commit() {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : trimmed;
    if (next === (engagement.title ?? null)) { setEditing(false); return; }
    await onCommit(next);
    setEditing(false);
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
          if (e.key === 'Escape') { setDraft(engagement.title ?? ''); setEditing(false); }
        }}
        placeholder={auto || 'Engagement'}
        maxLength={200}
        className="text-[22px] font-bold m-0 px-1.5 py-0.5 -ml-1.5 -my-0.5 border border-edge rounded bg-surface focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none min-w-[300px] max-w-[800px] flex-1"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(engagement.title ?? ''); setEditing(true); }}
      title={engagement.title ? 'Click to rename — clear to revert to package list' : 'Click to set a custom title'}
      className="group inline-flex items-baseline gap-2 text-left hover:bg-surface-alt rounded px-1.5 py-0.5 -ml-1.5 -my-0.5"
    >
      <h1 className="text-[22px] font-bold m-0 line-clamp-2">{display}</h1>
      <Pencil size={13} className="text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  );
}

// "+ Add package" button + dropdown for the engagement detail page.
// Click → menu of all 11 options. Picking a non-other option that's
// already on the engagement is a no-op (the menu shows "added" next to
// it). Picking 'Other' always adds a fresh entry, so engagements can
// carry several distinct custom line items (e.g., "Newsletter setup"
// AND "Podcast production").
function AddPackageButton({
  existingSlugs, onAdd,
}: {
  existingSlugs: Set<string>;
  onAdd: (pkg: EngagementPackage) => Promise<boolean | void> | void;
}) {
  const [open, setOpen] = useState(false);

  function add(slug: PackageSlug) {
    if (slug === 'other') {
      void onAdd({ slug: 'other', label: 'Other (rename me)' });
    } else if (!existingSlugs.has(slug)) {
      void onAdd({ slug });
    }
    setOpen(false);
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface text-ink border border-edge rounded text-xs font-semibold hover:bg-surface-alt"
      >
        <Plus size={13} /> Add package
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1 z-20 bg-surface border border-edge rounded-lg shadow-card p-1 w-[260px] text-left">
            {PACKAGE_SLUGS.map((slug) => {
              const already = slug !== 'other' && existingSlugs.has(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => add(slug)}
                  disabled={already}
                  className={cn(
                    'w-full text-left text-[13px] px-2.5 py-1.5 rounded',
                    'flex items-center justify-between gap-2',
                    already
                      ? 'text-ink-faint cursor-not-allowed'
                      : 'text-ink hover:bg-surface-page cursor-pointer',
                  )}
                >
                  <span>{PACKAGE_LABELS[slug]}</span>
                  {already && <span className="text-[10px] uppercase tracking-wider">added</span>}
                  {slug === 'other' && !already && (
                    <span className="text-[10px] uppercase tracking-wider text-ink-faint">custom</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Inline editor for a single package's label (only for 'other') + details.
// Auto-saves on blur via the parent's patch callback. Tracks dirty state
// locally so the user can type without each keystroke hitting the network.
// Each card carries a small remove (trash) button so individual packages
// can be removed without ambiguity (important for the multi-Other case).
function PackageDetailEditor({
  pkg, onChange, onRemove,
}: {
  pkg: EngagementPackage;
  onChange: (next: EngagementPackage) => Promise<boolean | void> | void;
  onRemove: () => Promise<boolean | void> | void;
}) {
  const [label, setLabel] = useState(pkg.label || '');
  const [details, setDetails] = useState(pkg.details || '');
  const [unitPrice, setUnitPrice] = useState(
    pkg.unit_price != null ? String(pkg.unit_price) : '',
  );
  const pricingType: PricingType = pkg.pricing_type ?? 'one_time';

  // Resync if the parent replaces the package (e.g., another user edits it
  // or the popover toggles a different package).
  useEffect(() => { setLabel(pkg.label || ''); }, [pkg.label]);
  useEffect(() => { setDetails(pkg.details || ''); }, [pkg.details]);
  useEffect(() => {
    setUnitPrice(pkg.unit_price != null ? String(pkg.unit_price) : '');
  }, [pkg.unit_price]);

  // Build the next package payload from the current local state. Used by
  // both blur-commit (label/details/price) and immediate-commit (pricing
  // type toggle).
  function buildNext(overrides: Partial<EngagementPackage> = {}): EngagementPackage | null {
    const trimmedLabel = label.trim();
    const trimmedDetails = details.trim();
    const trimmedPrice = unitPrice.trim();
    const priceNum = trimmedPrice === '' ? undefined : Number(trimmedPrice);
    if (priceNum != null && (!Number.isFinite(priceNum) || priceNum < 0)) return null;
    if (pkg.slug === 'other' && !(overrides.label ?? trimmedLabel)) return null;

    const next: EngagementPackage = { slug: pkg.slug };
    const finalLabel = overrides.label ?? trimmedLabel;
    const finalDetails = overrides.details ?? trimmedDetails;
    if (finalLabel) next.label = finalLabel;
    if (finalDetails) next.details = finalDetails;

    const finalPrice = overrides.unit_price ?? priceNum;
    if (finalPrice != null && finalPrice > 0) next.unit_price = finalPrice;

    const finalPricingType = overrides.pricing_type ?? pkg.pricing_type;
    if (finalPricingType) next.pricing_type = finalPricingType;
    return next;
  }

  function commit() {
    // No-op if nothing actually changed vs the persisted package.
    const next = buildNext();
    if (!next) {
      // Roll back local state for invalid input.
      setLabel(pkg.label || '');
      setUnitPrice(pkg.unit_price != null ? String(pkg.unit_price) : '');
      return;
    }
    const same =
      (next.label || '') === (pkg.label || '') &&
      (next.details || '') === (pkg.details || '') &&
      (next.unit_price ?? null) === (pkg.unit_price ?? null) &&
      (next.pricing_type ?? null) === (pkg.pricing_type ?? null);
    if (same) return;
    void onChange(next);
  }

  function setPricingType(type: PricingType) {
    if (type === pricingType) return;
    const next = buildNext({ pricing_type: type });
    if (!next) return;
    next.pricing_type = type;
    void onChange(next);
  }

  return (
    <div className="border border-edge rounded-md p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        {pkg.slug === 'other' ? (
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commit}
            placeholder="What is 'Other'?"
            maxLength={120}
            className="flex-1 text-[13px] font-semibold bg-transparent border-b border-dashed border-edge focus:border-brand-mint focus:outline-none px-0.5 py-0.5"
          />
        ) : (
          <span className="text-[13px] font-semibold text-ink">{PACKAGE_LABELS[pkg.slug] || pkg.slug}</span>
        )}
        <button
          type="button"
          onClick={() => void onRemove()}
          title="Remove this package"
          className="text-ink-faint hover:text-danger p-1 rounded transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1 max-w-[140px]">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted text-[12px] pointer-events-none">$</span>
          <input
            type="number"
            min={0}
            step="any"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            onBlur={commit}
            placeholder="0"
            className="w-full pl-5 pr-2 py-1 text-[12px] bg-surface-page border border-edge rounded focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none"
          />
        </div>
        <div className="inline-flex rounded-md border border-edge overflow-hidden text-[11px] font-semibold">
          {PRICING_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setPricingType(t)}
              className={cn(
                'px-2.5 py-1 transition-colors',
                pricingType === t
                  ? 'bg-brand-mint text-brand-charcoal'
                  : 'bg-surface text-ink-muted hover:bg-surface-alt',
              )}
            >
              {PRICING_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        onBlur={commit}
        placeholder="What's included? Quantity, frequency, scope notes — anything that should land in the proposal."
        maxLength={2000}
        className="w-full text-[13px] bg-surface-page border border-edge rounded p-2 min-h-[60px] resize-y focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none"
      />
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
