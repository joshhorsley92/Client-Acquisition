'use client';

// Tabbed client detail view: Overview / Brand Profile / Calls / Engagements / Activity.
// Each tab is a sub-component below. Profile changes save via PATCH; the
// backend auto-tags every changed leaf as 'manual' in brand_profile_sources.

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import BrandProfileEditor, { BrandProfile } from './BrandProfileEditor';
import EnrichmentBadge from './EnrichmentBadge';

type Tab = 'overview' | 'brand' | 'calls' | 'engagements' | 'activity';

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
      <header style={{ marginTop: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>
          {client.name}
          <EnrichmentBadge status={client.enrichment_status} />
        </h1>
        <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
          {[client.industry, client.location].filter(Boolean).join(' · ') || 'No industry/location set'}
        </div>
      </header>

      <nav style={tabBar}>
        {(['overview', 'brand', 'calls', 'engagements', 'activity'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>
            {t === 'brand' ? 'Brand Profile' : t.charAt(0).toUpperCase() + t.slice(1)}
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

// ============================================================================
// Overview tab — editable scalar fields + side panels (Source, Fit, Enrichment)
// ============================================================================
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
  const [msg, setMsg] = useState('');

  const setF = (k: string) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true); setMsg('');
    try {
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(form)) payload[k] = v || null;
      const { client: updated } = await api.patch<{ client: any }>(`/api/clients/${client.id}`, payload);
      onChange(updated);
      setMsg('Saved.');
      setTimeout(() => setMsg(''), 2000);
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function recompute() {
    try {
      await api.post(`/api/clients/${client.id}/fit-score/recompute`);
      // Refetch the client to pick up the new score
      const fresh = await fetch(`/api/clients/${client.id}`).then((r) => r.json());
      if (fresh?.client) onChange(fresh.client);
    } catch (err: any) {
      setMsg(`Recompute failed: ${err.message}`);
    }
  }

  const fitBreakdown: any = client.fit_score_breakdown || null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
      {/* Left: editable form */}
      <div style={panel}>
        <PanelTitle>Profile</PanelTitle>
        <Row>
          <Field label="Name"><input style={input} value={form.name} onChange={setF('name')} /></Field>
          <Field label="Website"><input style={input} value={form.website} onChange={setF('website')} /></Field>
        </Row>
        <Row>
          <Field label="Industry"><input style={input} value={form.industry} onChange={setF('industry')} /></Field>
          <Field label="Location"><input style={input} value={form.location} onChange={setF('location')} /></Field>
          <Field label="Type">
            <select style={input} value={form.type} onChange={setF('type')}>
              <option value="">—</option><option value="B2B">B2B</option><option value="B2C">B2C</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Employee count"><input style={input} value={form.employee_count} onChange={setF('employee_count')} /></Field>
          <Field label="Revenue estimate"><input style={input} value={form.revenue_estimate} onChange={setF('revenue_estimate')} placeholder="$500K, $2M, ..." /></Field>
        </Row>
        <hr style={hr} />
        <Field label="Primary contact name"><input style={input} value={form.primary_contact_name} onChange={setF('primary_contact_name')} /></Field>
        <Row>
          <Field label="Email"><input style={input} type="email" value={form.email} onChange={setF('email')} /></Field>
          <Field label="Phone"><input style={input} value={form.phone} onChange={setF('phone')} /></Field>
        </Row>
        <Row>
          <Field label="Role"><input style={input} value={form.role} onChange={setF('role')} /></Field>
          <Field label="Preferred contact">
            <select style={input} value={form.preferred_contact} onChange={setF('preferred_contact')}>
              <option value="">—</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="text">Text</option>
              <option value="linkedin">LinkedIn</option>
            </select>
          </Field>
        </Row>
        <Field label="Notes">
          <textarea style={{ ...input, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} value={form.notes} onChange={setF('notes')} />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button onClick={save} disabled={saving} style={primaryBtn(saving)}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('Error') ? '#dc2626' : '#047857' }}>{msg}</span>}
        </div>
      </div>

      {/* Right: side panels */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
    <div style={panel}>
      <PanelTitle>Source</PanelTitle>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2838' }}>{meta.label}</div>
      {meta.detail && <div style={{ marginTop: 2, fontSize: 12, color: '#64748B' }}>{meta.detail}</div>}
      {client.source_imported_at && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#64748B' }}>
          <strong>Imported:</strong> {new Date(client.source_imported_at).toLocaleString()}
        </div>
      )}
      {(enrichment.review_count != null || enrichment.rating != null) && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#64748B' }}>
          <strong>At scrape time:</strong>{' '}
          {enrichment.review_count != null && `${enrichment.review_count} reviews`}
          {enrichment.review_count != null && enrichment.rating != null && ' · '}
          {enrichment.rating != null && `${enrichment.rating}★`}
        </div>
      )}
      {isHttp && (
        <a href={client.source_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#00D4AA' }}>
          View source listing →
        </a>
      )}
    </div>
  );
}

function FitScorePanel({ client, fitBreakdown, onRecompute }: { client: any; fitBreakdown: any; onRecompute: () => void }) {
  return (
    <div style={panel}>
      <PanelTitle>Fit score</PanelTitle>
      {client.fit_score == null ? (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Not computed yet.</div>
      ) : (
        <>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#1B2838' }}>
            {client.fit_score}<span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 400 }}> / 100</span>
          </div>
          {fitBreakdown?.breakdown && (
            <div style={{ marginTop: 8 }}>
              {Object.entries(fitBreakdown.breakdown).map(([k, v]: [string, any]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B', padding: '3px 0' }}>
                  <span>{k.replace(/_/g, ' ')}</span>
                  <span style={{ fontWeight: 600 }}>{v.score}/{v.max}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <button onClick={onRecompute} style={{ ...secondaryBtn, marginTop: 10, fontSize: 12, padding: '6px 12px' }}>
        Recompute
      </button>
    </div>
  );
}

function EnrichmentSidePanel({ client }: { client: any }) {
  const enrichment = client.enrichment_data || {};
  return (
    <div style={panel}>
      <PanelTitle>Enrichment</PanelTitle>
      <EnrichmentBadge status={client.enrichment_status} />
      {client.enrichment_status === 'succeeded' && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#64748B', lineHeight: 1.6 }}>
          {enrichment.emails?.length > 0 && (
            <div><strong>Emails:</strong> {enrichment.emails.join(', ')}</div>
          )}
          {enrichment.website_quality && (
            <div><strong>Website quality:</strong> {enrichment.website_quality}
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

// ============================================================================
// Brand Profile tab
// ============================================================================
function BrandProfileTab({ client, onChange }: { client: any; onChange: (c: any) => void }) {
  const [profile, setProfile] = useState<BrandProfile>(client.brand_profile || {});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    setSaving(true); setMsg('');
    try {
      const { client: updated } = await api.patch<{ client: any }>(`/api/clients/${client.id}`, { brand_profile: profile });
      onChange(updated);
      setMsg('Saved. Edited fields are now tagged "manual" — future call applies will skip them.');
      setTimeout(() => setMsg(''), 4000);
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
          The canonical Brand Profile for this client. Auto-merges from call extractions; your edits win.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('Error') ? '#dc2626' : '#047857' }}>{msg}</span>}
          <button onClick={save} disabled={saving} style={primaryBtn(saving)}>
            {saving ? 'Saving…' : 'Save Brand Profile'}
          </button>
        </div>
      </div>
      <BrandProfileEditor value={profile} onChange={setProfile} disabled={saving} />
    </div>
  );
}

// ============================================================================
// Calls tab
// ============================================================================
function CallsTab({ calls, clientId }: { calls: any[]; clientId: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Call recordings</h2>
        <Link href={`/calls?client_id=${clientId}`} style={{ fontSize: 13, color: '#00D4AA' }}>
          Open in Calls page →
        </Link>
      </div>
      {calls.length === 0 ? (
        <div style={{ ...panel, color: '#94a3b8', fontSize: 13 }}>
          No call recordings yet for this client. Add one from the Calls page.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {calls.map((c) => (
            <li key={c.id} style={{ ...panel, marginBottom: 8, padding: 12 }}>
              <Link href={`/calls/${c.id}`} style={{ fontSize: 13, fontWeight: 600, color: '#00D4AA' }}>
                Call #{c.id}
              </Link>
              <span style={{ fontSize: 12, color: '#64748B', marginLeft: 8 }}>
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

// ============================================================================
// Engagements tab
// ============================================================================
function EngagementsTab({ engagements, clientId }: { engagements: any[]; clientId: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Engagements</h2>
        <Link href={`/engagements?client_id=${clientId}`} style={{ fontSize: 13, color: '#00D4AA' }}>
          Manage in Engagements page →
        </Link>
      </div>
      {engagements.length === 0 ? (
        <div style={{ ...panel, color: '#94a3b8', fontSize: 13 }}>
          No engagements yet. Open one from the Engagements page.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {engagements.map((e) => (
            <li key={e.id} style={{ ...panel, marginBottom: 8, padding: 12 }}>
              <span style={{ fontWeight: 600 }}>{e.package_type || 'Engagement'} #{e.id}</span>
              <span style={engStatusPill(e.status)}>{e.status}</span>
              <span style={{ fontSize: 12, color: '#64748B', marginLeft: 8 }}>
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

// ============================================================================
// Activity tab
// ============================================================================
function ActivityTab({ activities }: { activities: any[] }) {
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Activity feed</h2>
      {activities.length === 0 ? (
        <div style={{ ...panel, color: '#94a3b8', fontSize: 13 }}>No activity yet.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {activities.map((a) => (
            <li key={a.id} style={{ ...panel, marginBottom: 6, padding: 10 }}>
              <div style={{ fontSize: 13, color: '#1B2838' }}>{a.content || '(no content)'}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {a.type} · {new Date(a.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----- shared styles -----
const tabBar: React.CSSProperties = {
  display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #E2E6EB',
};
const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '10px 16px', fontSize: 13, fontWeight: active ? 600 : 400,
  background: 'none', border: 'none', cursor: 'pointer',
  color: active ? '#1B2838' : '#64748B',
  borderBottom: active ? '2px solid #00D4AA' : '2px solid transparent',
});
const panel: React.CSSProperties = {
  background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16,
};
function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 0, marginBottom: 12 }}>{children}</h3>;
}
const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>{children}</div>
);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 10 }}>
    <label style={{ display: 'block', fontSize: 11, color: '#64748B', marginBottom: 4 }}>{label}</label>
    {children}
  </div>
);
const input: React.CSSProperties = {
  width: '100%', padding: '6px 10px', border: '1px solid #E2E6EB',
  borderRadius: 4, fontSize: 13, boxSizing: 'border-box',
};
const hr: React.CSSProperties = { border: 'none', borderTop: '1px solid #F0F2F5', margin: '14px 0' };
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 16px', background: '#00D4AA', color: '#1B2838', border: 'none',
  borderRadius: 4, fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const secondaryBtn: React.CSSProperties = {
  padding: '8px 16px', background: '#fff', color: '#1B2838',
  border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
function engStatusPill(status: string): React.CSSProperties {
  const tones: Record<string, { bg: string; color: string; border: string }> = {
    new: { bg: '#FFF8E6', color: '#A16207', border: '#FCD34D' },
    working: { bg: '#E0F2FE', color: '#075985', border: '#7DD3FC' },
    won: { bg: '#E6FAF5', color: '#047857', border: '#6EE7B7' },
    lost: { bg: '#FEF2F2', color: '#991b1b', border: '#FCA5A5' },
  };
  const t = tones[status] || tones.new;
  return {
    fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
    marginLeft: 8, background: t.bg, color: t.color, border: `1px solid ${t.border}`,
  };
}
