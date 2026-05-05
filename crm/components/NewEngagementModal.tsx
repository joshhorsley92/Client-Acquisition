'use client';

// New Engagement modal — minimal create form. Required: client_id.
// Defaults to status='new'; everything else optional.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Modal from './Modal';
import {
  Field, Row, Input, Select, Textarea, ErrorBox,
  PrimaryButton, SecondaryButton,
} from './ui/Forms';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import { EngagementCreateSchema, type EngagementCreateInput } from '@/lib/schemas';

export default function NewEngagementModal({
  open, onClose, onCreated, clients, defaultClientId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (eng: any) => void;
  clients: Array<{ id: number; name: string }>;
  defaultClientId?: number;
}) {
  const {
    register, handleSubmit, reset, formState: { errors, isSubmitting },
    setError, clearErrors,
  } = useForm<EngagementCreateInput>({
    resolver: zodResolver(EngagementCreateSchema),
    // RHF + zodResolver handles z.coerce.number() — passing the default as a
    // number works, but the underlying <select> renders strings. Cast at submit.
    defaultValues: { client_id: defaultClientId as any },
  });

  useEffect(() => {
    if (!open) reset({ client_id: defaultClientId as any });
  }, [open, defaultClientId, reset]);

  const onSubmit = handleSubmit(async (data) => {
    clearErrors('root');
    try {
      const { engagement } = await api.post<{ engagement: any }>('/api/engagements', data);
      toast.success('Engagement created.');
      onCreated(engagement);
    } catch (err: unknown) {
      const message = humanizeError(err, 'Failed to create engagement.');
      setError('root', { message });
      toast.error(message);
    }
  });

  return (
    <Modal
      open={open}
      onClose={isSubmitting ? undefined : onClose}
      title="New Engagement"
      width={480}
    >
      {errors.root?.message && <ErrorBox>{errors.root.message}</ErrorBox>}
      <form onSubmit={onSubmit}>
        <Field label="Client" required error={errors.client_id?.message}>
          <Select {...register('client_id')} aria-invalid={errors.client_id ? 'true' : 'false'} autoFocus>
            <option value="">— select client —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Row>
          <Field label="Package">
            <Select {...register('package_type')}>
              <option value="">—</option>
              <option value="boost">Boost</option>
              <option value="launch">Launch</option>
              <option value="both">Both</option>
              <option value="undecided">Undecided</option>
            </Select>
          </Field>
          <Field label="Estimated value" error={errors.estimated_value?.message}>
            <Input
              type="number"
              min={0}
              step="any"
              {...register('estimated_value')}
              placeholder="0"
              aria-invalid={errors.estimated_value ? 'true' : 'false'}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Source">
            <Select {...register('source')}>
              <option value="">—</option>
              <option value="referral">Referral</option>
              <option value="cold">Cold</option>
              <option value="web">Web</option>
              <option value="content">Content</option>
              <option value="paid_ads">Paid ads</option>
            </Select>
          </Field>
          <Field label="Source detail">
            <Input {...register('source_detail')} placeholder="e.g. LinkedIn intro from..." />
          </Field>
        </Row>
        <Field label="Notes">
          <Textarea {...register('notes')} className="min-h-[80px]" />
        </Field>
        <div className="flex justify-end gap-2 mt-4">
          <SecondaryButton type="button" onClick={onClose} disabled={isSubmitting}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create engagement'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
