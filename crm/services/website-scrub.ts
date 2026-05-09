// Website Scrub — fetch a client's homepage, extract its text content,
// and ask Claude to fill in as many CRM fields + Brand Profile fields
// as the page substantiates.
//
// Used by the "Scrub website" button on the client detail page. Pairs with
// the existing enrichCandidate() (cheerio signal analysis) — they're both
// called by the API route. They are intentionally independent: this function
// is the Claude-driven extraction; enrichCandidate is the deterministic
// signal/contact extraction.
//
// Returns null fields where the website doesn't substantiate the data —
// the route applies fill-blanks-only semantics on the client side.

import * as cheerio from 'cheerio';
import { extractBrandProfile, type ExtractionResult } from './brand-profile-extractor';

const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
// Cap how much text we ship to Claude. Most homepages have plenty of signal
// in the first ~25KB; trimming keeps token cost bounded for sites with
// huge embedded JSON or repeated boilerplate.
const MAX_TEXT_CHARS = 25_000;

// Sonnet, not Opus, for the website path. Opus is overkill for "skim a
// homepage and infer the obvious"; Sonnet is ~3x cheaper and 2x faster.
const SCRUB_MODEL = 'claude-sonnet-4-6';

export interface ScrubResult {
  ok: boolean;
  reason?: string;
  source_url?: string;
  fetched_url?: string;
  http_status?: number;
  extraction?: ExtractionResult;
  page_text_length?: number;
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

async function fetchPage(url: string): Promise<{ ok: true; res: Response; text: string } | { ok: false; reason: string; status?: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}`, status: res.status };
    }
    const text = await res.text();
    return { ok: true, res, text };
  } catch (err) {
    const e = err as Error & { cause?: { code?: string; message?: string } };
    return { ok: false, reason: `${e.cause?.code || e.name}: ${e.cause?.message || e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

// Cloudflare's "email obfuscation" wraps emails in
//   <a class="__cf_email__" data-cfemail="HEX">[email protected]</a>
// where HEX is the email XOR-encoded with a leading-byte key. The real
// email is restored by Cloudflare's JS in the browser; we have to decode
// it server-side or Claude (and cheerio's text scan) will see literal
// "[email protected]" placeholders instead of the real address.
function decodeCloudflareEmail(encoded: string): string | null {
  if (!/^[0-9a-f]+$/i.test(encoded) || encoded.length < 4 || encoded.length % 2 !== 0) return null;
  try {
    const key = parseInt(encoded.slice(0, 2), 16);
    let out = '';
    for (let i = 2; i < encoded.length; i += 2) {
      out += String.fromCharCode(parseInt(encoded.slice(i, i + 2), 16) ^ key);
    }
    return out.includes('@') ? out : null;
  } catch {
    return null;
  }
}

function decloakCloudflareEmails($: cheerio.CheerioAPI): void {
  $('[data-cfemail]').each((_, el) => {
    const enc = $(el).attr('data-cfemail');
    if (!enc) return;
    const real = decodeCloudflareEmail(enc);
    if (!real) return;
    $(el).text(real);
    const href = $(el).attr('href');
    if (href && /email-protection/i.test(href)) {
      $(el).attr('href', `mailto:${real}`);
    }
  });
  // Some Cloudflare configs use href="/cdn-cgi/l/email-protection#HEX" with
  // visible "[email protected]" text but no data-cfemail attribute on the
  // element. Catch those too.
  $('a[href*="/cdn-cgi/l/email-protection#"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const hashIdx = href.indexOf('#');
    if (hashIdx === -1) return;
    const real = decodeCloudflareEmail(href.slice(hashIdx + 1));
    if (!real) return;
    $(el).text(real);
    $(el).attr('href', `mailto:${real}`);
  });
}

// Extract human-readable text from HTML — strip script/style/SVG, collapse
// whitespace, prefer visible content, prepend the title + meta description
// so Claude has the most-signal-dense parts up front.
function extractPageText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, svg, noscript, template, iframe').remove();
  decloakCloudflareEmails($);

  const title = ($('head > title').first().text() || '').trim();
  const metaDesc = ($('meta[name="description"]').attr('content') || '').trim();
  const ogDesc = ($('meta[property="og:description"]').attr('content') || '').trim();
  const h1s = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean);

  // Body text — collapse whitespace, drop empty lines.
  const bodyText = ($('body').text() || '')
    .replace(/[ ​]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join('\n');

  const header = [
    title && `TITLE: ${title}`,
    metaDesc && `META DESCRIPTION: ${metaDesc}`,
    ogDesc && ogDesc !== metaDesc && `OG DESCRIPTION: ${ogDesc}`,
    h1s.length > 0 && `H1S: ${h1s.join(' | ')}`,
  ].filter(Boolean).join('\n');

  const combined = header ? `${header}\n\n---\n\n${bodyText}` : bodyText;
  return combined.length > MAX_TEXT_CHARS
    ? combined.slice(0, MAX_TEXT_CHARS) + '\n\n[truncated]'
    : combined;
}

export async function scrubWebsite(websiteRaw: string): Promise<ScrubResult> {
  const url = normalizeUrl(websiteRaw);
  if (!url) return { ok: false, reason: 'invalid URL' };

  const fetched = await fetchPage(url);
  if (!fetched.ok) {
    return {
      ok: false,
      reason: fetched.reason,
      http_status: fetched.status,
      source_url: url,
    };
  }

  const text = extractPageText(fetched.text);
  if (text.length < 100) {
    return {
      ok: false,
      reason: 'page returned almost no text content (JS-rendered SPA?)',
      source_url: url,
      fetched_url: fetched.res.url,
      page_text_length: text.length,
    };
  }

  const extraction = await extractBrandProfile(text, {
    source: 'website',
    model: SCRUB_MODEL,
  });

  return {
    ok: true,
    source_url: url,
    fetched_url: fetched.res.url,
    http_status: fetched.res.status,
    page_text_length: text.length,
    extraction,
  };
}
