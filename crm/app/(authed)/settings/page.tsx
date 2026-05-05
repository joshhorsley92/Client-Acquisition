'use client';

// Settings page (admin-only). Three tabs: ICP editor, Users, Audit log.
// Members get a "Settings are admin-only" message.

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Tab = 'icp' | 'users' | 'audit';

export default function SettingsPage() {
  const [me, setMe] = useState<{ role?: string } | null>(null);
  const [tab, setTab] = useState<Tab>('icp');

  useEffect(() => {
    api.get<{ user: any }>('/api/auth/me')
      .then((d) => setMe(d.user))
      .catch(() => setMe({}));
  }, []);

  if (!me) return <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>;
  if (me.role !== 'admin') {
    return (
      <div>
        <h1 style={h1}>Settings</h1>
        <div style={{
          background: '#fff', padding: 24, borderRadius: 8, border: '1px solid #E2E6EB',
          fontSize: 13, color: '#64748B',
        }}>
          Settings are admin-only. Ask Joe or Josh if you need something changed here.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={h1}>Settings</h1>
      <nav style={tabBar}>
        <button onClick={() => setTab('icp')} style={tabBtn(tab === 'icp')}>ICP</button>
        <button onClick={() => setTab('users')} style={tabBtn(tab === 'users')}>Users</button>
        <button onClick={() => setTab('audit')} style={tabBtn(tab === 'audit')}>Audit log</button>
      </nav>
      {tab === 'icp' && <IcpTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

// ----- ICP -----
function IcpTab() {
  const [icp, setIcp] = useState<any>(null);
  const [json, setJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get<any>('/api/settings/icp')
      .then((d) => { setIcp(d); setJson(JSON.stringify(d, null, 2)); })
      .catch((err) => setMsg(`Error: ${err.message}`));
  }, []);

  async function save() {
    setSaving(true); setMsg('');
    try {
      const parsed = JSON.parse(json);
      const updated = await api.patch('/api/settings/icp', parsed); // PUT? backend uses PUT — adjust
      setIcp(updated); setMsg('Saved.');
      setTimeout(() => setMsg(''), 2000);
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }
  // Backend uses PUT /api/settings/icp; the PATCH above is wrong. Use raw fetch.
  async function savePut() {
    setSaving(true); setMsg('');
    try {
      const parsed = JSON.parse(json);
      const res = await fetch('/api/settings/icp', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed), credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Status ${res.status}`);
      setIcp(data); setMsg('Saved.');
      setTimeout(() => setMsg(''), 2000);
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally { setSaving(false); }
  }

  if (!icp) return <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>;

  return (
    <div style={panel}>
      <p style={{ fontSize: 13, color: '#64748B', marginTop: 0 }}>
        Edit the Ideal Customer Profile JSON. Scoring weights must sum to 100; revenue min must be less than max.
      </p>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={28}
        spellCheck={false}
        style={{
          width: '100%', padding: 12, border: '1px solid #E2E6EB',
          borderRadius: 4, fontSize: 12, fontFamily: 'monospace',
          boxSizing: 'border-box', resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button onClick={savePut} disabled={saving} style={primaryBtn(saving)}>
          {saving ? 'Saving…' : 'Save ICP'}
        </button>
        {msg && <span style={{ fontSize: 12, color: msg.startsWith('Error') ? '#dc2626' : '#047857' }}>{msg}</span>}
      </div>
    </div>
  );
}

// ----- Users -----
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState<string>('');

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ users: any[] }>('/api/settings/users');
      setUsers(data.users || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function deleteUser(id: string) {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    await api.del(`/api/settings/users/${id}`);
    void load();
  }

  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Users</h2>
        <button onClick={() => setShowNew(true)} style={primaryBtn(false)}>+ New user</button>
      </div>
      {loading ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={th}>Name</th><th style={th}>Email</th><th style={th}>Role</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid #F0F2F5' }}>
                <td style={td}>{u.name}</td>
                <td style={td}>{u.email}</td>
                <td style={td}>{u.role}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => deleteUser(u.id)} style={dangerBtn}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showNew && (
        <NewUserForm
          onClose={() => setShowNew(false)}
          onCreated={(link) => { setRecoveryLink(link); setShowNew(false); void load(); }}
        />
      )}
      {recoveryLink && (
        <div style={{ marginTop: 16, padding: 12, background: '#E6FAF5', borderRadius: 6, border: '1px solid #6EE7B7' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#047857', marginBottom: 6 }}>
            Send this recovery link to the new user — it expires in ~1 hour:
          </div>
          <div style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', color: '#064e3b' }}>
            {recoveryLink}
          </div>
          <button onClick={() => setRecoveryLink('')} style={{ marginTop: 8, ...secondaryBtn, fontSize: 11, padding: '4px 10px' }}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function NewUserForm({ onClose, onCreated }: { onClose: () => void; onCreated: (link: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError('');
    try {
      const data = await api.post<{ user: any; recovery_link: string }>('/api/settings/users', { name, email, role });
      onCreated(data.recovery_link);
    } catch (err: any) {
      setError(err.message || 'Failed to create');
    } finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 16, padding: 12, background: '#F7F8FA', borderRadius: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto', gap: 8, alignItems: 'flex-end' }}>
        <Field label="Name"><input style={input} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Email"><input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Role">
          <select style={input} value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button type="submit" disabled={submitting} style={primaryBtn(submitting)}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
      {error && <div style={{ ...errorBox, marginTop: 8 }}>{error}</div>}
    </form>
  );
}

// ----- Audit log -----
function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    api.get<{ logs: any[]; total: number }>(`/api/settings/audit-log?page=${page}&limit=50`)
      .then((d) => { setLogs(d.logs || []); setTotal(d.total || 0); })
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Audit log ({total})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={secondaryBtn}>Prev</button>
          <span style={{ fontSize: 13, color: '#64748B', alignSelf: 'center' }}>Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={logs.length < 50} style={secondaryBtn}>Next</button>
        </div>
      </div>
      {loading ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={th}>Time</th><th style={th}>User</th><th style={th}>Action</th><th style={th}>Resource</th><th style={th}>IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} style={{ borderTop: '1px solid #F0F2F5' }}>
                <td style={td}>{new Date(l.created_at).toLocaleString()}</td>
                <td style={td}>{l.user_name || l.user_email || <span style={{ color: '#94a3b8' }}>system</span>}</td>
                <td style={td}>{l.action}</td>
                <td style={td}>{l.resource_type ? `${l.resource_type}#${l.resource_id || '—'}` : ''}</td>
                <td style={td}>{l.ip_address || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#64748B', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, margin: '0 0 16px 0' };
const tabBar: React.CSSProperties = { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #E2E6EB' };
const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '10px 16px', fontSize: 13, fontWeight: active ? 600 : 400,
  background: 'none', border: 'none', cursor: 'pointer',
  color: active ? '#1B2838' : '#64748B',
  borderBottom: active ? '2px solid #00D4AA' : '2px solid transparent',
});
const panel: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #E2E6EB',
};
const input: React.CSSProperties = {
  width: '100%', padding: '6px 10px', border: '1px solid #E2E6EB',
  borderRadius: 4, fontSize: 13, boxSizing: 'border-box',
};
const th: React.CSSProperties = { padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '6px 10px', color: '#1B2838' };
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '6px 14px', background: '#00D4AA', color: '#1B2838', border: 'none',
  borderRadius: 4, fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const secondaryBtn: React.CSSProperties = {
  padding: '6px 14px', background: '#fff', color: '#1B2838',
  border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const dangerBtn: React.CSSProperties = {
  padding: '4px 10px', background: '#fff', color: '#dc2626',
  border: '1px solid #FCA5A5', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const errorBox: React.CSSProperties = {
  background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991b1b',
  padding: '8px 12px', borderRadius: 4, fontSize: 12,
};
