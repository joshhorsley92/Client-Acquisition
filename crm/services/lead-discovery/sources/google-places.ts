// Google Places API (Places API v1 — Text Search).
// https://developers.google.com/maps/documentation/places/web-service/text-search
//
// One POST → up to 20 places per call (v1's Text Search default page size).
// Field mask is mandatory: list every field we want back, get billed only
// for that tier. We're on the "Text Search Pro" tier with this mask because
// rating + userRatingCount are Pro-tier fields.
//
// Pricing as of 2026: $0.040 per Pro-tier Text Search request, $200/mo
// free credit ⇒ ~5,000 calls/month free.

import type { Source, DiscoverParams, CandidateInput } from '../registry';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.types',
  'places.primaryType',
].join(',');

interface PlaceAddrComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}
interface Place {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: PlaceAddrComponent[];
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  primaryType?: string;
}

function findComponent(addr: PlaceAddrComponent[] | undefined, type: string): string | null {
  if (!addr) return null;
  for (const c of addr) {
    if (c.types?.includes(type)) return c.longText || c.shortText || null;
  }
  return null;
}

function buildTextQuery(params: DiscoverParams): string {
  const industry = params.industry?.trim() || 'small business';
  const where = [
    params.location?.trim(),
    params.zip?.trim(),
  ].filter(Boolean).join(' ');
  return where ? `${industry} in ${where}` : industry;
}

export const googlePlacesSource: Source = {
  key: 'google_places',
  label: 'Google Places',
  isAvailable() {
    return Boolean(process.env.GOOGLE_PLACES_API_KEY);
  },
  async discover(params: DiscoverParams): Promise<CandidateInput[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set');

    const textQuery = buildTextQuery(params);
    const body: Record<string, unknown> = {
      textQuery,
      pageSize: Math.min(params.limit ?? 20, 20),
    };

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google Places request failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as { places?: Place[] };
    const places = json.places || [];

    const out: CandidateInput[] = [];
    for (const p of places) {
      const name = p.displayName?.text;
      if (!name) continue;

      const rating = p.rating ?? null;
      const reviews = p.userRatingCount ?? null;

      // Filter on rating and review-count bounds (the API doesn't expose
      // these as native filters, so we apply them client-side).
      if (params.max_rating != null && rating != null && rating > params.max_rating) continue;
      if (params.min_reviews != null && reviews != null && reviews < params.min_reviews) continue;
      if (params.max_reviews != null && reviews != null && reviews > params.max_reviews) continue;

      const hasSite = Boolean(p.websiteUri);
      if (params.has_website === true && !hasSite) continue;
      if (params.has_website === false && hasSite) continue;

      out.push({
        source_id: p.id,
        name,
        website: p.websiteUri || null,
        phone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
        address: p.formattedAddress || null,
        city: findComponent(p.addressComponents, 'locality'),
        state: findComponent(p.addressComponents, 'administrative_area_level_1'),
        zip: findComponent(p.addressComponents, 'postal_code'),
        industry: p.primaryType || (p.types?.[0] ?? null),
        google_rating: rating,
        google_reviews_ct: reviews,
        google_types: p.types ?? [],
      });
    }
    return out;
  },
};
