'use client';

// Per-field keep / take / skip resolution modal for the apply-to-client flow.
// Shows the current vs incoming value for each conflict and lets the user
// pick what to do. Defaults to "take" (the legacy auto-overwrite behavior).

import Modal from './Modal';
import { PrimaryButton, SecondaryButton } from './ui/Forms';
import { cn } from '@/lib/cn';

type Choice = 'keep' | 'take' | 'skip';

interface Conflict {
  path: string;
  current: any;
  incoming: any;
  current_source?: string | null;
}

export default function ConflictDiffModal({
  conflicts, choices, onChoiceChange, onCancel, onConfirm, applying,
}: {
  conflicts: Conflict[];
  choices: Record<string, Choice>;
  onChoiceChange: (path: string, val: Choice) => void;
  onCancel: () => void;
  onConfirm: () => void;
  applying: boolean;
}) {
  const labelize = (path: string) => path.replace(/_/g, ' ').replace(/\./g, ' › ');
  const renderValue = (v: any) => {
    if (v == null) return <span className="text-ink-faint">—</span>;
    if (Array.isArray(v)) return <span>{v.join(', ')}</span>;
    return <span>{String(v)}</span>;
  };
  const sourceHint = (src?: string | null) => {
    if (!src) return null;
    if (src === 'manual') return <span className="text-warning font-semibold">your edit</span>;
    if (src.startsWith('call:')) return <span className="text-ink-muted">from call #{src.split(':')[1]}</span>;
    if (src.startsWith('merged:')) return <span className="text-ink-muted">merged from call #{src.split(':')[1]}</span>;
    return <span className="text-ink-muted">{src}</span>;
  };

  return (
    <Modal
      open={conflicts.length > 0}
      onClose={applying ? undefined : onCancel}
      title="Resolve conflicts before applying"
      width={720}
    >
      <p className="text-[13px] text-ink-muted leading-relaxed mb-4">
        {conflicts.length} field{conflicts.length === 1 ? '' : 's'} on this client already
        {' '}have a value that disagrees with the new extraction. Pick what to do for each.
      </p>
      <div className="flex flex-col gap-3.5">
        {conflicts.map((c) => (
          <div key={c.path} className="border border-edge rounded-md p-3">
            <div className="text-[13px] font-semibold text-ink mb-2">
              {labelize(c.path)}
              {c.current_source && (
                <span className="text-[11px] font-normal ml-2">
                  ({sourceHint(c.current_source)})
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-2.5">
              <div className="p-2 bg-surface-page rounded text-xs">
                <div className="text-[10px] text-ink-muted uppercase mb-1">Current</div>
                {renderValue(c.current)}
              </div>
              <div className="p-2 bg-brand-mint-light rounded text-xs">
                <div className="text-[10px] text-ink-muted uppercase mb-1">From this call</div>
                {renderValue(c.incoming)}
              </div>
            </div>
            <div className="flex gap-1.5">
              <ChoicePill label="Keep current" active={choices[c.path] === 'keep'} onClick={() => onChoiceChange(c.path, 'keep')} hint="Lock as your edit" />
              <ChoicePill label="Take new" active={choices[c.path] === 'take'} onClick={() => onChoiceChange(c.path, 'take')} hint="Overwrite with the call's value" />
              <ChoicePill label="Skip" active={choices[c.path] === 'skip'} onClick={() => onChoiceChange(c.path, 'skip')} hint="Don't change anything for this field" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center mt-4 gap-2">
        <div className="text-[11px] text-ink-muted">
          Tip: array fields like pain points always merge — they never conflict.
        </div>
        <div className="flex gap-2">
          <SecondaryButton onClick={onCancel} disabled={applying}>Cancel</SecondaryButton>
          <PrimaryButton onClick={onConfirm} disabled={applying}>
            {applying ? 'Applying…' : 'Apply with these choices'}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

function ChoicePill({ label, active, onClick, hint }: { label: string; active: boolean; onClick: () => void; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        'px-3 py-1 text-xs font-semibold rounded-full border transition-colors',
        active
          ? 'bg-brand-mint-light text-success border-brand-mint'
          : 'bg-surface text-ink-muted border-edge hover:border-brand-mint',
      )}
    >
      {active ? '✓ ' : ''}{label}
    </button>
  );
}
