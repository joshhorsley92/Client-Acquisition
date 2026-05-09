'use client';

// Multi-contact list editor for a single client. Each contact is one card
// with inline-editable name, email, phone, role, preferred contact, and
// notes; auto-saves on blur. A "Star" toggle marks the primary (one per
// client). "+ Add contact" appends a new row; trash removes one.
//
// Mounted on /clients/[id] in place of the legacy single-contact form
// fields. The server-side API keeps the legacy primary fields on
// crm.clients in sync with whichever row is is_primary, so downstream
// consumers (proposal generator, scrub-website, import-clients) keep
// working without changes.

import { useEffect, useState } from 'react';
import { Plus, Star, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import { cn } from '@/lib/cn';

export interface ClientContact {
  id: number;
  client_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  preferred_contact: 'email' | 'phone' | 'text' | 'linkedin' | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const PREFERRED_OPTIONS: Array<{ value: '' | ClientContact['preferred_contact']; label: string }> = [
  { value: '', label: '—' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'text', label: 'Text' },
  { value: 'linkedin', label: 'LinkedIn' },
];

export default function ContactsPanel({
  clientId,
  initialContacts,
  onChange,
}: {
  clientId: number;
  initialContacts?: ClientContact[];
  onChange?: (contacts: ClientContact[]) => void;
}) {
  const [contacts, setContacts] = useState<ClientContact[]>(initialContacts ?? []);
  const [loading, setLoading] = useState(initialContacts === undefined);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (initialContacts !== undefined) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function emit(next: ClientContact[]) {
    setContacts(next);
    onChange?.(next);
  }

  async function load() {
    setLoading(true);
    try {
      const { contacts: rows } = await api.get<{ contacts: ClientContact[] }>(
        `/api/clients/${clientId}/contacts`,
      );
      emit(rows || []);
    } catch (err: unknown) {
      toast.error(humanizeError(err, 'Failed to load contacts.'));
    } finally {
      setLoading(false);
    }
  }

  async function addContact() {
    setAdding(true);
    try {
      const isFirst = contacts.length === 0;
      const { contact } = await api.post<{ contact: ClientContact }>(
        `/api/clients/${clientId}/contacts`,
        { name: 'New contact', is_primary: isFirst },
      );
      emit([...contacts, contact]);
    } catch (err: unknown) {
      toast.error(humanizeError(err, 'Failed to add contact.'));
    } finally {
      setAdding(false);
    }
  }

  async function patchContact(id: number, updates: Partial<ClientContact>): Promise<boolean> {
    try {
      const { contact } = await api.patch<{ contact: ClientContact }>(
        `/api/clients/${clientId}/contacts/${id}`,
        updates,
      );
      // If this contact became primary, demote any other primary in local
      // state — the server already did that, we just mirror it.
      emit(contacts.map((c) => {
        if (c.id === contact.id) return contact;
        if (contact.is_primary && c.is_primary && c.id !== contact.id) return { ...c, is_primary: false };
        return c;
      }));
      return true;
    } catch (err: unknown) {
      toast.error(humanizeError(err, 'Failed to save contact.'));
      return false;
    }
  }

  async function removeContact(id: number) {
    try {
      await api.del(`/api/clients/${clientId}/contacts/${id}`);
      emit(contacts.filter((c) => c.id !== id));
    } catch (err: unknown) {
      toast.error(humanizeError(err, 'Failed to delete contact.'));
    }
  }

  if (loading) {
    return (
      <div className="text-[13px] text-ink-faint">Loading contacts…</div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {contacts.length === 0 ? (
        <div className="text-[13px] text-ink-faint">No contacts yet — add one below.</div>
      ) : (
        contacts.map((c) => (
          <ContactCard
            key={c.id}
            contact={c}
            canDelete={contacts.length > 1 || !c.is_primary}
            onChange={(updates) => patchContact(c.id, updates)}
            onSetPrimary={() => patchContact(c.id, { is_primary: true })}
            onDelete={() => removeContact(c.id)}
          />
        ))
      )}

      <div>
        <button
          type="button"
          onClick={addContact}
          disabled={adding}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface text-ink border border-edge rounded text-xs font-semibold hover:bg-surface-alt disabled:opacity-60"
        >
          <Plus size={13} /> {adding ? 'Adding…' : 'Add contact'}
        </button>
      </div>
    </div>
  );
}

function ContactCard({
  contact, canDelete, onChange, onSetPrimary, onDelete,
}: {
  contact: ClientContact;
  canDelete: boolean;
  onChange: (updates: Partial<ClientContact>) => Promise<boolean>;
  onSetPrimary: () => Promise<boolean>;
  onDelete: () => Promise<void>;
}) {
  return (
    <div className="border border-edge rounded-md p-3 bg-surface">
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => { if (!contact.is_primary) void onSetPrimary(); }}
          title={contact.is_primary ? 'Primary contact' : 'Set as primary'}
          className={cn(
            'p-1 rounded transition-colors',
            contact.is_primary
              ? 'text-warning'
              : 'text-ink-faint hover:text-warning hover:bg-surface-page',
          )}
          aria-label={contact.is_primary ? 'Primary contact' : 'Set as primary'}
        >
          <Star size={14} fill={contact.is_primary ? 'currentColor' : 'none'} />
        </button>
        <InlineField
          value={contact.name}
          onCommit={(v) => onChange({ name: (v || '').trim() || contact.name })}
          placeholder="Contact name"
          className="flex-1 text-[14px] font-semibold"
        />
        {contact.is_primary && (
          <span className="text-[10px] uppercase tracking-wider text-warning font-bold">primary</span>
        )}
        <button
          type="button"
          onClick={() => { if (canDelete) void onDelete(); }}
          disabled={!canDelete}
          title={canDelete ? 'Remove contact' : "Can't remove the only primary contact"}
          className="text-ink-faint hover:text-danger p-1 rounded disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
        <Row label="Email">
          <InlineField
            value={contact.email || ''}
            onCommit={(v) => onChange({ email: v || null })}
            placeholder="name@company.com"
          />
        </Row>
        <Row label="Phone">
          <InlineField
            value={contact.phone || ''}
            onCommit={(v) => onChange({ phone: v || null })}
            placeholder="555-..."
          />
        </Row>
        <Row label="Role">
          <InlineField
            value={contact.role || ''}
            onCommit={(v) => onChange({ role: v || null })}
            placeholder="Owner, CEO, ..."
          />
        </Row>
        <Row label="Preferred">
          <SelectField
            value={contact.preferred_contact || ''}
            onCommit={(v) => onChange({ preferred_contact: (v || null) as ClientContact['preferred_contact'] })}
            options={PREFERRED_OPTIONS as Array<{ value: string; label: string }>}
          />
        </Row>
      </div>

      {contact.notes != null || true ? (
        <div className="mt-2">
          <div className="text-[11px] text-ink-muted mb-0.5">Notes</div>
          <InlineField
            value={contact.notes || ''}
            onCommit={(v) => onChange({ notes: v || null })}
            placeholder="Anything specific to this contact"
            multiline
          />
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-muted w-[70px] shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// Click-to-edit text input that auto-saves on blur. Same UX as the inline
// editors elsewhere on the engagement detail page; lighter visual weight
// so the contact list doesn't feel like a wall of inputs.
function InlineField({
  value, onCommit, placeholder, className, multiline,
}: {
  value: string;
  onCommit: (v: string) => Promise<boolean | void> | void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => { setDraft(value); }, [value]);

  async function commit() {
    const trimmed = draft.trim();
    if (trimmed === (value ?? '').trim()) { setEditing(false); return; }
    await onCommit(trimmed);
    setEditing(false);
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setDraft(value); setEditing(false); }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void commit(); }
          }}
          placeholder={placeholder}
          className={cn(
            'w-full text-[12px] bg-surface-page border border-edge rounded p-1.5 focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none min-h-[50px] resize-y',
            className,
          )}
        />
      );
    }
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
        className={cn(
          'w-full text-[12px] bg-surface-page border border-edge rounded px-1.5 py-1 focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none',
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value); setEditing(true); }}
      className={cn(
        'text-left w-full px-1.5 py-1 rounded hover:bg-surface-alt transition-colors min-h-[26px]',
        className,
      )}
    >
      {value
        ? <span className="text-ink whitespace-pre-wrap break-words">{value}</span>
        : <span className="text-ink-faint italic">{placeholder || 'Click to edit'}</span>}
    </button>
  );
}

function SelectField({
  value, onCommit, options,
}: {
  value: string;
  onCommit: (v: string) => Promise<boolean | void> | void;
  options: Array<{ value: string; label: string }>;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <select
        autoFocus
        value={value}
        onChange={(e) => { void onCommit(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
        className="w-full text-[12px] bg-surface-page border border-edge rounded px-1.5 py-1 focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  const current = options.find((o) => o.value === value)?.label || '—';
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-left w-full px-1.5 py-1 rounded hover:bg-surface-alt transition-colors"
    >
      <span className={value ? 'text-ink' : 'text-ink-faint'}>{current}</span>
    </button>
  );
}
