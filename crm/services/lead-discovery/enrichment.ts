// Per-candidate website enrichment. Given a candidate's website URL, fetch
// the homepage (and lightly probe /about, /contact for emails) and analyze
// the markup for weakness signals — those are TKBS's sales angles.
//
// Returns an enrichment_data blob shaped to match crm.clients.enrichment_data
// (so a promoted candidate's blob slots in cleanly), plus opportunity_signals
// (an array of detected weaknesses) and an opportunity_score (sum of weights).
//
// Time budget: ~3-5 seconds per candidate at the outside. Fetches use
// AbortController with a short timeout so a slow site doesn't pin a Netlify
// Function until the platform kills it.

import * as cheerio from 'cheerio';
import { scoreOpportunity, type OpportunitySignal } from './scoring';

// 8s timeout: shared-hosting small-business sites routinely take 4-6s to
// first byte. With batch_size=1 in /enrich-next we still fit in Netlify's
// 10s function budget. Bump this carefully.
const FETCH_TIMEOUT_MS = 8000;
// Many sites block obvious bot UAs (Cloudflare bot fight mode, basic WAFs).
// A real Chrome UA gets through almost everywhere — we're not hammering
// these sites, one GET per candidate, so this is well within polite use.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export interface EnrichmentResult {
  enrichment_data: Record<string, unknown>;
  opportunity_signals: OpportunitySignal[];
  opportunity_score: number;
  email?: string | null;
}

interface EnrichmentInput {
  website?: string | null;
  google_rating?: number | null;
  google_reviews_ct?: number | null;
  email?: string | null;
}

type FetchOutcome =
  | { ok: true; res: Response }
  | { ok: false; reason: string };

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS): Promise<FetchOutcome> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      // Bypass Next.js's data-fetching cache layer — its wrapper around
      // global fetch can throw on outbound calls that work in plain Node.
      cache: 'no-store',
    });
    return { ok: true, res };
  } catch (err) {
    const e = err as Error & { cause?: { code?: string; message?: string } };
    const code = e.cause?.code || e.name || 'fetch_error';
    const msg = e.cause?.message || e.message || 'unknown';
    console.error('[enrichment] fetch failed', { url, code, msg });
    return { ok: false, reason: `${code}: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUrl(raw: string): string | null {
  let url = raw.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

const SOCIAL_HOSTS: Record<string, string> = {
  'instagram.com': 'instagram',
  'facebook.com': 'facebook',
  'linkedin.com': 'linkedin',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  'tiktok.com': 'tiktok',
  'youtube.com': 'youtube',
  'pinterest.com': 'pinterest',
};

function detectSocialPlatforms($: cheerio.CheerioAPI): string[] {
  const platforms = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = String($(el).attr('href') || '').toLowerCase();
    for (const [host, platform] of Object.entries(SOCIAL_HOSTS)) {
      if (href.includes(host)) platforms.add(platform);
    }
  });
  return [...platforms];
}

// Returns the set of ad/analytics tracker keys detected. More trackers
// (especially Google Ads / FB Pixel / TikTok Pixel) ⇒ business is already
// running paid acquisition.
function detectAdTrackers(html: string): string[] {
  const trackers = new Set<string>();
  if (/googletagmanager\.com\/gtag\/js/i.test(html) || /gtag\(/i.test(html)) trackers.add('google_analytics');
  if (/google_conversion|googleads\.g\.doubleclick|googleadservices\.com/i.test(html)) trackers.add('google_ads');
  if (/connect\.facebook\.net|fbq\(/i.test(html)) trackers.add('facebook_pixel');
  if (/snap\.licdn\.com|_linkedin_partner_id/i.test(html)) trackers.add('linkedin_insight');
  if (/analytics\.tiktok\.com|ttq\.load/i.test(html)) trackers.add('tiktok_pixel');
  if (/static\.ads-twitter\.com|twq\(/i.test(html)) trackers.add('twitter_pixel');
  return [...trackers];
}

function emailRegex(): RegExp {
  // Standard-ish RFC-pragmatic email regex. Excludes obvious junk like
  // a@b (no TLD) and triple-dot tlds. Does not catch every edge case.
  return /(?:[a-zA-Z0-9_.+-])+@(?:[a-zA-Z0-9-])+(?:\.[a-zA-Z0-9-]+)+/g;
}

function extractEmails(html: string, $: cheerio.CheerioAPI): string[] {
  const emails = new Set<string>();
  // mailto: links are the most reliable
  $('a[href^="mailto:"]').each((_, el) => {
    const href = String($(el).attr('href') || '');
    const addr = href.replace(/^mailto:/i, '').split('?')[0]?.trim();
    if (addr) emails.add(addr.toLowerCase());
  });
  // Body text scan as a fallback
  const matches = html.match(emailRegex()) || [];
  for (const m of matches) emails.add(m.toLowerCase());

  // Drop common no-go addresses
  return [...emails].filter((e) => {
    const local = e.split('@')[0] ?? '';
    if (/(noreply|no-reply|postmaster|webmaster|do[-_]?not[-_]?reply|admin|root|abuse|mailer)/i.test(local)) return false;
    if (/\.(png|jpe?g|gif|svg|webp|woff2?|ttf|css|js)$/i.test(e)) return false; // false-positive from filenames
    return true;
  });
}

function extractPhones(html: string): string[] {
  const phones = new Set<string>();
  // Look for tel: links first
  const telMatches = html.match(/tel:\+?[\d\s().-]{7,}/gi) || [];
  for (const m of telMatches) {
    const num = m.replace(/^tel:/i, '').replace(/[^\d+]/g, '');
    if (num.length >= 7) phones.add(num);
  }
  return [...phones];
}

export async function enrichCandidate(input: EnrichmentInput): Promise<EnrichmentResult> {
  const websiteRaw = input.website || null;
  const websiteUrl = websiteRaw ? normalizeUrl(websiteRaw) : null;

  // No website is itself a strong opportunity signal — done in 1 step.
  if (!websiteUrl) {
    const signals: OpportunitySignal[] = ['no_website'];
    if (input.google_rating != null && input.google_rating < 3.5) signals.push('low_google_rating');
    if (input.google_reviews_ct != null && input.google_reviews_ct < 20) signals.push('low_google_review_count');
    return {
      enrichment_data: { has_website: false, source: 'discovery_v2' },
      opportunity_signals: signals,
      opportunity_score: scoreOpportunity(signals),
      email: input.email ?? null,
    };
  }

  const outcome = await fetchWithTimeout(websiteUrl);
  if (!outcome.ok || !outcome.res.ok) {
    // Reachable site that errors is treated as "has_website but broken"
    // — still a sales signal.
    const signals: OpportunitySignal[] = ['website_unreachable'];
    if (input.google_rating != null && input.google_rating < 3.5) signals.push('low_google_rating');
    if (input.google_reviews_ct != null && input.google_reviews_ct < 20) signals.push('low_google_review_count');
    return {
      enrichment_data: {
        has_website: true,
        website_reachable: false,
        http_status: outcome.ok ? outcome.res.status : null,
        fetch_failure_reason: outcome.ok ? null : outcome.reason,
        source: 'discovery_v2',
      },
      opportunity_signals: signals,
      opportunity_score: scoreOpportunity(signals),
      email: input.email ?? null,
    };
  }

  const res = outcome.res;
  const html = await res.text();
  const $ = cheerio.load(html);

  const hasViewport = $('meta[name="viewport"]').length > 0;
  const hasMetaDesc = $('meta[name="description"]').first().attr('content')?.trim() || '';
  const hasOgTitle = $('meta[property="og:title"]').length > 0;
  const hasStructuredData = $('script[type="application/ld+json"]').length > 0;
  const isHtml5 = /<!doctype\s+html\s*>/i.test(html);
  const imgCount = $('img').length;
  const imgWithAlt = $('img[alt]').filter((_, el) => Boolean($(el).attr('alt')?.trim())).length;
  const altCoverage = imgCount === 0 ? 1 : imgWithAlt / imgCount;

  const socialPlatforms = detectSocialPlatforms($);
  const adTrackers = detectAdTrackers(html);

  const emails = extractEmails(html, $);
  const phones = extractPhones(html);

  const signals: OpportunitySignal[] = [];
  if (adTrackers.length === 0) signals.push('no_paid_ads');
  if (socialPlatforms.length === 0) signals.push('no_social_media');
  if (!hasMetaDesc || !hasOgTitle) signals.push('poor_seo');
  if (!hasViewport || !isHtml5) signals.push('outdated_website');
  if (altCoverage < 0.5 && imgCount > 0) signals.push('poor_accessibility');
  if (input.google_rating != null && input.google_rating < 3.5) signals.push('low_google_rating');
  if (input.google_reviews_ct != null && input.google_reviews_ct < 20) signals.push('low_google_review_count');

  // Determine website quality bucket for a coarse-grained label
  let website_quality: 'professional' | 'basic' | 'outdated';
  if (hasViewport && hasMetaDesc && hasOgTitle && altCoverage >= 0.5) website_quality = 'professional';
  else if (hasViewport || hasMetaDesc) website_quality = 'basic';
  else website_quality = 'outdated';

  const enrichment_data = {
    source: 'discovery_v2',
    has_website: true,
    website_reachable: true,
    website_quality,
    has_seo: Boolean(hasMetaDesc && hasOgTitle),
    has_structured_data: hasStructuredData,
    has_viewport_meta: hasViewport,
    is_html5: isHtml5,
    alt_coverage_pct: Math.round(altCoverage * 100),
    has_social_media: socialPlatforms.length > 0,
    social_platforms: socialPlatforms,
    has_paid_ads: adTrackers.length > 0,
    ad_trackers: adTrackers,
    extracted_emails: emails,
    extracted_phones: phones,
  };

  return {
    enrichment_data,
    opportunity_signals: signals,
    opportunity_score: scoreOpportunity(signals),
    email: input.email || emails[0] || null,
  };
}
