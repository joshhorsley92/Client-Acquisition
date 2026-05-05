'use client';

// Per-field keep / take / skip resolution modal for the apply-to-client flow.
// Shows the current vs incoming value for each conflict and lets the user
// pick what to do. Defaults to "take" (the legacy auto-overwrite behavior).

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
    if (v == null) return <span style={{ color: '#94a3b8' }}>—</span>;
    if (Array.isArray(v)) return <span>{v.join(', ')}</span>;
    return <span>{String(v)}</span>;
  };
  const sourceHint = (src?: string | null) => {
    if (!src) return null;
    if (src === 'manual') return <span style={{ color: '#A16207', fontWeight: 600 }}>your edit</span>;
    if (src.startsWith('call:')) return <span style={{ color: '#64748B' }}>from call #{src.split(':')[1]}</span>;
    if (src.startsWith('merged:')) return <span style={{ color: '#64748B' }}>merged from call #{src.split(':')[1]}</span>;
    return <span style={{ color: '#64748B' }}>{src}</span>;
  };

  return (
    <div
      onClick={applying ? undefined : onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 8, padding: 24, width: 720,
          maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>
          Resolve conflicts before applying
        </h3>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5, margin: '0 0 18px 0' }}>
          {conflicts.length} field{conflicts.length === 1 ? '' : 's'} on this client already
          {' '}have a value that disagrees with the new extraction. Pick what to do for each.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {conflicts.map((c) => (
            <div key={c.path} style={{ border: '1px solid #E2E6EB', borderRadius: 6, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2838', marginBottom: 8 }}>
                {labelize(c.path)}
                {c.current_source && (
                  <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                    ({sourceHint(c.current_source)})
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                <div style={{ padding: 8, background: '#F7F8FA', borderRadius: 4, fontSize: 12 }}>
                  <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>Current</div>
                  {renderValue(c.current)}
                </div>
                <div style={{ padding: 8, background: '#E6FAF5', borderRadius: 4, fontSize: 12 }}>
                  <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>From this call</div>
                  {renderValue(c.incoming)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <ChoicePill label="Keep current" active={choices[c.path] === 'keep'} onClick={() => onChoiceChange(c.path, 'keep')} hint="Lock as your edit" />
                <ChoicePill label="Take new" active={choices[c.path] === 'take'} onClick={() => onChoiceChange(c.path, 'take')} hint="Overwrite with the call's value" />
                <ChoicePill label="Skip" active={choices[c.path] === 'skip'} onClick={() => onChoiceChange(c.path, 'skip')} hint="Don't change anything for this field" />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 8 }}>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            Tip: array fields like pain points always merge — they never conflict.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel} disabled={applying}
              style={{ padding: '8px 16px', background: '#fff', color: '#1B2838', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: applying ? 'not-allowed' : 'pointer', opacity: applying ? 0.6 : 1 }}>
              Cancel
            </button>
            <button onClick={onConfirm} disabled={applying}
              style={{ padding: '8px 16px', background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: applying ? 'not-allowed' : 'pointer', opacity: applying ? 0.6 : 1 }}>
              {applying ? 'Applying…' : 'Apply with these choices'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChoicePill({ label, active, onClick, hint }: { label: string; active: boolean; onClick: () => void; hint: string }) {
  return (
    <button type="button" onClick={onClick} title={hint}
      style={{
        padding: '5px 12px', fontSize: 12, fontWeight: 600,
        borderRadius: 14,
        border: `1px solid ${active ? '#00D4AA' : '#E2E6EB'}`,
        background: active ? '#E6FAF5' : '#fff',
        color: active ? '#047857' : '#64748B',
        cursor: 'pointer',
      }}>
      {active ? '✓ ' : ''}{label}
    </button>
  );
}
