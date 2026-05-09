// Maps detected weakness signals to point values. Higher score = better
// TKBS prospect, because each signal corresponds to a service TKBS can
// sell (no ads → run ads; outdated website → rebuild it; poor SEO → fix it).
//
// Weights are an opinionated starting point. Tune as real conversions roll
// in — same approach as the Fit Score weights in icp_config.

export type OpportunitySignal =
  | 'no_website'
  | 'website_unreachable'
  | 'no_paid_ads'
  | 'no_social_media'
  | 'poor_seo'
  | 'outdated_website'
  | 'poor_accessibility'
  | 'low_google_rating'
  | 'low_google_review_count';

const WEIGHTS: Record<OpportunitySignal, number> = {
  no_website:               30,
  website_unreachable:      25,
  no_paid_ads:              15,
  no_social_media:          15,
  poor_seo:                 15,
  outdated_website:         10,
  poor_accessibility:        5,
  low_google_rating:        10,
  low_google_review_count:  10,
};

const LABELS: Record<OpportunitySignal, string> = {
  no_website:              'No website',
  website_unreachable:     'Website broken',
  no_paid_ads:             'No paid ads',
  no_social_media:         'No social presence',
  poor_seo:                'Poor SEO',
  outdated_website:        'Outdated website',
  poor_accessibility:      'Poor accessibility',
  low_google_rating:       'Low Google rating',
  low_google_review_count: 'Low review count',
};

export function scoreOpportunity(signals: OpportunitySignal[]): number {
  return signals.reduce((sum, s) => sum + (WEIGHTS[s] ?? 0), 0);
}

export function labelFor(signal: OpportunitySignal): string {
  return LABELS[signal] ?? signal;
}

// Score band for color-coding the badge. ~80+ is hot.
export function scoreTier(score: number): 'hot' | 'warm' | 'cool' {
  if (score >= 60) return 'hot';
  if (score >= 30) return 'warm';
  return 'cool';
}
