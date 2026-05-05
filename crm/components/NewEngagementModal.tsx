'use client';

// New Engagement modal — minimal create form. Required: client_id.
// Defaults to status='new'; everything else optional.

import { useState, FormEvent } from 'react';
import Modal from './Modal';
import { api } from '@/lib/api';

export default function NewEngagementModal({
  open, onClose, onCreated, clients, defaultClientId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (eng: any) => void;
  clients: Array<{ id: number; name: string }>;
  defaultClientId?: number;
}) {
  const [clientId, setClientId] = useState<string>(defaultClientId ? String(defaultClientId) : '');
  const [packageType, setPackageType] = useState('');
  const [source, setSource] = useState('');
  const [sourceDetail, setSourceDetail] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    if (submitting) return;
    setClientId(defaultClientId ? String(defaultClientId) : '');
    setPackageType(''); setSource(''); setSourceDetail('');
    setEstimatedValue(''); setNotes(''); setError('');
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) { setError('Pick a client'); return; }
    setError(''); setSubmitting(true);
    try {
      const { engagement } = await api.post<{ engagement: any }>('/api/engagements', {
        client_id: Number(clientId),
        package_type: packageType || null,
        source: source || null,
        source_detail: sourceDetail || null,
        estimated_value: estimatedValue ? Number(estimatedValue) : 0,
        notes: notes || null,
      });
      onCreated(engagement);
    } catch (err: any) {
      setError(err.message || 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Engagement" width={480}>
      {error && <div style={errorBox}>{error}</div>}
      <form onSubmit={submit}>
        <Field label="Client" required>
          <select style={input} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">— select client —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Row>
          <Field label="Package">
            <select style={input} value={packageType} onChange={(e) => setPackageType(e.target.value)}>
              <option value="">—</option>
              <option value="boost">Boost</option>
              <option value="launch">Launch</option>
              <option value="both">Both</option>
              <option value="undecided">Undecided</option>
            </select>
          </Field>
          <Field label="Estimated value">
            <input type="number" style={input} value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="0" />
          </Field>
        </Row>
        <Row>
          <Field label="Source">
            <select style={input} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">—</option>
              <option value="referral">Referral</option>
              <option value="cold">Cold</option>
              <option value="web">Web</option>
              <option value="content">Content</option>
              <option value="paid_ads">Paid ads</option>
            </select>
          </Field>
          <Field label="Source detail">
            <input style={input} value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} placeholder="e.g. LinkedIn intro from..." />
          </Field>
        </Row>
        <Field label="Notes">
          <textarea
            style={{ ...input, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
            value={notes} onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={handleClose} disabled={submitting} style={secondary}>Cancel</button>
          <button type="submit" disabled={submitting || !clientId} style={primary(submitting || !clientId)}>
            {submitting ? 'Creating…' : 'Create engagement'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>;
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
  borderRadius: 4, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
};
const errorBox: React.CSSProperties = {
  background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991b1b',
  padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 12,
};
const primary = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 16px', background: '#00D4AA', color: '#1B2838', border: 'none',
  borderRadius: 4, fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const secondary: React.CSSProperties = {
  padding: '8px 16px', background: '#fff', color: '#1B2838',
  border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
};
