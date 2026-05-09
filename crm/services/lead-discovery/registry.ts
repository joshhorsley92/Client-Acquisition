// Registry of available lead-discovery sources. Adding a new source means
// implementing the Source interface and dropping a row in here. The /run
// route looks up the source by key, calls discover(), and inserts the
// returned candidates.

export interface CandidateInput {
  source_id: string;
  name: string;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  industry?: string | null;
  google_rating?: number | null;
  google_reviews_ct?: number | null;
  google_types?: string[];
}

export interface DiscoverParams {
  // Common filter knobs. Each source uses what it needs and ignores the rest.
  industry?: string;
  location?: string;             // free-text — "Detroit, MI" or "48226"
  zip?: string;
  radius_miles?: number;
  county?: string;
  min_reviews?: number;
  max_reviews?: number;
  max_rating?: number;           // upper bound on rating (low-rated = opportunity)
  has_website?: boolean;         // filter by website presence (best-effort)
  limit?: number;                // result cap
}

export interface Source {
  key: string;
  label: string;
  // Each source self-reports whether it's usable in this environment
  // (e.g., google_places returns false when GOOGLE_PLACES_API_KEY is unset).
  isAvailable(): boolean;
  discover(params: DiscoverParams): Promise<CandidateInput[]>;
}

import { googlePlacesSource } from './sources/google-places';
import { laraSource } from './sources/lara';

export const SOURCES: Record<string, Source> = {
  [googlePlacesSource.key]: googlePlacesSource,
  [laraSource.key]: laraSource,
};

export function listAvailableSources(): { key: string; label: string }[] {
  return Object.values(SOURCES)
    .filter((s) => s.isAvailable())
    .map(({ key, label }) => ({ key, label }));
}
