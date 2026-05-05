'use client';

// Minimal create-client form. Only `name` is required; everything else
// optional. POSTs to /api/clients on submit.

import { useState, FormEvent } from 'react';
import Modal from './Modal';
import { api } from '@/lib/api';

interface FormState {
  name: string;
  website: string;
  industry: string;
  location: string;
  type: string;
  primary_contact_name: string;
  email: string;
  phone: string;
  role: string;
  notes: string;
}

const initial = (): FormState => ({
  name: '', website: '', industry: '', location: '', type: '',
  primary_contact_name: '', email: '', phone: '', role: '', notes: '',
});

export default function NewClientModal({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (client: any) => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    if (submitting) return;
    setForm(initial());
    setError('');
    onClose();
  };

  const setField = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setError(''); setSubmitting(true);
    try {
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v && String(v).trim()) payload[k] = String(v).trim();
      }
      const { client } = await api.post<{ client: any }>('/api/clients', payload);
      setForm(initial());
      onCreated(client);
    } catch (err: any) {
      setError(err.message || 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Client" width={520}>
      {error && <div style={errorBox}>{error}</div>}
      <form onSubmit={submit}>
        <Field label="Name" required>
          <input style={input} value={form.name} onChange={setField('name')} required />
        </Field>
        <Row>
          <Field label="Website">
            <input style={input} value={form.website} onChange={setField('website')} placeholder="https://..." />
          </Field>
          <Field label="Industry">
            <input style={input} value={form.industry} onChange={setField('industry')} />
          </Field>
        </Row>
        <Row>
          <Field label="Location">
            <input style={input} value={form.location} onChange={setField('location')} placeholder="City, State" />
          </Field>
          <Field label="Type">
            <select style={input} value={form.type} onChange={setField('type')}>
              <option value="">—</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>
          </Field>
        </Row>
        <hr style={hr} />
        <Field label="Primary contact name">
          <input style={input} value={form.primary_contact_name} onChange={setField('primary_contact_name')} />
        </Field>
        <Row>
          <Field label="Email">
            <input style={input} type="email" value={form.email} onChange={setField('email')} />
          </Field>
          <Field label="Phone">
            <input style={input} value={form.phone} onChange={setField('phone')} />
          </Field>
        </Row>
        <Field label="Role">
          <input style={input} value={form.role} onChange={setField('role')} placeholder="Owner, Marketing Manager, ..." />
        </Field>
        <Field label="Notes">
          <textarea
            style={{ ...input, minHeight: 60, resize: 'vertical' }}
            value={form.notes} onChange={setField('notes')}
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={handleClose} disabled={submitting} style={secondary}>Cancel</button>
          <button type="submit" disabled={submitting || !form.name.trim()} style={primary(submitting || !form.name.trim())}>
            {submitting ? 'Creating…' : 'Create client'}
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
const hr: React.CSSProperties = { border: 'none', borderTop: '1px solid #F0F2F5', margin: '14px 0' };
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
