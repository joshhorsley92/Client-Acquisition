'use client';

// Quick-add note modal — single textarea, creates an activities row.
// Drop in anywhere a user might want to drop a thought without opening
// the full client/engagement detail.

import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import {
  Field, Textarea, ErrorBox, PrimaryButton, SecondaryButton,
} from './ui/Forms';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';

interface QuickNoteModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  clientId: number | string;
  engagementId?: number | string | null;
  contextLabel?: string;
}

export default function QuickNoteModal({
  open, onClose, onSaved, clientId, engagementId, contextLabel,
}: QuickNoteModalProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) {
      setNote('');
      setError('');
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setSubmitting(true); setError('');
    try {
      await api.post('/api/activities', {
        client_id: clientId,
        engagement_id: engagementId ?? null,
        type: 'note',
        content: note.trim(),
      });
      toast.success('Note saved.');
      setNote('');
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      const message = humanizeError(err, 'Failed to save note.');
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit(e as unknown as React.FormEvent);
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={contextLabel ? `Note for ${contextLabel}` : 'Add note'}
      width={480}
    >
      {error && <ErrorBox>{error}</ErrorBox>}
      <form onSubmit={submit}>
        <Field label="Note">
          <Textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={onKeyDown}
            rows={5}
            autoFocus
            placeholder="What did you learn? What should we do next?"
          />
        </Field>
        <div className="flex justify-between items-center mt-3">
          <span className="text-[11px] text-ink-faint">Cmd/Ctrl-Enter to save</span>
          <div className="flex gap-2">
            <SecondaryButton type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={submitting || !note.trim()}>
              {submitting ? 'Saving…' : 'Save note'}
            </PrimaryButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
