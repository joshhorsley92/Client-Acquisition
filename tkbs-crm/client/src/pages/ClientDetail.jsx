import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import {
  markdownToHtml,
  downloadMarkdownAsDocx,
  downloadAsMarkdown,
  copyToClipboard,
} from '../lib/markdown';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'engagements', label: 'Engagements' },
  { key: 'calls', label: 'Calls' },
  { key: 'automations', label: 'Automations' },
  { key: 'activity', label: 'Activity' },
];

const money = (n) => '$' + Number(n || 0).toLocaleString();

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(String(ts).includes('T') ? ts : String(ts).replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString();
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(String(ts).includes('T') ? ts : String(ts).replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [engagements, setEngagements] = useState([]);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('overview');

  const load = async () => {
    try {
      const data = await api.getClient(id);
      setClient(data.client);
      setEngagements(data.engagements || []);
    } catch (e) {
      setErr(e.message || 'Failed to load client');
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // Poll while enrichment is running
  useEffect(() => {
    if (client?.enrichment_status !== 'running') return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line
  }, [client?.enrichment_status]);

  if (err) {
    return (
      <div>
        <Link to="/clients" style={{ color: '#00D4AA', fontSize: 13 }}>← All clients</Link>
        <div style={{
          padding: 16, marginTop: 12,
          background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
          borderRadius: 6, fontSize: 13,
        }}>{err}</div>
      </div>
    );
  }

  if (!client) {
    return <div style={{ padding: 24, color: '#64748B' }}>Loading…</div>;
  }

  return (
    <div>
      <Link to="/clients" style={{ color: '#00D4AA', fontSize: 13 }}>← All clients</Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 4px' }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>{client.name}</h1>
        <EnrichmentBadge status={client.enrichment_status} />
      </div>
      <div style={{ color: '#64748B', fontSize: 13, marginBottom: 20 }}>
        {[client.industry, client.location, client.type].filter(Boolean).join(' · ') || <span style={{ color: '#94a3b8' }}>no profile yet</span>}
      </div>

      {/* Tab strip */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #E2E6EB', marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'transparent', border: 'none',
              color: tab === t.key ? '#1B2838' : '#94a3b8',
              borderBottom: tab === t.key ? '2px solid #00D4AA' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab client={client} onChange={load} onDelete={() => navigate('/clients')} />
      )}
      {tab === 'engagements' && (
        <EngagementsTab clientId={client.id} engagements={engagements} onChange={load} />
      )}
      {tab === 'calls' && <CallsTab clientId={client.id} clientName={client.name} />}
      {tab === 'automations' && <AutomationsTab client={client} engagements={engagements} />}
      {tab === 'activity' && <ActivityTab clientId={client.id} />}
    </div>
  );
}

function EnrichmentBadge({ status }) {
  if (!status || status === 'none') return null;
  const tones = {
    running: { bg: '#FFF8E6', color: '#A16207', border: '#FCD34D', label: 'Enriching…' },
    succeeded: { bg: '#E6FAF5', color: '#047857', border: '#6EE7B7', label: 'Enriched' },
    failed: { bg: '#FEF2F2', color: '#991b1b', border: '#FCA5A5', label: 'Enrichment failed' },
  };
  const t = tones[status];
  if (!t) return null;
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
      background: t.bg, color: t.color, border: `1px solid ${t.border}`,
    }}>{t.label}</span>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ client, onChange, onDelete }) {
  const [form, setForm] = useState(() => hydrate(client));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [reEnriching, setReEnriching] = useState(false);

  useEffect(() => { setForm(hydrate(client)); }, [client.id]);

  const update = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg('');
    try {
      await api.updateClient(client.id, form);
      setMsg('Saved.');
      onChange();
    } catch (err) {
      setMsg(err.message || 'Save failed');
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 2500);
    }
  };

  const reEnrich = async () => {
    setReEnriching(true);
    try {
      await api.runEnrichment({ client_id: client.id });
      onChange();
    } catch (err) {
      alert(err.message || 'Re-enrich failed');
    } finally {
      setReEnriching(false);
    }
  };

  const del = async () => {
    if (!confirm(`Delete ${client.name}? This cascades to all engagements and activities.`)) return;
    try {
      await api.deleteClient(client.id);
      onDelete();
    } catch (err) {
      alert(err.message || 'Delete failed');
    }
  };

  let enrichment = {};
  try { enrichment = JSON.parse(client.enrichment_data || '{}'); } catch (e) {}
  let fitBreakdown = null;
  try { fitBreakdown = JSON.parse(client.fit_score_breakdown || 'null'); } catch (e) {}

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20 }}>
      <div>
        <form onSubmit={save} style={panelStyle}>
          <PanelTitle>Profile</PanelTitle>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Name"><input required value={form.name} onChange={update('name')} style={inputStyle} /></Field>
            <Field label="Website"><input value={form.website} onChange={update('website')} style={inputStyle} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Industry"><input value={form.industry} onChange={update('industry')} style={inputStyle} /></Field>
            <Field label="Location"><input value={form.location} onChange={update('location')} style={inputStyle} /></Field>
            <Field label="Type">
              <select value={form.type || ''} onChange={update('type')} style={inputStyle}>
                <option value="">—</option><option value="B2B">B2B</option><option value="B2C">B2C</option>
              </select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Employee count"><input value={form.employee_count} onChange={update('employee_count')} style={inputStyle} /></Field>
            <Field label="Revenue estimate"><input value={form.revenue_estimate} onChange={update('revenue_estimate')} placeholder="$500K, $2M, …" style={inputStyle} /></Field>
          </div>

          <div style={{ borderTop: '1px solid #E2E6EB', margin: '12px 0' }} />

          <Field label="Primary contact name"><input value={form.primary_contact_name} onChange={update('primary_contact_name')} style={inputStyle} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Email"><input value={form.email} onChange={update('email')} style={inputStyle} /></Field>
            <Field label="Phone"><input value={form.phone} onChange={update('phone')} style={inputStyle} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Role"><input value={form.role} onChange={update('role')} style={inputStyle} /></Field>
            <Field label="Preferred contact">
              <select value={form.preferred_contact || ''} onChange={update('preferred_contact')} style={inputStyle}>
                <option value="">—</option><option value="email">Email</option><option value="phone">Phone</option>
                <option value="text">Text</option><option value="linkedin">LinkedIn</option>
              </select>
            </Field>
          </div>

          <Field label="Notes">
            <textarea rows={5} value={form.notes} onChange={update('notes')}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
          </Field>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <button type="submit" disabled={saving} style={primaryBtnStyle}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {msg && <span style={{ fontSize: 12, color: msg === 'Saved.' ? '#047857' : '#991b1b' }}>{msg}</span>}
          </div>
        </form>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={panelStyle}>
          <PanelTitle>Fit score</PanelTitle>
          {client.fit_score == null ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>Not computed yet.</div>
          ) : (
            <>
              <div style={{ fontSize: 40, fontWeight: 600, color: '#1B2838' }}>{client.fit_score}<span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 400 }}> / 100</span></div>
              {fitBreakdown?.breakdown && (
                <div style={{ marginTop: 10 }}>
                  {Object.entries(fitBreakdown.breakdown).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B', padding: '3px 0' }}>
                      <span>{k.replace(/_/g, ' ')}</span>
                      <span style={{ fontWeight: 600 }}>{v.score}/{v.max}</span>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={async () => { try { await api.recomputeClientFitScore(client.id); onChange(); } catch (e) { alert(e.message); } }}
                style={{ ...secondaryBtnStyle, marginTop: 10, fontSize: 12, padding: '6px 12px' }}
              >
                Recompute
              </button>
            </>
          )}
        </div>

        <div style={panelStyle}>
          <PanelTitle>Enrichment</PanelTitle>
          <EnrichmentBadge status={client.enrichment_status} />
          {client.enrichment_status === 'succeeded' && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#64748B' }}>
              {enrichment.emails?.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Emails found:</div>
                  {enrichment.emails.map((e) => <div key={e}>{e}</div>)}
                </div>
              )}
              {enrichment.social_links && Object.keys(enrichment.social_links).length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Socials:</div>
                  {Object.entries(enrichment.social_links).map(([k, v]) => (
                    <div key={k}>
                      <a href={v} target="_blank" rel="noreferrer" style={{ color: '#00D4AA' }}>{k}</a>
                    </div>
                  ))}
                </div>
              )}
              {enrichment.website_quality && (
                <div style={{ marginTop: 8 }}>
                  <strong>Website quality:</strong> {enrichment.website_quality}
                  {enrichment.has_seo && ' · SEO'}
                  {enrichment.has_paid_ads && ' · Paid ads'}
                </div>
              )}
              {enrichment.confidence != null && (
                <div style={{ marginTop: 8 }}>
                  <strong>Confidence:</strong> {Math.round(enrichment.confidence * 100)}%
                </div>
              )}
            </div>
          )}
          {client.enrichment_status === 'failed' && enrichment.error && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b' }}>{enrichment.error}</div>
          )}
          <button
            onClick={reEnrich}
            disabled={reEnriching || client.enrichment_status === 'running'}
            style={{ ...secondaryBtnStyle, marginTop: 10, fontSize: 12, padding: '6px 12px' }}
          >
            {reEnriching || client.enrichment_status === 'running' ? 'Running…' : 'Re-enrich'}
          </button>
        </div>

        <div style={panelStyle}>
          <PanelTitle>Danger zone</PanelTitle>
          <button onClick={del} style={{
            padding: '8px 12px', background: '#fff', color: '#991b1b',
            border: '1px solid #FCA5A5', borderRadius: 4, fontSize: 13, cursor: 'pointer',
          }}>
            Delete client
          </button>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            Cascades to engagements, activities, calls.
          </div>
        </div>
      </div>
    </div>
  );
}

function hydrate(c) {
  return {
    name: c.name || '', website: c.website || '', industry: c.industry || '',
    location: c.location || '', type: c.type || '',
    employee_count: c.employee_count || '', revenue_estimate: c.revenue_estimate || '',
    primary_contact_name: c.primary_contact_name || '', email: c.email || '', phone: c.phone || '',
    role: c.role || '', preferred_contact: c.preferred_contact || '',
    notes: c.notes || '',
  };
}

// ---------------------------------------------------------------------------
// Engagements tab
// ---------------------------------------------------------------------------

const ENG_STATUSES = ['new', 'working', 'won', 'lost'];
const ENG_SOURCES = ['referral', 'cold', 'web', 'content', 'paid_ads'];
const ENG_PACKAGES = ['boost', 'launch', 'both', 'undecided'];

function EngagementsTab({ clientId, engagements, onChange }) {
  const [showNew, setShowNew] = useState(false);
  const sorted = useMemo(
    () => [...engagements].sort((a, b) => (b.opened_at || '').localeCompare(a.opened_at || '')),
    [engagements],
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: '#64748B' }}>
          {engagements.length === 0 ? 'No engagements yet.' : `${engagements.length} engagement${engagements.length === 1 ? '' : 's'}`}
        </div>
        <button onClick={() => setShowNew(true)} style={primaryBtnStyle}>+ Add engagement</button>
      </div>

      {sorted.map((e) => (
        <EngagementRow key={e.id} engagement={e} onChange={onChange} />
      ))}

      <NewEngagementModal
        open={showNew}
        clientId={clientId}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); onChange(); }}
      />
    </div>
  );
}

function EngagementRow({ engagement, onChange }) {
  const [saving, setSaving] = useState(false);

  const changeStatus = async (newStatus) => {
    if (newStatus === engagement.status) return;
    let payload = { status: newStatus };
    if (newStatus === 'lost') {
      const reason = prompt('Reason for losing this engagement?');
      if (!reason) return;
      payload.lost_reason = reason;
    }
    if (newStatus === 'won') {
      const val = prompt(`Closed value (was $${engagement.estimated_value})?`, engagement.estimated_value || '');
      if (val === null) return;
      const n = Number(val);
      if (!isNaN(n) && n >= 0) payload.closed_value = n;
    }
    setSaving(true);
    try {
      await api.updateEngagement(engagement.id, payload);
      onChange();
    } catch (err) {
      alert(err.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const updateValue = async (field, val) => {
    setSaving(true);
    try {
      await api.updateEngagement(engagement.id, { [field]: val });
      onChange();
    } catch (err) {
      alert(err.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!confirm('Delete this engagement?')) return;
    try {
      await api.deleteEngagement(engagement.id);
      onChange();
    } catch (err) { alert(err.message || 'Delete failed'); }
  };

  return (
    <div style={{ ...panelStyle, marginBottom: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8' }}>Status</div>
          <select
            value={engagement.status}
            onChange={(e) => changeStatus(e.target.value)}
            disabled={saving}
            style={{ ...inputStyle, marginTop: 4 }}
          >
            {ENG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8' }}>Value</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>
            {engagement.status === 'won' && engagement.closed_value
              ? money(engagement.closed_value)
              : money(engagement.estimated_value)}
            {engagement.status === 'won' && engagement.closed_value && (
              <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>closed</span>
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8' }}>Package / source</div>
          <div style={{ fontSize: 13, marginTop: 6, color: '#64748B' }}>
            {engagement.package_type || <span style={{ color: '#94a3b8' }}>—</span>}
            {' · '}
            {engagement.source || <span style={{ color: '#94a3b8' }}>—</span>}
          </div>
        </div>
        <button onClick={del} style={{
          background: 'none', border: 'none', color: '#991b1b', fontSize: 12, cursor: 'pointer',
        }}>Delete</button>
      </div>

      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>
        Opened {fmtDate(engagement.opened_at)}
        {engagement.status_changed_at && ` · status changed ${fmtDate(engagement.status_changed_at)}`}
        {engagement.closed_at && ` · closed ${fmtDate(engagement.closed_at)}`}
        {engagement.lost_reason && ` · lost: ${engagement.lost_reason}`}
        {engagement.launch_activated_at && ` · launch_client ${engagement.launch_client_id}`}
      </div>
      {engagement.notes && (
        <div style={{ marginTop: 8, fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap' }}>
          {engagement.notes}
        </div>
      )}
    </div>
  );
}

function NewEngagementModal({ open, clientId, onClose, onCreated }) {
  const [form, setForm] = useState({ status: 'new', estimated_value: '', package_type: '', source: '', source_detail: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ status: 'new', estimated_value: '', package_type: '', source: '', source_detail: '', notes: '' });
      setErr('');
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setErr('');
    try {
      const payload = { client_id: clientId, status: form.status };
      if (form.estimated_value) payload.estimated_value = Number(form.estimated_value);
      if (form.package_type) payload.package_type = form.package_type;
      if (form.source) payload.source = form.source;
      if (form.source_detail) payload.source_detail = form.source_detail;
      if (form.notes) payload.notes = form.notes;
      await api.createEngagement(payload);
      onCreated();
    } catch (e) {
      setErr(e.message || 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Engagement">
      <form onSubmit={submit}>
        {err && <div style={errorStyle}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
              {ENG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Estimated value ($)">
            <input type="number" min="0" value={form.estimated_value}
              onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Package">
            <select value={form.package_type} onChange={(e) => setForm({ ...form, package_type: e.target.value })} style={inputStyle}>
              <option value="">—</option>
              {ENG_PACKAGES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Source">
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} style={inputStyle}>
              <option value="">—</option>
              {ENG_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Source detail"><input value={form.source_detail} onChange={(e) => setForm({ ...form, source_detail: e.target.value })} style={inputStyle} /></Field>
        <Field label="Notes">
          <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
        </Field>
        <div style={{ marginTop: 12 }}>
          <button type="submit" disabled={submitting} style={primaryBtnStyle}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Calls tab
// ---------------------------------------------------------------------------

function CallsTab({ clientId, clientName }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getCalls({ client_id: clientId });
      setCalls(data.calls || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clientId]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: '#64748B' }}>
          {calls.length === 0 ? 'No calls recorded yet for this client.' : `${calls.length} call${calls.length === 1 ? '' : 's'}`}
        </div>
        <Link
          to={`/calls?client=${clientId}`}
          style={{ ...primaryBtnStyle, textDecoration: 'none', display: 'inline-block' }}
        >
          Go to Calls page →
        </Link>
      </div>
      {loading ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div> : (
        calls.map((c) => (
          <div key={c.id} style={{ ...panelStyle, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Link to={`/calls/${c.id}`} style={{ color: '#1B2838', fontWeight: 600, textDecoration: 'none' }}>
                  {fmtDate(c.call_date || c.created_at)}
                </Link>
                {c.duration_minutes && <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>{c.duration_minutes} min</span>}
              </div>
              <div style={{ fontSize: 11, color: '#64748B' }}>
                {c.pushed_to_dashboard_at ? 'On Dashboard' : c.review_status || '—'}
              </div>
            </div>
            {c.notes && <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>{c.notes}</div>}
          </div>
        ))
      )}
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
        Use the Calls page to upload new call audio or transcripts — pre-fills {clientName}.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Automations tab — runnable AI workflows (proposal, etc.) + template preview
// ---------------------------------------------------------------------------

const SCRIPT_STAGES = ['working', 'proposal', 'closed_won'];

function AutomationsTab({ client, engagements }) {
  const [stage, setStage] = useState('working');
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getScripts({ stage })
      .then((d) => setScripts(d.scripts || []))
      .finally(() => setLoading(false));
  }, [stage]);

  const ctx = {
    client_name: client.name,
    company: client.name, // legacy alias
    industry: client.industry || '',
    location: client.location || '',
    type: client.type || '',
    website: client.website || '',
    contact: client.primary_contact_name || '',
    contact_name: client.primary_contact_name || '',
    email: client.email || '',
    contact_email: client.email || '',
    phone: client.phone || '',
    role: client.role || '',
    notes: client.notes || '',
  };
  const fill = (content) => content.replace(/\{(\w+)\}/g, (m, f) => ctx[f] || m);

  return (
    <div>
      <GenerateProposalPanel client={client} engagements={engagements} />

      <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em', margin: '18px 0 8px' }}>
        Template library
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {SCRIPT_STAGES.map((s) => (
          <button key={s} onClick={() => setStage(s)} style={{
            padding: '6px 14px', fontSize: 12, borderRadius: 4, border: '1px solid #E2E6EB',
            background: stage === s ? '#1B2838' : '#fff',
            color: stage === s ? '#fff' : '#64748B',
            cursor: 'pointer', fontWeight: stage === s ? 600 : 400,
          }}>{s.replace('_', ' ')}</button>
        ))}
      </div>
      {loading ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div> : (
        scripts.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13, padding: 16 }}>No templates for this stage.</div> :
          scripts.map((s) => (
            <div key={s.id} style={{ ...panelStyle, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span style={{
                  fontSize: 11, color: '#64748B', background: '#F7F8FA',
                  padding: '2px 8px', borderRadius: 3,
                }}>{s.type}</span>
              </div>
              <pre style={{
                background: '#F7F8FA', padding: 12, borderRadius: 4, fontSize: 12,
                whiteSpace: 'pre-wrap', color: '#1B2838', margin: 0, fontFamily: 'inherit',
              }}>{fill(s.content)}</pre>
            </div>
          ))
      )}
    </div>
  );
}

function GenerateProposalPanel({ client, engagements }) {
  const eligible = engagements.filter((e) => e.status === 'new' || e.status === 'working' || e.status === 'won');
  const [selected, setSelected] = useState(() => (eligible[0]?.id?.toString() || ''));
  const [job, setJob] = useState(null);          // { id, status, output, error, brand_profile_source }
  const [kicking, setKicking] = useState(false);
  const [viewer, setViewer] = useState(null);    // { markdown, brand_profile_source }
  const [error, setError] = useState('');

  useEffect(() => {
    if (!eligible.length) setSelected('');
    else if (!eligible.find((e) => e.id?.toString() === selected)) {
      setSelected(eligible[0].id.toString());
    }
    // eslint-disable-next-line
  }, [engagements]);

  // Poll while the job is running.
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const timer = setInterval(async () => {
      try {
        const res = await api.getAutomationJob(job.id);
        if (res.job.status === 'completed') {
          clearInterval(timer);
          setJob({ ...job, ...res.job });
          setViewer({ markdown: res.job.output, brand_profile_source: job.brand_profile_source });
        } else if (res.job.status === 'failed') {
          clearInterval(timer);
          setJob({ ...job, ...res.job });
          setError(res.job.error || 'Generation failed');
        }
      } catch (e) { /* will retry next tick */ }
    }, 2500);
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);

  const run = async () => {
    if (!selected) return;
    setKicking(true); setError('');
    try {
      const res = await api.runAutomation({
        automation: 'proposal',
        client_id: client.id,
        engagement_id: Number(selected),
      });
      setJob({ id: res.job_id, status: 'running', brand_profile_source: res.brand_profile_source });
    } catch (e) {
      setError(e.message || 'Failed to start generation');
    } finally {
      setKicking(false);
    }
  };

  const isRunning = job?.status === 'running';

  return (
    <>
      <div style={{ ...panelStyle, marginBottom: 12, borderLeft: '3px solid #00D4AA' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Generate Proposal</span>
              <span style={{ fontSize: 10, background: '#E6FAF5', color: '#047857', border: '1px solid #6EE7B7', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>AI</span>
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
              Uses the latest Brand Profile extraction + the selected engagement to draft a full
              proposal grounded in the discovery call.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              Engagement
            </label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={!eligible.length || isRunning}
              style={inputStyle}
            >
              {eligible.length === 0 && <option value="">No eligible engagement — add one first</option>}
              {eligible.map((e) => (
                <option key={e.id} value={e.id}>
                  #{e.id} · {e.status} · ${Number(e.estimated_value || 0).toLocaleString()}{e.package_type ? ` · ${e.package_type}` : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={run}
            disabled={!selected || kicking || isRunning}
            style={{
              ...primaryBtnStyle,
              padding: '9px 18px',
              opacity: (!selected || kicking || isRunning) ? 0.5 : 1,
              cursor: (!selected || kicking || isRunning) ? 'not-allowed' : 'pointer',
            }}
          >
            {isRunning ? 'Generating…' : kicking ? 'Starting…' : 'Generate'}
          </button>
        </div>

        {isRunning && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#64748B' }}>
            Claude is working — typically 30–60s. You can navigate away; the job will finish in the background and log to activity.
          </div>
        )}
        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', padding: '6px 10px', borderRadius: 4 }}>
            {error}
          </div>
        )}
        {job?.brand_profile_source && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
            Using brand profile from call #{job.brand_profile_source.call_recording_id}
            {job.brand_profile_source.review_status && ` (${job.brand_profile_source.review_status})`}
          </div>
        )}
        {!eligible.length && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
            Add an engagement above to enable this automation.
          </div>
        )}
      </div>

      {viewer && (
        <OutputViewer
          title="Proposal draft"
          markdown={viewer.markdown}
          client={client}
          brandSource={viewer.brand_profile_source}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}

function OutputViewer({ title, markdown, client, brandSource, onClose }) {
  const [copied, setCopied] = useState(false);
  const htmlBody = useMemo(() => markdownToHtml(markdown || ''), [markdown]);
  const baseName = `${(client?.name || 'proposal').replace(/[^a-z0-9]+/gi, '_')}_proposal_${new Date().toISOString().slice(0, 10)}`;

  const copy = async () => {
    try {
      await copyToClipboard(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { /* ignore */ }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 10, width: 'min(920px, 100%)',
          maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column',
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E6EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
            {brandSource && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                Grounded in brand profile from call #{brandSource.call_recording_id}
                {brandSource.completion_percent != null && ` · ${brandSource.completion_percent}% complete`}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748B' }}>×</button>
        </div>

        <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1, lineHeight: 1.6, color: '#1B2838' }}
             dangerouslySetInnerHTML={{ __html: htmlBody }} />

        <div style={{ padding: '12px 20px', borderTop: '1px solid #E2E6EB', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={copy} style={secondaryBtnStyle}>
            {copied ? '✓ Copied' : 'Copy markdown'}
          </button>
          <button onClick={() => downloadAsMarkdown(markdown, baseName)} style={secondaryBtnStyle}>
            Download .md
          </button>
          <button onClick={() => downloadMarkdownAsDocx(markdown, baseName)} style={primaryBtnStyle}>
            Download .docx
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity tab
// ---------------------------------------------------------------------------

function ActivityTab({ clientId }) {
  const [activities, setActivities] = useState([]);
  const [noteContent, setNoteContent] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await api.getClientActivities(clientId);
      setActivities(data.activities || []);
    } catch (e) { /* ignore */ }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clientId]);

  const addNote = async (e) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSaving(true);
    try {
      await api.createActivity({ client_id: clientId, type: 'note', content: noteContent.trim() });
      setNoteContent('');
      load();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <form onSubmit={addNote} style={{ ...panelStyle, marginBottom: 16 }}>
        <PanelTitle>Add note</PanelTitle>
        <textarea
          rows={3}
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="What happened? What did you learn?"
          style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
        />
        <div style={{ marginTop: 8 }}>
          <button type="submit" disabled={saving || !noteContent.trim()} style={primaryBtnStyle}>
            {saving ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </form>

      {activities.length === 0 && (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: 16, textAlign: 'center' }}>
          No activity yet.
        </div>
      )}

      {activities.map((a) => <ActivityItem key={a.id} activity={a} />)}
    </div>
  );
}

function ActivityItem({ activity }) {
  const toneMap = {
    note: '#1B2838',
    call: '#00D4AA',
    email: '#00D4AA',
    meeting: '#A16207',
    status_change: '#0369a1',
    system: '#64748B',
  };
  return (
    <div style={{ ...panelStyle, marginBottom: 8, padding: '10px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{
          fontSize: 10, textTransform: 'uppercase', fontWeight: 600,
          color: toneMap[activity.type] || '#64748B', letterSpacing: '0.04em',
        }}>{activity.type.replace('_', ' ')}</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDateTime(activity.created_at)}</span>
      </div>
      {activity.content && (
        <div style={{ fontSize: 13, color: '#1B2838', whiteSpace: 'pre-wrap' }}>{activity.content}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const panelStyle = {
  background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16,
};

function PanelTitle({ children }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 12, color: '#64748B', display: 'block', marginBottom: 4, fontWeight: 500 }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
  borderRadius: 4, fontSize: 13, boxSizing: 'border-box', background: '#fff',
};

const primaryBtnStyle = {
  background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
  padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
};

const secondaryBtnStyle = {
  background: '#fff', color: '#1B2838', border: '1px solid #E2E6EB', borderRadius: 4,
  padding: '8px 12px', fontSize: 13, cursor: 'pointer',
};

const errorStyle = {
  background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
  padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 12,
};
