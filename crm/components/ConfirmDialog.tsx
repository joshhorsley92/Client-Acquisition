'use client';

// Styled confirmation dialog — replaces browser confirm() for destructive
// actions. Built on top of Modal so it inherits the a11y treatment (focus
// trap, ESC, focus restoration).

import { useState } from 'react';
import Modal from './Modal';
import { cn } from '@/lib/cn';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const [running, setRunning] = useState(false);

  async function handleConfirm() {
    if (running) return;
    setRunning(true);
    try { await onConfirm(); }
    finally { setRunning(false); }
  }

  return (
    <Modal
      open={open}
      onClose={running ? undefined : onCancel}
      title={title}
      width={420}
    >
      {body && (
        <div className="text-[13px] text-ink-muted mb-5">
          {body}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={running}
          className={cn(
            'px-3.5 py-2 border border-edge rounded text-[13px] text-ink bg-surface',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            'hover:bg-surface-alt',
          )}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={running}
          className={cn(
            'px-3.5 py-2 border-none rounded text-[13px] font-semibold',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            tone === 'danger'
              ? 'bg-danger text-white hover:bg-danger-strong'
              : 'bg-brand-mint text-brand-charcoal hover:bg-brand-mint-dark',
          )}
        >
          {running ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
