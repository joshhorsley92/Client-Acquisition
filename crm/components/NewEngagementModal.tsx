'use client';

// New Engagement modal — creates an engagement and (optionally) a brand-new
// client inline. Required: client_id (or "+ New Client" + name). Defaults
// status='new'.
//
// Multi-select packages (line items) feed proposal generation. Source enum
// uses the post-2026-05 lead-channel taxonomy from engagement-options.ts.

import { useEffect, useState } from 'react';
import Modal from './Modal';
import {
  Field, Row, Input, Select, Textarea, ErrorBox,
  PrimaryButton, SecondaryButton,
} from './ui/Forms';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import {
  PACKAGE_SLUGS, PACKAGE_LABELS, type PackageSlug,
  SOURCE_SLUGS, SOURCE_LABELS, type SourceSlug,
  type EngagementPackage,
} from '@/lib/engagement-options';

const NEW_CLIENT_VALUE = '__new__';

export default function NewEngagementModal({
  open, onClose, onCreated, clients, defaultClientId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (eng: any) => void;
  clients: Array<{ id: number; name: string }>;
  defaultClientId?: number;
}) {
  const [clientChoice, setClientChoice] = useState<string>(defaultClientId ? String(defaultClientId) : '');
  const [newClientName, setNewClientName] = useState('');
  const [packages, setPackages] = useState<Set<PackageSlug>>(new Set());
  const [otherLabel, setOtherLabel] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [source, setSource] = useState<string>('');
  const [sourceDetail, setSourceDetail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  // Reset on open/close so a stale state doesn't bleed across uses.
  useEffect(() => {
    if (open) {
      setClientChoice(defaultClientId ? String(defaultClientId) : '');
      setNewClientName('');
      setPackages(new Set());
      setOtherLabel('');
      setEstimatedValue('');
      setSource('');
      setSourceDetail('');
      setNotes('');
      setErr('');
    }
  }, [open, defaultClientId]);

  function togglePackage(slug: PackageSlug) {
    setPackages((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');

    if (!clientChoice) {
      setErr('Pick a client (or choose "+ New Client").');
      return;
    }
    if (clientChoice === NEW_CLIENT_VALUE && !newClientName.trim()) {
      setErr('Enter a name for the new client.');
      return;
    }
    if (packages.has('other') && !otherLabel.trim()) {
      setErr('Tell us what "Other" is — that label becomes the engagement title.');
      return;
    }

    setSubmitting(true);
    try {
      let clientId: number;

      if (clientChoice === NEW_CLIENT_VALUE) {
        // Create a placeholder client with just the name. Joe fills in the
        // rest later (or hits Scrub website).
        const { client: created } = await api.post<{ client: any }>('/api/clients', {
          name: newClientName.trim(),
        });
        clientId = created.id;
      } else {
        clientId = Number(clientChoice);
      }

      const packagesPayload: EngagementPackage[] = [...packages].map((slug) => {
        if (slug === 'other') return { slug: 'other', label: otherLabel.trim() };
        return { slug };
      });
      const payload = {
        client_id: clientId,
        packages: packagesPayload,
        source: source || undefined,
        source_detail: sourceDetail || undefined,
        estimated_value: estimatedValue ? Number(estimatedValue) : undefined,
        notes: notes || undefined,
      };

      const { engagement } = await api.post<{ engagement: any }>('/api/engagements', payload);
      toast.success('Engagement created.');
      onCreated(engagement);
    } catch (err: unknown) {
      const message = humanizeError(err, 'Failed to create engagement.');
      setErr(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const isNewClient = clientChoice === NEW_CLIENT_VALUE;

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="New Engagement"
      width={520}
    >
      {err && <ErrorBox>{err}</ErrorBox>}
      <form onSubmit={submit}>
        <Field label="Client" required>
          <Select
            value={clientChoice}
            onChange={(e) => setClientChoice(e.target.value)}
            autoFocus
          >
            <option value="">— select client —</option>
            <option value={NEW_CLIENT_VALUE}>+ New Client</option>
            {clients.length > 0 && <option disabled>──────────</option>}
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>

        {isNewClient && (
          <Field label="New client name" required>
            <Input
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="e.g. Foundations Tree Experts"
            />
          </Field>
        )}

        <Field label="Packages">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-1 p-2.5 border border-edge rounded bg-surface">
            {PACKAGE_SLUGS.map((slug) => (
              <label key={slug} className="flex items-center gap-2 text-[13px] cursor-pointer hover:text-ink">
                <input
                  type="checkbox"
                  checked={packages.has(slug)}
                  onChange={() => togglePackage(slug)}
                  className="accent-brand-mint"
                />
                <span>{PACKAGE_LABELS[slug]}</span>
              </label>
            ))}
          </div>
          {packages.size === 0 && (
            <div className="text-[11px] text-ink-faint mt-1">
              Pick what TKBS will deliver. These feed straight into proposal generation.
            </div>
          )}
        </Field>

        {packages.has('other') && (
          <Field label={'What is "Other"?'} required>
            <Input
              value={otherLabel}
              onChange={(e) => setOtherLabel(e.target.value)}
              placeholder="e.g. Newsletter setup, podcast production"
              maxLength={120}
            />
          </Field>
        )}

        <Field label="Estimated value">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-[13px] pointer-events-none">$</span>
            <Input
              type="number"
              min={0}
              step="any"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder="0"
              className="pl-6"
            />
          </div>
        </Field>

        <Row>
          <Field label="Source">
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">—</option>
              {SOURCE_SLUGS.map((slug) => (
                <option key={slug} value={slug}>{SOURCE_LABELS[slug as SourceSlug]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Source detail">
            <Input
              value={sourceDetail}
              onChange={(e) => setSourceDetail(e.target.value)}
              placeholder="Additional Details about How We Sourced This Client"
            />
          </Field>
        </Row>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[80px]" />
        </Field>

        <div className="flex justify-end gap-2 mt-4">
          <SecondaryButton type="button" onClick={onClose} disabled={submitting}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create engagement'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
