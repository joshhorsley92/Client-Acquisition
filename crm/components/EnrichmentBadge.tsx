// Small status pill used on Client list rows + Client detail page.
// Returns null for the 'none' state so unenriched clients don't get a badge.

import { cn } from '@/lib/cn';

const TONES: Record<string, { className: string; label: string }> = {
  running:   { className: 'bg-warning-bg text-warning border border-warning-border',  label: 'Enriching…' },
  succeeded: { className: 'bg-success-bg text-success border border-success-border', label: 'Enriched' },
  failed:    { className: 'bg-danger-bg text-danger-strong border border-danger-border', label: 'Enrichment failed' },
};

export default function EnrichmentBadge({ status }: { status?: string | null }) {
  if (!status || status === 'none') return null;
  const tone = TONES[status];
  if (!tone) return null;
  return (
    <span className={cn(
      'text-[10px] px-1.5 py-px rounded-full font-semibold ml-2 whitespace-nowrap',
      tone.className,
    )}>
      {tone.label}
    </span>
  );
}
