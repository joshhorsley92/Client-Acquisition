'use client';

// New Call modal. Required: client + (transcript OR audio file). If audio
// is uploaded, it goes to Supabase Storage via a signed URL first, then
// the metadata is POSTed to /api/calls.

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Modal from './Modal';
import {
  Field, Row, Input, Select, Textarea, ErrorBox,
  PrimaryButton, SecondaryButton,
} from './ui/Forms';
import { api } from '@/lib/api';
import { createClient } from '@/lib/supabase-browser';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import { CallCreateSchema } from '@/lib/schemas';

// Refine the shared schema with the modal-only rule: must have transcript
// OR audio. Audio is tracked in component state (File can't go through Zod).
const ModalSchema = CallCreateSchema;
type ModalInput = z.infer<typeof ModalSchema>;

export default function NewCallModal({
  open, onClose, onCreated, clients, defaultClientId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (call: any) => void;
  clients: Array<{ id: number; name: string }>;
  defaultClientId?: number;
}) {
  const [audio, setAudio] = useState<File | null>(null);
  const supabase = createClient();

  const {
    register, handleSubmit, reset, watch, formState: { errors, isSubmitting },
    setError, clearErrors,
  } = useForm<ModalInput>({
    resolver: zodResolver(ModalSchema),
    defaultValues: { client_id: defaultClientId as any },
  });

  useEffect(() => {
    if (!open) {
      reset({ client_id: defaultClientId as any });
      setAudio(null);
    }
  }, [open, defaultClientId, reset]);

  const transcript = watch('transcript');
  const hasContent = Boolean((transcript && transcript.trim()) || audio);

  const onSubmit = handleSubmit(async (data) => {
    clearErrors('root');
    if (!hasContent) {
      setError('root', { message: 'Provide a transcript or upload an audio file.' });
      return;
    }
    try {
      let audio_storage_path: string | null = null;
      let audio_original_name: string | null = null;
      let audio_size_bytes: number | null = null;
      if (audio) {
        const { token, path } = await api.post<{ token: string; path: string }>(
          '/api/calls/upload-url', { filename: audio.name },
        );
        const { error: upErr } = await supabase.storage
          .from('crm-call-recordings')
          .uploadToSignedUrl(path, token, audio);
        if (upErr) throw new Error(`Audio upload failed: ${upErr.message}`);
        audio_storage_path = path;
        audio_original_name = audio.name;
        audio_size_bytes = audio.size;
      }
      const { call } = await api.post<{ call: any }>('/api/calls', {
        ...data,
        audio_storage_path, audio_original_name, audio_size_bytes,
      });
      toast.success('Call added.');
      onCreated(call);
    } catch (err: unknown) {
      const message = humanizeError(err, 'Failed to add call.');
      setError('root', { message });
      toast.error(message);
    }
  });

  return (
    <Modal
      open={open}
      onClose={isSubmitting ? undefined : onClose}
      title="Add Call"
      width={520}
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
          <Field label="Call date">
            <Input type="date" {...register('call_date')} />
          </Field>
          <Field label="Duration (min)" error={errors.duration_minutes?.message}>
            <Input
              type="number"
              min={0}
              {...register('duration_minutes')}
              aria-invalid={errors.duration_minutes ? 'true' : 'false'}
            />
          </Field>
        </Row>
        <Field label="Audio file (optional)">
          <input
            type="file"
            accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.webm,.mp4,.mov,.aac,.flac"
            onChange={(e) => setAudio(e.target.files?.[0] || null)}
            className="text-[13px]"
          />
          <div className="text-[11px] text-ink-faint mt-1">
            Stored in Supabase. Whisper auto-transcription is paused for v1.0 — paste the transcript below.
          </div>
        </Field>
        <Field label="Transcript">
          <Textarea
            {...register('transcript')}
            className="min-h-[140px]"
            placeholder="Paste the call transcript here, then run Brand Profile extraction from the call detail page."
          />
        </Field>
        <Field label="Notes">
          <Textarea {...register('notes')} />
        </Field>

        <div className="flex justify-end gap-2 mt-4">
          <SecondaryButton type="button" onClick={onClose} disabled={isSubmitting}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={isSubmitting || !hasContent}>
            {isSubmitting ? 'Creating…' : 'Add call'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
