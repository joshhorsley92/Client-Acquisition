'use client';

// Settings page (admin-only). Three tabs: ICP editor, Users, Audit log.
// Members get a "Settings are admin-only" message.

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import { Spinner } from '@/components/Skeleton';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  Field, Input, Select, ErrorBox, PrimaryButton, SecondaryButton, DangerButton,
} from '@/components/ui/Forms';
import { UserCreateSchema, type UserCreateInput } from '@/lib/schemas';
import { cn } from '@/lib/cn';

type Tab = 'icp' | 'users' | 'audit';

export default function SettingsPage() {
  const [me, setMe] = useState<{ role?: string } | null>(null);
  const [tab, setTab] = useState<Tab>('icp');

  useEffect(() => {
    api.get<{ user: any }>('/api/auth/me')
      .then((d) => setMe(d.user))
      .catch(() => setMe({}));
  }, []);

  if (!me) {
    return (
      <div className="text-ink-faint text-[13px] flex items-center gap-2">
        <Spinner /> Loading…
      </div>
    );
  }
  if (me.role !== 'admin') {
    return (
      <div>
        <h1 className="text-2xl font-bold m-0 mb-4">Settings</h1>
        <div className="bg-surface p-6 rounded-lg border border-edge text-[13px] text-ink-muted">
          Settings are admin-only. Ask Joe or Josh if you need something changed here.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold m-0 mb-4">Settings</h1>
      <nav className="flex gap-1 mb-5 border-b border-edge">
        <TabButton active={tab === 'icp'} onClick={() => setTab('icp')}>ICP</TabButton>
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}>Users</TabButton>
        <TabButton active={tab === 'audit'} onClick={() => setTab('audit')}>Audit log</TabButton>
      </nav>
      {tab === 'icp' && <IcpTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2.5 text-[13px] bg-transparent border-none cursor-pointer border-b-2 transition-colors',
        active
          ? 'text-ink font-semibold border-b-brand-mint'
          : 'text-ink-muted font-normal border-b-transparent hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

const panelClass = 'bg-surface rounded-lg p-4 border border-edge';

// ============================================================================
// ICP tab
// ============================================================================
function IcpTab() {
  const [icp, setIcp] = useState<any>(null);
  const [json, setJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api.get<any>('/api/settings/icp')
      .then((d) => { setIcp(d); setJson(JSON.stringify(d, null, 2)); })
      .catch((err) => setLoadError(humanizeError(err, 'Failed to load ICP.')));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const parsed = JSON.parse(json);
      const res = await fetch('/api/settings/icp', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed), credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Status ${res.status}`);
      setIcp(data);
      toast.success('ICP saved.');
    } catch (err: unknown) {
      toast.error(humanizeError(err, 'Failed to save ICP.'));
    } finally { setSaving(false); }
  }

  if (loadError) {
    return <div className={panelClass}><ErrorBox>{loadError}</ErrorBox></div>;
  }
  if (!icp) {
    return (
      <div className="text-ink-faint text-[13px] flex items-center gap-2">
        <Spinner /> Loading ICP…
      </div>
    );
  }

  return (
    <div className={panelClass}>
      <p className="text-[13px] text-ink-muted mt-0">
        Edit the Ideal Customer Profile JSON. Scoring weights must sum to 100; revenue min must be less than max.
      </p>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={28}
        spellCheck={false}
        className="w-full p-3 border border-edge rounded text-xs font-mono resize-y bg-surface focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none"
      />
      <div className="flex items-center gap-3 mt-3">
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save ICP'}
        </PrimaryButton>
      </div>
    </div>
  );
}

// ============================================================================
// Users tab
// ============================================================================
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ users: any[] }>('/api/settings/users');
      setUsers(data.users || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function performDelete() {
    if (!confirmDelete) return;
    try {
      await api.del(`/api/settings/users/${confirmDelete.id}`);
      toast.success(`Deleted ${confirmDelete.name || 'user'}.`);
      setConfirmDelete(null);
      void load();
    } catch (err: unknown) {
      toast.error(humanizeError(err, 'Failed to delete user.'));
      setConfirmDelete(null);
    }
  }

  return (
    <div className={panelClass}>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-bold m-0">Users</h2>
        <PrimaryButton onClick={() => setShowNew(true)}>+ New user</PrimaryButton>
      </div>
      {loading ? (
        <div className="text-ink-faint text-[13px] flex items-center gap-2">
          <Spinner /> Loading users…
        </div>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left">
              <Th>Name</Th><Th>Email</Th><Th>Role</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-surface-alt">
                <Td>{u.name}</Td>
                <Td>{u.email}</Td>
                <Td className="capitalize">{u.role}</Td>
                <Td className="text-right">
                  <DangerButton onClick={() => setConfirmDelete({ id: u.id, name: u.name || u.email })}>
                    Delete
                  </DangerButton>
                </Td>
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
        <div className="mt-4 p-3 bg-success-bg rounded-md border border-success-border">
          <div className="text-xs font-semibold text-success mb-1.5">
            Send this recovery link to the new user — it expires in ~1 hour:
          </div>
          <div className="text-[11px] font-mono break-all text-success">
            {recoveryLink}
          </div>
          <div className="flex gap-1.5 mt-2">
            <SecondaryButton
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(recoveryLink);
                  toast.success('Recovery link copied.');
                } catch {
                  toast.error('Could not copy. Select the link manually.');
                }
              }}
              className="text-[11px] px-2.5 py-1"
            >
              Copy link
            </SecondaryButton>
            <SecondaryButton
              onClick={() => setRecoveryLink('')}
              className="text-[11px] px-2.5 py-1"
            >
              Dismiss
            </SecondaryButton>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete user?"
        body={confirmDelete && (
          <span>
            This will permanently remove <strong>{confirmDelete.name}</strong> and revoke their access.
            This cannot be undone.
          </span>
        )}
        confirmLabel="Delete user"
        tone="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={performDelete}
      />
    </div>
  );
}

function NewUserForm({ onClose, onCreated }: { onClose: () => void; onCreated: (link: string) => void }) {
  const {
    register, handleSubmit, formState: { errors, isSubmitting },
    setError,
  } = useForm<UserCreateInput>({
    resolver: zodResolver(UserCreateSchema),
    defaultValues: { role: 'member' },
  });

  const onSubmit = handleSubmit(async (data) => {
    try {
      const res = await api.post<{ user: any; recovery_link: string }>('/api/settings/users', data);
      toast.success(`Created ${data.name}. Send them the recovery link to set a password.`);
      onCreated(res.recovery_link);
    } catch (err: unknown) {
      const message = humanizeError(err, 'Failed to create user.');
      setError('root', { message });
      toast.error(message);
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-4 p-3 bg-surface-page rounded-md">
      <div className="grid gap-2 items-end" style={{ gridTemplateColumns: '1fr 1fr 120px auto' }}>
        <Field label="Name" required error={errors.name?.message}>
          <Input {...register('name')} aria-invalid={errors.name ? 'true' : 'false'} />
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          <Input type="email" {...register('email')} aria-invalid={errors.email ? 'true' : 'false'} />
        </Field>
        <Field label="Role">
          <Select {...register('role')}>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </Select>
        </Field>
        <div className="flex gap-1.5">
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create'}
          </PrimaryButton>
        </div>
      </div>
      {errors.root?.message && <div className="mt-2"><ErrorBox>{errors.root.message}</ErrorBox></div>}
    </form>
  );
}

// ============================================================================
// Audit log tab
// ============================================================================
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
    <div className={panelClass}>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-bold m-0">Audit log ({total})</h2>
        <div className="flex gap-2 items-center">
          <SecondaryButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Prev
          </SecondaryButton>
          <span className="text-[13px] text-ink-muted">Page {page}</span>
          <SecondaryButton onClick={() => setPage((p) => p + 1)} disabled={logs.length < 50}>
            Next
          </SecondaryButton>
        </div>
      </div>
      {loading ? (
        <div className="text-ink-faint text-[13px] flex items-center gap-2">
          <Spinner /> Loading audit log…
        </div>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-left">
              <Th>Time</Th><Th>User</Th><Th>Action</Th><Th>Resource</Th><Th>IP</Th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-surface-alt">
                <Td>{new Date(l.created_at).toLocaleString()}</Td>
                <Td>{l.user_name || l.user_email || <span className="text-ink-faint">system</span>}</Td>
                <Td>{l.action}</Td>
                <Td>{l.resource_type ? `${l.resource_type}#${l.resource_id || '—'}` : ''}</Td>
                <Td>{l.ip_address || ''}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('px-2.5 py-1.5 text-ink', className)}>{children}</td>;
}
