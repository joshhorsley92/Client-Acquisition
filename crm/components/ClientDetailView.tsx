'use client';

// Tabbed client detail view: Overview / Brand Profile / Calls / Engagements / Activity.
// Each tab is a sub-component below. Profile changes save via PATCH; the
// backend auto-tags every changed leaf as 'manual' in brand_profile_sources.

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import BrandProfileEditor, { BrandProfile } from './BrandProfileEditor';
import EnrichmentBadge from './EnrichmentBadge';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import { cn } from '@/lib/cn';

type Tab = 'overview' | 'brand' | 'calls' | 'engagements' | 'activity';

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  brand: 'Brand Profile',
  calls: 'Calls',
  engagements: 'Engagements',
  activity: 'Activity',
};

export default function ClientDetailView({
  initialClient, initialEngagements, initialActivities, initialCalls,
}: {
  initialClient: any;
  initialEngagements: any[];
  initialActivities: any[];
  initialCalls: any[];
}) {
  const [client, setClient] = useState<any>(initialClient);
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div>
      <header className="mt-3 mb-6">
        <h1 className="text-[26px] font-bold m-0 flex items-center">
          {client.name}
          <EnrichmentBadge status={client.enrichment_status} />
        </h1>
        <div className="text-[13px] text-ink-muted mt-1">
          {[client.industry, client.location].filter(Boolean).join(' · ') || 'No industry/location set'}
        </div>
      </header>

      <nav className="flex gap-1 mb-5 border-b border-edge">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2.5 text-[13px] bg-transparent border-none cursor-pointer border-b-2 transition-colors',
              tab === t
                ? 'text-ink font-semibold border-b-brand-mint'
                : 'text-ink-muted font-normal border-b-transparent hover:text-ink',
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <OverviewTab client={client} onChange={setClient} />}
      {tab === 'brand' && <BrandProfileTab client={client} onChange={setClient} />}
      {tab === 'calls' && <CallsTab calls={initialCalls} clientId={client.id} />}
      {tab === 'engagements' && <EngagementsTab engagements={initialEngagements} clientId={client.id} />}
      {tab === 'activity' && <ActivityTab activities={initialActivities} />}
    </div>
  );
}

// =========================================================================
// Overview tab
// =========================================================================
function OverviewTab({ client, onChange }: { client: any; onChange: (c: any) => void }) {
  const [form, setForm] = useState(() => ({
    name: client.name || '',
    website: client.website || '',
    industry: client.industry || '',
    location: client.location || '',
    type: client.type || '',
    employee_count: client.employee_count || '',
    revenue_estimate: client.revenue_estimate || '',
    primary_contact_name: client.primary_contact_name || '',
    email: client.email || '',
    phone: client.phone || '',
    role: client.role || '',
    preferred_contact: client.preferred_contact || '',
    notes: client.notes || '',
  }));
  const [saving, setSaving] = useState(false);

  const setF = (k: string) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(form)) payload[k] = v || null;
      const { client: updated } = await api.patch<{ client: any }>(`/api/clients/${client.id}`, payload);
      onChange(updated);
      toast.success('Profile saved.');
    } catch (err: unknown) {
      toast.error(humanizeError(err, 'Failed to save profile.'));
    } finally {
      setSaving(false);
    }
  }

  async function recompute() {
    try {
      await api.post(`/api/clients/${client.id}/fit-score/recompute`);
      const fresh = await fetch(`/api/clients/${client.id}`).then((r) => r.json());
      if (fresh?.client) onChange(fresh.client);
      toast.success('Fit score recomputed.');
    } catch (err: unknown) {
      toast.error(humanizeError(err, 'Recompute failed.'));
    }
  }

  const fitBreakdown: any = client.fit_score_breakdown || null;

  return (
    <div className="grid grid-cols-[2fr_1fr] gap-5">
      <div className={panelClass}>
        <PanelTitle>Profile</PanelTitle>
        <Row>
          <Field label="Name"><Input value={form.name} onChange={setF('name')} /></Field>
          <Field label="Website"><Input value={form.website} onChange={setF('website')} /></Field>
        </Row>
        <Row>
          <Field label="Industry"><Input value={form.industry} onChange={setF('industry')} /></Field>
          <Field label="Location"><Input value={form.location} onChange={setF('location')} /></Field>
          <Field label="Type">
            <Select value={form.type} onChange={setF('type')}>
              <option value="">—</option><option value="B2B">B2B</option><option value="B2C">B2C</option>
            </Select>
          </Field>
        </Row>
        <Row>
          <Field label="Employee count"><Input value={form.employee_count} onChange={setF('employee_count')} /></Field>
          <Field label="Revenue estimate">
            <Input value={form.revenue_estimate} onChange={setF('revenue_estimate')} placeholder="$500K, $2M, ..." />
          </Field>
        </Row>
        <Divider />
        <Field label="Primary contact name">
          <Input value={form.primary_contact_name} onChange={setF('primary_contact_name')} />
        </Field>
        <Row>
          <Field label="Email"><Input type="email" value={form.email} onChange={setF('email')} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={setF('phone')} /></Field>
        </Row>
        <Row>
          <Field label="Role"><Input value={form.role} onChange={setF('role')} /></Field>
          <Field label="Preferred contact">
            <Select value={form.preferred_contact} onChange={setF('preferred_contact')}>
              <option value="">—</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="text">Text</option>
              <option value="linkedin">LinkedIn</option>
            </Select>
          </Field>
        </Row>
        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={setF('notes')}
            className="w-full px-2.5 py-2 border border-edge rounded text-[13px] bg-surface min-h-[80px] resize-y font-sans focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none"
          />
        </Field>

        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-brand-mint text-brand-charcoal border-none rounded text-[13px] font-semibold hover:bg-brand-mint-dark disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {client.source_lead_id && <SourcePanel client={client} />}
        <FitScorePanel client={client} fitBreakdown={fitBreakdown} onRecompute={recompute} />
        <EnrichmentSidePanel client={client} />
      </div>
    </div>
  );
}

function SourcePanel({ client }: { client: any }) {
  const SOURCE_LABELS: Record<string, { label: string; detail?: string }> = {
    county_registry: { label: 'Michigan LARA registry', detail: 'Newly-registered Michigan business' },
    csv_import: { label: 'CSV import' },
    referral: { label: 'Referral' },
  };
  const meta = SOURCE_LABELS[client.source_platform] || {
    label: client.source_platform || 'External source',
  };
  const enrichment = client.enrichment_data || {};
  const isHttp = typeof client.source_url === 'string' && /^https?:\/\//i.test(client.source_url);
  return (
    <div className={panelClass}>
      <PanelTitle>Source</PanelTitle>
      <div className="text-[13px] font-semibold text-ink">{meta.label}</div>
      {meta.detail && <div className="mt-0.5 text-xs text-ink-muted">{meta.detail}</div>}
      {client.source_imported_at && (
        <div className="mt-1.5 text-xs text-ink-muted">
          <strong>Imported:</strong> {new Date(client.source_imported_at).toLocaleString()}
        </div>
      )}
      {(enrichment.review_count != null || enrichment.rating != null) && (
        <div className="mt-1.5 text-xs text-ink-muted">
          <strong>At scrape time:</strong>{' '}
          {enrichment.review_count != null && `${enrichment.review_count} reviews`}
          {enrichment.review_count != null && enrichment.rating != null && ' · '}
          {enrichment.rating != null && `${enrichment.rating}★`}
        </div>
      )}
      {isHttp && (
        <a href={client.source_url} target="_blank" rel="noreferrer" className="block mt-2 text-xs text-brand-mint hover:underline">
          View source listing →
        </a>
      )}
    </div>
  );
}

function FitScorePanel({ client, fitBreakdown, onRecompute }: { client: any; fitBreakdown: any; onRecompute: () => void }) {
  return (
    <div className={panelClass}>
      <PanelTitle>Fit score</PanelTitle>
      {client.fit_score == null ? (
        <div className="text-[13px] text-ink-faint">Not computed yet.</div>
      ) : (
        <>
          <div className="text-4xl font-bold text-ink">
            {client.fit_score}
            <span className="text-sm text-ink-faint font-normal"> / 100</span>
          </div>
          {fitBreakdown?.breakdown && (
            <div className="mt-2">
              {Object.entries(fitBreakdown.breakdown).map(([k, v]: [string, any]) => (
                <div key={k} className="flex justify-between text-xs text-ink-muted py-0.5">
                  <span>{k.replace(/_/g, ' ')}</span>
                  <span className="font-semibold">{v.score}/{v.max}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <button
        onClick={onRecompute}
        className="mt-2.5 px-3 py-1.5 bg-surface text-ink border border-edge rounded text-xs font-semibold hover:bg-surface-alt"
      >
        Recompute
      </button>
    </div>
  );
}

function EnrichmentSidePanel({ client }: { client: any }) {
  const enrichment = client.enrichment_data || {};
  return (
    <div className={panelClass}>
      <PanelTitle>Enrichment</PanelTitle>
      <EnrichmentBadge status={client.enrichment_status} />
      {client.enrichment_status === 'succeeded' && (
        <div className="mt-2.5 text-xs text-ink-muted leading-relaxed">
          {enrichment.emails?.length > 0 && (
            <div><strong>Emails:</strong> {enrichment.emails.join(', ')}</div>
          )}
          {enrichment.website_quality && (
            <div>
              <strong>Website quality:</strong> {enrichment.website_quality}
              {enrichment.has_seo && ' · SEO'}{enrichment.has_paid_ads && ' · Paid ads'}
            </div>
          )}
          {enrichment.social_platforms?.length > 0 && (
            <div><strong>Socials:</strong> {enrichment.social_platforms.join(', ')}</div>
          )}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// Brand Profile tab
// =========================================================================
function BrandProfileTab({ client, onChange }: { client: any; onChange: (c: any) => void }) {
  const [profile, setProfile] = useState<BrandProfile>(client.brand_profile || {});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { client: updated } = await api.patch<{ client: any }>(`/api/clients/${client.id}`, { brand_profile: profile });
      onChange(updated);
      toast.success('Brand Profile saved. Edited fields are tagged "manual" — future call applies will skip them.', 4500);
    } catch (err: unknown) {
      toast.error(humanizeError(err, 'Failed to save Brand Profile.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3.5">
        <p className="text-[13px] text-ink-muted m-0">
          The canonical Brand Profile for this client. Auto-merges from call extractions; your edits win.
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-brand-mint text-brand-charcoal border-none rounded text-[13px] font-semibold hover:bg-brand-mint-dark disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Brand Profile'}
        </button>
      </div>
      <BrandProfileEditor value={profile} onChange={setProfile} disabled={saving} />
    </div>
  );
}

// =========================================================================
// Calls tab
// =========================================================================
function CallsTab({ calls, clientId }: { calls: any[]; clientId: number }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-base font-bold m-0">Call recordings</h2>
        <Link href={`/calls?client_id=${clientId}`} className="text-[13px] text-brand-mint hover:underline">
          Open in Calls page →
        </Link>
      </div>
      {calls.length === 0 ? (
        <div className={cn(panelClass, 'text-[13px] text-ink-faint')}>
          No call recordings yet for this client.{' '}
          <Link href={`/calls?client_id=${clientId}`} className="text-brand-mint hover:underline">
            Add one from the Calls page.
          </Link>
        </div>
      ) : (
        <ul className="list-none p-0 m-0">
          {calls.map((c) => (
            <li key={c.id} className={cn(panelClass, 'mb-2 p-3')}>
              <Link href={`/calls/${c.id}`} className="text-[13px] font-semibold text-brand-mint hover:underline">
                Call #{c.id}
              </Link>
              <span className="text-xs text-ink-muted ml-2">
                {c.call_date ? new Date(c.call_date).toLocaleDateString() : new Date(c.created_at).toLocaleDateString()}
                {c.transcript_source && ` · ${c.transcript_source}`}
                {c.review_status !== 'none' && ` · ${c.review_status}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =========================================================================
// Engagements tab
// =========================================================================
function EngagementsTab({ engagements, clientId }: { engagements: any[]; clientId: number }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-base font-bold m-0">Engagements</h2>
        <Link href={`/engagements?client_id=${clientId}`} className="text-[13px] text-brand-mint hover:underline">
          Manage in Engagements page →
        </Link>
      </div>
      {engagements.length === 0 ? (
        <div className={cn(panelClass, 'text-[13px] text-ink-faint')}>
          No engagements yet.{' '}
          <Link href={`/engagements?client_id=${clientId}`} className="text-brand-mint hover:underline">
            Open one from the Engagements page.
          </Link>
        </div>
      ) : (
        <ul className="list-none p-0 m-0">
          {engagements.map((e) => (
            <li key={e.id} className={cn(panelClass, 'mb-2 p-3')}>
              <Link href={`/engagements/${e.id}`} className="font-semibold text-ink hover:text-brand-mint">
                {e.package_type || 'Engagement'} #{e.id}
              </Link>
              <EngagementStatusPill status={e.status} />
              <span className="text-xs text-ink-muted ml-2">
                {e.estimated_value ? `$${Number(e.estimated_value).toLocaleString()}` : ''}
                {e.notes && ` · ${e.notes.slice(0, 80)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EngagementStatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    new:     'bg-warning-bg text-warning border border-warning-border',
    working: 'bg-blue-50 text-blue-800 border border-blue-200',
    won:     'bg-success-bg text-success border border-success-border',
    lost:    'bg-danger-bg text-danger-strong border border-danger-border',
  };
  return (
    <span className={cn(
      'inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold ml-2',
      tones[status] || tones.new,
    )}>
      {status}
    </span>
  );
}

// =========================================================================
// Activity tab
// =========================================================================
function ActivityTab({ activities }: { activities: any[] }) {
  return (
    <div>
      <h2 className="text-base font-bold mb-3">Activity feed</h2>
      {activities.length === 0 ? (
        <div className={cn(panelClass, 'text-[13px] text-ink-faint')}>No activity yet.</div>
      ) : (
        <ul className="list-none p-0 m-0">
          {activities.map((a) => (
            <li key={a.id} className={cn(panelClass, 'mb-1.5 p-2.5')}>
              <div className="text-[13px] text-ink">{a.content || '(no content)'}</div>
              <div className="text-[11px] text-ink-faint mt-0.5">
                {a.type} · {new Date(a.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =========================================================================
// Local primitives
// =========================================================================
const panelClass = 'bg-surface border border-edge rounded-lg p-4';

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mt-0 mb-3">
      {children}
    </h3>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <label className="block text-[11px] text-ink-muted mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full px-2.5 py-1.5 border border-edge rounded text-[13px] bg-surface',
        'focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none',
        props.className,
      )}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'w-full px-2.5 py-1.5 border border-edge rounded text-[13px] bg-surface',
        'focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none',
        props.className,
      )}
    />
  );
}

function Divider() {
  return <hr className="border-none border-t border-surface-alt my-3.5" />;
}
