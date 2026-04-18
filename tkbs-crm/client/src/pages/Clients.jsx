import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import Modal from '../components/Modal';

const STATUS_TABS = [
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
];

const money = (n) => '$' + Number(n || 0).toLocaleString();

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts.includes && ts.includes('T') ? ts : String(ts).replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString();
}

function EnrichmentBadge({ status }) {
  if (!status || status === 'none') return null;
  const tone =
    status === 'running' ? { bg: '#FFF8E6', color: '#A16207', border: '#FCD34D', label: 'Enriching…' }
    : status === 'succeeded' ? { bg: '#E6FAF5', color: '#047857', border: '#6EE7B7', label: 'Enriched' }
    : { bg: '#FEF2F2', color: '#991b1b', border: '#FCA5A5', label: 'Enrichment failed' };
  return (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 600,
      background: tone.bg, color: tone.color, border: `1px solid ${tone.border}`,
      marginLeft: 8, whiteSpace: 'nowrap',
    }}>
      {tone.label}
    </span>
  );
}

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(SORT_OPTIONS[0]);
  const [showNew, setShowNew] = useState(false);

  // Debounce the search box
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await api.getClients({
        status: status || undefined,
        search: search || undefined,
        sort_by: sort.key,
        sort_dir: sort.dir,
      });
      setClients(data.clients || []);
    } catch (e) {
      setErr(e.message || 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, search, sort]);

  // Poll every 5s if any client is mid-enrichment.
  const anyRunning = useMemo(
    () => clients.some((c) => c.enrichment_status === 'running'),
    [clients],
  );
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [anyRunning, status, search, sort]);

  const changeSort = (opt) => setSort(opt);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Clients</h1>
        <button
          onClick={() => setShowNew(true)}
          style={{
            background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          + New Client
        </button>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.key || 'all'}
            onClick={() => setStatus(t.key)}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 4, border: '1px solid #E2E6EB',
              background: status === t.key ? '#1B2838' : '#fff',
              color: status === t.key ? '#fff' : '#64748B',
              cursor: 'pointer', fontWeight: status === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + sort controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name, email, contact, or website…"
          style={{
            flex: 1, padding: '8px 12px', border: '1px solid #E2E6EB', borderRadius: 4,
            fontSize: 13,
          }}
        />
        <select
          value={sort.key}
          onChange={(e) => {
            const opt = SORT_OPTIONS.find((o) => o.key === e.target.value);
            if (opt) changeSort(opt);
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
        <div style={{
          padding: 12, marginBottom: 16,
          background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
          borderRadius: 6, fontSize: 13,
        }}>{err}</div>
      )}

      {loading && clients.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading…</div>
      )}

      {!loading && clients.length === 0 && (
        <div style={{
          background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 40,
          textAlign: 'center', fontSize: 14, color: '#64748B',
        }}>
          No clients match {search || status ? 'those filters.' : 'yet — click + New Client to add one.'}
        </div>
      )}

      {clients.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1B2838', color: '#fff' }}>
                <Th>Name</Th>
                <Th>Primary contact</Th>
                <Th>Industry</Th>
                <Th align="right">Open</Th>
                <Th align="right">Won</Th>
                <Th align="right">Lifetime</Th>
                <Th align="right">Fit</Th>
                <Th>Last activity</Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#F7F8FA' }}>
                  <td style={cellStyle}>
                    <Link to={`/clients/${c.id}`} style={{ color: '#1B2838', textDecoration: 'none', fontWeight: 600 }}>
                      {c.name}
                    </Link>
                    <EnrichmentBadge status={c.enrichment_status} />
                  </td>
                  <td style={cellStyle}>
                    {c.primary_contact_name ? (
                      <div>
                        <div>{c.primary_contact_name}</div>
                        {c.email && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.email}</div>}
                      </div>
                    ) : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ ...cellStyle, color: '#64748B' }}>{c.industry || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{c.open_engagements}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{c.won_engagements}</td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>
                    {c.lifetime_revenue > 0 ? money(c.lifetime_revenue) : <span style={{ color: '#94a3b8', fontWeight: 400 }}>$0</span>}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: '#64748B' }}>
                    {c.fit_score != null ? c.fit_score : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ ...cellStyle, color: '#64748B' }}>{fmtDate(c.last_activity_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewClientModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); load(); }}
      />
    </div>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{ padding: '10px 14px', textAlign: align, fontWeight: 600, fontSize: 12 }}>
      {children}
    </th>
  );
}

const cellStyle = { padding: '10px 14px', verticalAlign: 'top' };

function NewClientModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(initialForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setForm(initialForm()); setError(''); }
  }, [open]);

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const payload = {};
      for (const [k, v] of Object.entries(form)) {
        if (v !== '' && v != null) payload[k] = v;
      }
      await api.createClient(payload);
      onCreated();
    } catch (err) {
      setError(err.message || 'Failed to create client');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Client">
      <form onSubmit={submit}>
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
            padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 12,
          }}>{error}</div>
        )}

        <Field label="Name" required>
          <input required value={form.name} onChange={update('name')} style={inputStyle} autoFocus />
        </Field>

        <Field
          label="Website"
          hint="Paste a URL to auto-enrich emails + social links + signals in the background."
        >
          <input value={form.website} onChange={update('website')} placeholder="https://example.com" style={inputStyle} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Industry">
            <input value={form.industry} onChange={update('industry')} style={inputStyle} />
          </Field>
          <Field label="Location">
            <input value={form.location} onChange={update('location')} style={inputStyle} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Type">
            <select value={form.type} onChange={update('type')} style={inputStyle}>
              <option value="">—</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>
          </Field>
          <Field label="Preferred contact">
            <select value={form.preferred_contact} onChange={update('preferred_contact')} style={inputStyle}>
              <option value="">—</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="text">Text</option>
              <option value="linkedin">LinkedIn</option>
            </select>
          </Field>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #E2E6EB', margin: '12px 0' }} />

        <Field label="Primary contact name">
          <input value={form.primary_contact_name} onChange={update('primary_contact_name')} style={inputStyle} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Email">
            <input type="email" value={form.email} onChange={update('email')} style={inputStyle} />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={update('phone')} style={inputStyle} />
          </Field>
        </div>

        <Field label="Role">
          <input value={form.role} onChange={update('role')} placeholder="Owner, Marketing Director…" style={inputStyle} />
        </Field>

        <Field label="Notes">
          <textarea rows={3} value={form.notes} onChange={update('notes')}
            style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '10px 20px', background: '#00D4AA', color: '#1B2838',
              border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Creating…' : 'Create Client'}
          </button>
          <button
            type="button" onClick={onClose} disabled={submitting}
            style={{
              padding: '10px 16px', background: '#fff', color: '#1B2838',
              border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14, fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 12, color: '#64748B', display: 'block', marginBottom: 4, fontWeight: 500 }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
  borderRadius: 4, fontSize: 13, boxSizing: 'border-box',
};

function initialForm() {
  return {
    name: '', website: '', industry: '', location: '', type: '',
    primary_contact_name: '', email: '', phone: '', role: '',
    preferred_contact: '', notes: '',
  };
}
