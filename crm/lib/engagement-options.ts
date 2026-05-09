// Single source of truth for engagement package + source values.
// Stored as slugs in the DB; LABELS map slug → display string.
//
// When adding a new package or source: add the slug to PACKAGE_SLUGS /
// SOURCE_SLUGS, the display string to PACKAGE_LABELS / SOURCE_LABELS, and
// (for sources) update the CHECK constraint in a new migration.

export const PACKAGE_SLUGS = [
  'ad_copy',
  'ad_images',
  'ad_hosting',
  'ad_ab_testing',
  'landing_page',
  'full_website_redesign',
  'email_copy',
  'email_reviews',
  'email_media',
  'email_automation',
  'other',
] as const;
export type PackageSlug = (typeof PACKAGE_SLUGS)[number];

export const PACKAGE_LABELS: Record<PackageSlug, string> = {
  ad_copy:               'Ad Copy',
  ad_images:             'Ad Images',
  ad_hosting:            'Ad Hosting',
  ad_ab_testing:         'Ad A/B Testing',
  landing_page:          'Landing Page',
  full_website_redesign: 'Full Website Redesign',
  email_copy:            'Email Copy',
  email_reviews:         'Email Reviews',
  email_media:           'Email Media',
  email_automation:      'Email Automation',
  other:                 'Other',
};

export const SOURCE_SLUGS = [
  'warm_referral',
  'warm_outreach',
  'cold_outreach',
  'tkbs_marketing_material',
  'social_media',
  'booked_call_with_tkbs',
] as const;
export type SourceSlug = (typeof SOURCE_SLUGS)[number];

export const SOURCE_LABELS: Record<SourceSlug, string> = {
  warm_referral:           'Warm Referral',
  warm_outreach:           'Warm Outreach',
  cold_outreach:           'Cold Outreach',
  tkbs_marketing_material: 'TKBS Marketing Material',
  social_media:            'Social Media',
  booked_call_with_tkbs:   'Booked Call with TKBS',
};

// Pricing types for a package line item.
//   'one_time' — counts toward the engagement's setup fee (estimated_value).
//   'monthly'  — counts toward MRR (monthly_recurring_value).
export const PRICING_TYPES = ['one_time', 'monthly'] as const;
export type PricingType = (typeof PRICING_TYPES)[number];
export const PRICING_TYPE_LABELS: Record<PricingType, string> = {
  one_time: 'One-time',
  monthly: 'Monthly',
};

// Per-package row: slug is required, label is only meaningful for 'other'
// (the user-supplied custom name for that line item), details is the
// free-text expansion that feeds proposal generation. unit_price +
// pricing_type drive the engagement's value rollups (see
// summarizePackagePricing) and the proposal Investment section.
export interface EngagementPackage {
  slug: PackageSlug;
  label?: string;
  details?: string;
  unit_price?: number;
  pricing_type?: PricingType;
}

// Display title for one package. For 'other' with a custom label, returns
// the label ("Newsletter setup"); otherwise returns the standard label
// ("Ad Copy"). Handles raw slug strings too — useful for legacy data.
export function packageDisplayName(pkg: EngagementPackage | string | null | undefined): string {
  if (!pkg) return '';
  if (typeof pkg === 'string') {
    if (pkg.startsWith('legacy_')) return pkg.slice('legacy_'.length).replace(/_/g, ' ');
    return PACKAGE_LABELS[pkg as PackageSlug] || pkg;
  }
  if (pkg.slug === 'other' && pkg.label?.trim()) return pkg.label.trim();
  return PACKAGE_LABELS[pkg.slug] || pkg.slug;
}

// Render N packages as a readable comma-separated display string. Tolerates
// either the new object shape OR a legacy slug-string array, so callers
// reading `engagement.packages` straight from the DB don't need to care.
export function formatPackages(
  packages: Array<EngagementPackage | string> | null | undefined,
): string {
  if (!Array.isArray(packages) || packages.length === 0) return '';
  return packages
    .map((p) => packageDisplayName(p))
    .filter(Boolean)
    .join(', ');
}

// Coerce whatever the DB returned into normalized EngagementPackage[].
// Strips legacy_* slugs and slugs not in our current enum so downstream
// code can trust the shape.
export function normalizePackages(raw: unknown): EngagementPackage[] {
  if (!Array.isArray(raw)) return [];
  const validSlugs = new Set(PACKAGE_SLUGS);
  const validPricing = new Set(PRICING_TYPES);
  const out: EngagementPackage[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      if (item.startsWith('legacy_')) continue;
      if (validSlugs.has(item as PackageSlug)) out.push({ slug: item as PackageSlug });
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const slug = typeof o.slug === 'string' ? o.slug : null;
      if (!slug || !validSlugs.has(slug as PackageSlug)) continue;
      const pkg: EngagementPackage = { slug: slug as PackageSlug };
      if (typeof o.label === 'string' && o.label.trim()) pkg.label = o.label.trim();
      if (typeof o.details === 'string' && o.details.trim()) pkg.details = o.details.trim();
      if (typeof o.unit_price === 'number' && Number.isFinite(o.unit_price) && o.unit_price >= 0) {
        pkg.unit_price = o.unit_price;
      }
      if (typeof o.pricing_type === 'string' && validPricing.has(o.pricing_type as PricingType)) {
        pkg.pricing_type = o.pricing_type as PricingType;
      }
      out.push(pkg);
    }
  }
  return out;
}

// Roll the package list into engagement-level totals. Used by the
// engagement POST/PATCH routes to refresh the cached `estimated_value` and
// `monthly_recurring_value` columns on every package change. Packages with
// no price contribute 0; default pricing_type is 'one_time' so untouched
// existing rows keep behaving as one-time deals.
export function summarizePackagePricing(packages: EngagementPackage[]): {
  one_time_total: number;
  monthly_total: number;
} {
  let one_time_total = 0;
  let monthly_total = 0;
  for (const pkg of packages) {
    const price = pkg.unit_price ?? 0;
    if (!Number.isFinite(price) || price <= 0) continue;
    if (pkg.pricing_type === 'monthly') monthly_total += price;
    else one_time_total += price;
  }
  return { one_time_total, monthly_total };
}

// Display title for an engagement. Prefers an explicit `title` set by the
// user; falls back to the auto-derived comma-separated package list. The
// caller decides whether to append "#<id>"; this helper just returns the
// best name string. Empty string is possible (no title, no packages).
export function engagementTitle(opts: {
  title?: string | null;
  packages?: Array<EngagementPackage | string> | null;
}): string {
  const explicit = (opts.title ?? '').trim();
  if (explicit) return explicit;
  return formatPackages(opts.packages);
}

// Compact "$3,000 setup · $500/mo" for chips/cards. Returns '' if both
// totals are zero so callers can short-circuit display.
export function formatPricingChip(opts: {
  one_time?: number | string | null;
  monthly?: number | string | null;
}): string {
  const ot = Number(opts.one_time ?? 0);
  const mo = Number(opts.monthly ?? 0);
  const parts: string[] = [];
  if (ot > 0) parts.push(`$${ot.toLocaleString()}${mo > 0 ? ' setup' : ''}`);
  if (mo > 0) parts.push(`$${mo.toLocaleString()}/mo`);
  return parts.join(' · ');
}
