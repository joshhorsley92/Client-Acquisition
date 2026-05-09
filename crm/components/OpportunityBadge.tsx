// Opportunity score pill — color-coded by score band. Used on the Discovery
// candidate triage table (parallel to EnrichmentBadge for clients).

import { cn } from '@/lib/cn';
import { scoreTier } from '@/services/lead-discovery/scoring';

const TONES: Record<'hot' | 'warm' | 'cool', string> = {
  hot:  'bg-success-bg text-success border-success-border',
  warm: 'bg-warning-bg text-warning border-warning-border',
  cool: 'bg-surface-page text-ink-muted border-edge',
};

export default function OpportunityBadge({ score }: { score?: number | null }) {
  if (score == null) {
    return (
      <span className="text-[10px] px-1.5 py-px rounded-full font-semibold border border-edge text-ink-faint">
        unscored
      </span>
    );
  }
  const tier = scoreTier(score);
  return (
    <span className={cn(
      'text-[11px] px-2 py-0.5 rounded-full border font-semibold tabular-nums',
      TONES[tier],
    )}>
      {score}
    </span>
  );
}
