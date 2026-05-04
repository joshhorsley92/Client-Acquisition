// Fit Score engine — computes a 0-100 qualification score for a client
// based on ICP match, readiness signals, and engagement.
//
// v1.0 changes from prototype:
//   - ICP config moved from disk file (server/config/icp.json) to
//     crm.integration_settings (type='icp_config').
//   - Marketing signals lookup (acq_leads / acq_marketing_signals) is gone
//     — those tables don't exist in v1.0. Falls back to client.enrichment_data
//     for any signals the CSV import or future enrichment service stores there.
//   - All SQLite reads/writes replaced with Supabase client calls.

import type { SupabaseClient } from '@supabase/supabase-js';

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
]);
const US_STATE_NAMES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine',
  'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
  'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
  'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina',
  'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia',
  'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia',
]);

const DEFAULT_ICP = {
  scoring_weights: { icp_match: 40, readiness_signals: 30, engagement: 30 },
  icp_match_breakdown: {
    industry_match: 15,
    revenue_in_range: 10,
    geographic_fit: 5,
    green_flag_points_cap: 10,
    red_flag_penalty_cap: -15,
  },
  target_industries: { included: [], excluded: [] },
  revenue_range: { min_usd: 500_000, max_usd: 10_000_000 },
  geographic_preference: { primary_region: 'Michigan', national_ok: true },
  green_flags: [
    { id: 'product_with_weak_marketing', weight: 10 },
    { id: 'scaling_beyond_local', weight: 5 },
    { id: 'needs_basic_assets', weight: 5 },
  ],
  red_flags: [
    { id: 'unclear_everything_cheap', weight: -15 },
  ],
};

function lc(s: unknown): string {
  return (s == null ? '' : String(s)).toLowerCase();
}
function containsAny(haystack: unknown, needles: string[]): boolean {
  const h = lc(haystack);
  if (!h) return false;
  return needles.some((n) => n && h.indexOf(lc(n)) !== -1);
}

export function parseRevenueFromText(text: unknown): number | null {
  if (!text) return null;
  const s = String(text).toLowerCase();
  const m = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:mm|m\b|million)/);
  if (m) return parseFloat(m[1]) * 1_000_000;
  const b = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:b\b|billion)/);
  if (b) return parseFloat(b[1]) * 1_000_000_000;
  const k = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:k\b|thousand)/);
  if (k) return parseFloat(k[1]) * 1_000;
  const d = s.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (d) {
    const n = parseFloat(d[1].replace(/,/g, ''));
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

function resolveRevenueUsd(client: any): number | null {
  if (!client) return null;
  if (client.annual_revenue_usd != null && !isNaN(Number(client.annual_revenue_usd))) {
    const n = Number(client.annual_revenue_usd);
    if (n > 0) return n;
  }
  for (const f of ['revenue_estimate', 'notes']) {
    if (client[f]) {
      const parsed = parseRevenueFromText(client[f]);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

interface Flags { green: string[]; red: string[]; }

function scoreIndustryMatch(client: any, icp: any, max: number, flags: Flags): number {
  const haystack = [client?.industry, client?.notes].filter(Boolean).join(' ');
  if (!haystack) return Math.round((max * 7) / 15);
  const excluded = icp.target_industries?.excluded || [];
  for (const kw of excluded) {
    if (kw && lc(haystack).indexOf(lc(kw)) !== -1) {
      flags.red.push('industry_excluded');
      return 0;
    }
  }
  const included = icp.target_industries?.included || [];
  for (const kw of included) {
    if (kw && lc(haystack).indexOf(lc(kw)) !== -1) return max;
  }
  return Math.round((max * 7) / 15);
}

function scoreRevenueInRange(client: any, icp: any, max: number): number {
  const range = icp.revenue_range || {};
  const min = Number(range.min_usd) || 0;
  const maxRev = Number(range.max_usd) || Infinity;
  const revenue = resolveRevenueUsd(client);
  if (revenue == null) return Math.round(max / 2);
  if (revenue >= min && revenue <= maxRev) return max;
  if (revenue >= min * 0.75 && revenue <= maxRev * 1.25) return Math.round(max / 2);
  return 0;
}

function scoreGeographicFit(client: any, icp: any, max: number): number {
  const geo = icp.geographic_preference || {};
  const loc = client?.location ? String(client.location) : '';
  if (!loc) return 0;
  const lcLoc = lc(loc);
  if (lcLoc.indexOf('michigan') !== -1) return max;
  if (/\b(mi)\b/i.test(loc)) return max;
  let matched = false;
  for (const name of US_STATE_NAMES) if (lcLoc.indexOf(name) !== -1) { matched = true; break; }
  if (!matched) {
    for (const t of loc.split(/[\s,\.]+/).map((x) => x.trim().toUpperCase())) {
      if (t.length === 2 && US_STATES.has(t)) { matched = true; break; }
    }
  }
  if (matched) return geo.national_ok ? Math.round((max * 3) / 5) : 0;
  return 0;
}

function scoreGreenFlags(icp: any, client: any, signals: any, textBlob: string, cap: number, flags: Flags): number {
  let total = 0;
  for (const f of (icp.green_flags || [])) {
    const id = f.id; const weight = Number(f.weight) || 0;
    let matched = false;
    if (id === 'product_with_weak_marketing') {
      const hasIndustry = client?.industry;
      const quality = signals?.website_quality;
      if (hasIndustry && (quality == null || quality === 'basic')) matched = true;
    } else if (id === 'scaling_beyond_local') {
      if (containsAny(textBlob, ['scale', 'expand', 'grow'])) matched = true;
    } else if (id === 'needs_basic_assets') {
      if (signals && (signals.has_website === false || signals.has_social_media === false)) matched = true;
    }
    if (matched) { total += weight; flags.green.push(id); }
  }
  return Math.min(cap, total);
}

function scoreRedFlags(icp: any, textBlob: string, cap: number, flags: Flags): number {
  let total = 0;
  for (const f of (icp.red_flags || [])) {
    const id = f.id; const weight = Number(f.weight) || 0;
    let matched = false;
    if (id === 'unclear_everything_cheap') {
      const cheap = containsAny(textBlob, ['cheapest', 'cheap', 'lowest price', 'can you do it for']);
      const everything = containsAny(textBlob, ['everything', 'whole', 'full']);
      if (cheap && everything) matched = true;
    }
    if (matched) { total += weight; flags.red.push(id); }
  }
  // The original kept this clamp ladder; preserves identical behavior.
  if (total < cap) total = cap;
  if (total > 0) total = 0;
  return total;
}

function scoreReadiness(signals: any, max: number) {
  if (!signals) {
    return { score: Math.round(max / 2), details: { note: 'no marketing signals data' } };
  }
  const details: Record<string, number> = {};
  let raw = 0;
  if (signals.has_website === false) { details.no_website = 10; raw += 10; }
  if (signals.has_social_media === false) { details.no_social = 8; raw += 8; }
  if (signals.website_quality === 'basic') { details.weak_quality = 6; raw += 6; }
  if (signals.has_website === true && signals.has_seo === false) { details.no_seo = 4; raw += 4; }
  if (signals.has_paid_ads === false) { details.no_paid_ads = 2; raw += 2; }
  return { score: Math.min(max, raw), details };
}

async function scoreEngagement(supabase: SupabaseClient, clientId: number | string, max: number) {
  const { count } = await supabase
    .from('activities').select('*', { count: 'exact', head: true }).eq('client_id', clientId);
  const n = Number(count) || 0;
  let score: number; let bucket: string;
  if (n <= 2) { score = 0; bucket = '0-2'; }
  else if (n <= 5) { score = Math.round(max / 3); bucket = '3-5'; }
  else if (n <= 10) { score = Math.round((max * 2) / 3); bucket = '6-10'; }
  else { score = max; bucket = '11+'; }
  return { score, details: { activity_count: n, bucket } };
}

async function loadIcp(supabase: SupabaseClient): Promise<any> {
  const { data } = await supabase
    .from('integration_settings').select('config').eq('type', 'icp_config').maybeSingle();
  return { ...DEFAULT_ICP, ...(data?.config || {}) };
}

export interface FitScoreResult {
  score: number;
  breakdown: Record<string, { score: number; max: number; details: any }>;
  flags: Flags;
}

export async function scoreClient(
  supabase: SupabaseClient,
  clientId: number | string,
): Promise<FitScoreResult> {
  const { data: client, error } = await supabase
    .from('clients').select('*').eq('id', clientId).single();
  if (error || !client) throw new Error(`Client ${clientId} not found`);

  const icp = await loadIcp(supabase);
  const weights = icp.scoring_weights || DEFAULT_ICP.scoring_weights;
  const cfg = icp.icp_match_breakdown || DEFAULT_ICP.icp_match_breakdown;

  const flags: Flags = { green: [], red: [] };

  // Engagement notes feed the green/red flag keyword detector.
  const { data: engagements } = await supabase
    .from('engagements').select('notes, source_detail').eq('client_id', clientId);
  const engagementBlob = (engagements || [])
    .map((e) => [e.notes, e.source_detail].filter(Boolean).join(' '))
    .filter(Boolean).join(' \n ');
  const textBlob = [client.notes, engagementBlob].filter(Boolean).join(' \n ');

  const industry_match = scoreIndustryMatch(client, icp, cfg.industry_match || 15, flags);
  const revenue_in_range = scoreRevenueInRange(client, icp, cfg.revenue_in_range || 10);
  const geographic_fit = scoreGeographicFit(client, icp, cfg.geographic_fit || 5);

  // Signals come from client.enrichment_data (CSV import populates this; the
  // legacy acq_marketing_signals table is gone in v1.0).
  const signals = (client.enrichment_data && typeof client.enrichment_data === 'object')
    ? client.enrichment_data
    : null;

  const green_flag_bonus = scoreGreenFlags(icp, client, signals, textBlob, cfg.green_flag_points_cap || 10, flags);
  const red_flag_penalty = scoreRedFlags(icp, textBlob, cfg.red_flag_penalty_cap || -15, flags);

  const icpRaw = industry_match + revenue_in_range + geographic_fit + green_flag_bonus + red_flag_penalty;
  const icpScore = Math.max(0, icpRaw);

  const readiness = scoreReadiness(signals, weights.readiness_signals || 30);
  const engagement = await scoreEngagement(supabase, clientId, weights.engagement || 30);

  const breakdown = {
    icp_match: {
      score: icpScore,
      max: weights.icp_match || 40,
      details: { industry_match, revenue_in_range, geographic_fit, green_flag_bonus, red_flag_penalty },
    },
    readiness_signals: { score: readiness.score, max: weights.readiness_signals || 30, details: readiness.details },
    engagement: { score: engagement.score, max: weights.engagement || 30, details: engagement.details },
  };

  let total = Math.round(icpScore + readiness.score + engagement.score);
  if (total < 0) total = 0;
  if (total > 100) total = 100;

  // Best-effort writeback so the next list view shows the score without
  // recomputing.
  await supabase
    .from('clients')
    .update({ fit_score: total, fit_score_breakdown: { breakdown, flags } })
    .eq('id', clientId);

  return { score: total, breakdown, flags };
}
