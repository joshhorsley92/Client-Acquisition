// POST /api/clients/[id]/scrub-website
// Fetches the client's website, runs the Claude-driven extraction (basic
// fields + Brand Profile) AND the deterministic cheerio enrichment in
// parallel, and writes a fill-blanks-only update back to the client row.
//
// Fill-blanks-only:
//   - Basic CRM fields (industry, location, type, etc.) only get set if
//     the existing column is null/empty.
//   - Brand profile leaf paths only get set if the existing leaf is empty
//     AND not tagged 'manual' in brand_profile_sources. New paths are
//     tagged 'website:<hostname>'.
//
// Returns a summary so the UI can toast "Filled X fields from website".

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import { scrubWebsite } from '@/services/website-scrub';
import { enrichCandidate } from '@/services/lead-discovery/enrichment';
import { flattenPaths, getByPath, setByPath } from '@/services/brand-profile-merge';

const BASIC_FIELD_MAP: Record<string, string> = {
  // basic_fields key from Claude → crm.clients column
  type: 'type',
  employee_count: 'employee_count',
  revenue_estimate: 'revenue_estimate',
  primary_contact_name: 'primary_contact_name',
  primary_contact_role: 'role',
  primary_email: 'email',
  primary_phone: 'phone',
};

const VALID_TYPES = new Set(['B2B', 'B2C']);

function isEmpty(v: unknown): boolean {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

// Catches Cloudflare's "email obfuscation" placeholder when the decloak
// step misses it (e.g., the page uses a non-standard wrapper). Without
// this, Claude faithfully returns "[email protected]" as the email.
function isPlaceholder(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return s === '[email protected]'
    || /^\[\s*email\s*protected\s*\]$/i.test(s)
    || /\bemail\s*protected\b/i.test(s);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });
  }

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  if (!client.website || !String(client.website).trim()) {
    return NextResponse.json(
      { error: 'Client has no website set. Add a website URL first.' },
      { status: 400 },
    );
  }

  // Fire both pipelines concurrently. They're independent fetches but
  // typically hit cached responses for the second one.
  const [scrub, enrichment] = await Promise.all([
    scrubWebsite(client.website).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false as const, reason: msg };
    }),
    enrichCandidate({
      website: client.website,
      google_rating: null,
      google_reviews_ct: null,
      email: client.email ?? null,
    }).catch(() => null),
  ]);

  if (!scrub.ok) {
    return NextResponse.json(
      {
        error: `Website scrub failed: ${scrub.reason || 'unknown error'}`,
        source_url: 'source_url' in scrub ? scrub.source_url : undefined,
      },
      { status: 502 },
    );
  }

  // Build a fill-blanks-only patch for crm.clients columns.
  const patch: Record<string, unknown> = {};
  const filled: string[] = [];
  const skipped: string[] = [];

  const ext = scrub.extraction;
  const basic = (ext?.basic_fields ?? {}) as Record<string, unknown>;

  // Top-of-card basic fields from the schema's `profile` (industry,
  // business_name, location_city/state).
  const profile = (ext?.profile ?? {}) as Record<string, unknown>;
  if (isEmpty(client.name) && typeof profile.business_name === 'string' && profile.business_name) {
    patch.name = profile.business_name;
    filled.push('name');
  }
  if (isEmpty(client.industry) && typeof profile.industry === 'string' && profile.industry) {
    patch.industry = profile.industry;
    filled.push('industry');
  } else if (!isEmpty(client.industry) && profile.industry) {
    skipped.push('industry');
  }

  // location is a single column on clients; combine city+state from the
  // extracted location, or basic_fields if Claude returned it there.
  if (isEmpty(client.location)) {
    const city = (profile.location_city as string) || (basic.location_city as string) || '';
    const state = (profile.location_state as string) || (basic.location_state as string) || '';
    const composed = [city, state].filter((s) => s && s.trim()).join(', ');
    if (composed) {
      patch.location = composed;
      filled.push('location');
    }
  }

  // basic_fields → simple column mapping
  for (const [extKey, col] of Object.entries(BASIC_FIELD_MAP)) {
    const incoming = basic[extKey];
    if (isEmpty(incoming) || typeof incoming !== 'string') continue;
    if (isPlaceholder(incoming)) continue; // skip "[email protected]" etc.
    if (col === 'type' && !VALID_TYPES.has(incoming)) continue; // schema check
    const current = (client as Record<string, unknown>)[col];
    // Treat existing placeholder values (left over from a prior scrub
    // that hit Cloudflare obfuscation) as empty so re-scrub can correct.
    if (isEmpty(current) || isPlaceholder(current)) {
      patch[col] = incoming;
      filled.push(col);
    } else {
      skipped.push(col);
    }
  }

  // Cheerio fallbacks for phone/email when Claude didn't surface them
  // (or returned a Cloudflare placeholder we just filtered out). Treat
  // existing placeholder column values as empty too, so a stale
  // "[email protected]" gets corrected on re-scrub.
  const clientPhone = isPlaceholder(client.phone) ? null : client.phone;
  const clientEmail = isPlaceholder(client.email) ? null : client.email;
  if (isEmpty(patch.phone) && isEmpty(clientPhone) && enrichment) {
    const phones = (enrichment.enrichment_data as Record<string, unknown>).extracted_phones as
      | string[]
      | undefined;
    if (phones && phones[0]) {
      patch.phone = phones[0];
      if (!filled.includes('phone')) filled.push('phone');
    }
  }
  if (isEmpty(patch.email) && isEmpty(clientEmail) && enrichment?.email && !isPlaceholder(enrichment.email)) {
    patch.email = enrichment.email;
    if (!filled.includes('email')) filled.push('email');
  }

  // Brand profile fill-blanks-only merge.
  let host = '';
  try { host = new URL(scrub.source_url || client.website).hostname; } catch { host = 'website'; }
  const sourceTag = `website:${host}`;

  const existingProfile = (client.brand_profile ?? {}) as Record<string, unknown>;
  const existingSources = (client.brand_profile_sources ?? {}) as Record<string, string>;
  const nextProfile: Record<string, unknown> = JSON.parse(JSON.stringify(existingProfile));
  const nextSources: Record<string, string> = { ...existingSources };
  const brandFilled: string[] = [];
  const brandSkipped: string[] = [];

  for (const path of flattenPaths(profile)) {
    const incoming = getByPath(profile, path);
    if (isEmpty(incoming)) continue;
    if (nextSources[path] === 'manual') { brandSkipped.push(path); continue; }
    const current = getByPath(nextProfile, path);
    if (Array.isArray(current) && Array.isArray(incoming)) {
      // union arrays (still respects 'manual' since we already skipped above)
      const union = Array.from(new Set([...current, ...incoming]));
      if (union.length > current.length) {
        setByPath(nextProfile, path, union);
        nextSources[path] = sourceTag;
        brandFilled.push(path);
      }
      continue;
    }
    if (isEmpty(current)) {
      setByPath(nextProfile, path, incoming);
      nextSources[path] = sourceTag;
      brandFilled.push(path);
    } else {
      brandSkipped.push(path);
    }
  }

  if (brandFilled.length > 0) {
    patch.brand_profile = nextProfile;
    patch.brand_profile_sources = nextSources;
  }

  // Always update enrichment data — it's purely additive (the cheerio
  // signals don't conflict with anything the user typed) and useful even
  // when no other field changed.
  if (enrichment) {
    patch.enrichment_data = enrichment.enrichment_data;
    patch.enrichment_status = 'succeeded';
  }

  if (Object.keys(patch).length > 0) {
    const { error: updErr } = await supabase
      .from('clients')
      .update(patch)
      .eq('id', clientId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  const { data: updated } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  await audit({
    userId: auth.userId,
    action: 'extract_brand_profile',
    resourceType: 'client',
    resourceId: clientId,
    metadata: {
      origin: 'website_scrub',
      source_url: scrub.source_url,
      fields_filled: filled,
      fields_skipped: skipped,
      brand_paths_filled: brandFilled.length,
      brand_paths_skipped: brandSkipped.length,
      page_text_length: scrub.page_text_length,
    },
    request: req,
  });

  return NextResponse.json({
    client: updated,
    summary: {
      fields_filled: filled,
      fields_skipped: skipped,
      brand_paths_filled: brandFilled,
      brand_paths_skipped: brandSkipped,
      enrichment_applied: Boolean(enrichment),
      source_url: scrub.source_url,
      fetched_url: scrub.fetched_url,
    },
  });
}
