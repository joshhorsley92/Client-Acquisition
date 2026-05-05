'use client';

// Create-client form. Uses react-hook-form + the shared ClientCreateSchema
// for validation, so the UI rules match the API rules exactly.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Modal from './Modal';
import {
  Field, Row, Input, Select, Textarea, Divider, ErrorBox,
  PrimaryButton, SecondaryButton,
} from './ui/Forms';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import { ClientCreateSchema, type ClientCreateInput } from '@/lib/schemas';

export default function NewClientModal({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (client: any) => void;
}) {
  const {
    register, handleSubmit, reset, formState: { errors, isSubmitting },
    setError, clearErrors,
  } = useForm<ClientCreateInput>({
    resolver: zodResolver(ClientCreateSchema),
    defaultValues: { name: '' },
  });

  // Reset the form whenever the modal closes — keep stale state out.
  useEffect(() => { if (!open) reset(); }, [open, reset]);

  const onSubmit = handleSubmit(async (data) => {
    clearErrors('root');
    try {
      const { client } = await api.post<{ client: any }>('/api/clients', data);
      toast.success(`Created ${client.name}.`);
      onCreated(client);
    } catch (err: unknown) {
      const message = humanizeError(err, 'Failed to create client.');
      setError('root', { message });
      toast.error(message);
    }
  });

  return (
    <Modal
      open={open}
      onClose={isSubmitting ? undefined : onClose}
      title="New Client"
      width={520}
    >
      {errors.root?.message && <ErrorBox>{errors.root.message}</ErrorBox>}
      <form onSubmit={onSubmit}>
        <Field label="Name" required error={errors.name?.message}>
          <Input
            {...register('name')}
            aria-invalid={errors.name ? 'true' : 'false'}
            autoFocus
          />
        </Field>
        <Row>
          <Field label="Website" error={errors.website?.message}>
            <Input
              {...register('website')}
              placeholder="https://..."
              aria-invalid={errors.website ? 'true' : 'false'}
            />
          </Field>
          <Field label="Industry">
            <Input {...register('industry')} />
          </Field>
        </Row>
        <Row>
          <Field label="Location">
            <Input {...register('location')} placeholder="City, State" />
          </Field>
          <Field label="Type">
            <Select {...register('type')}>
              <option value="">—</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </Select>
          </Field>
        </Row>
        <Divider />
        <Field label="Primary contact name">
          <Input {...register('primary_contact_name')} />
        </Field>
        <Row>
          <Field label="Email" error={errors.email?.message}>
            <Input
              type="email"
              {...register('email')}
              aria-invalid={errors.email ? 'true' : 'false'}
            />
          </Field>
          <Field label="Phone">
            <Input {...register('phone')} />
          </Field>
        </Row>
        <Field label="Role">
          <Input {...register('role')} placeholder="Owner, Marketing Manager, ..." />
        </Field>
        <Field label="Notes">
          <Textarea {...register('notes')} />
        </Field>

        <div className="flex justify-end gap-2 mt-4">
          <SecondaryButton type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create client'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
