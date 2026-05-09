// POST /api/lead-discovery/run
// Body: { source, filters }
// Phase 1 of the discovery pipeline. Calls the chosen source's discover()
// (e.g., Google Places search), bulk-inserts candidates with status='discovered',
// creates the scrape_jobs row with status='enriching' if any landed, returns
// job_id. The UI then polls /job/[id] and fires /enrich-next until done.
//
// This endpoint must finish inside the Netlify Function timeout — typically
// one Places API call + one bulk insert, so well under 10s.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import { LeadDiscoveryRunSchema } from '@/lib/schemas';
import { SOURCES } from '@/services/lead-discovery/registry';

export async function POST(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  let body;
  try { body = LeadDiscoveryRunSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid body' }, { status: 400 });
  }

  const source = SOURCES[body.source];
  if (!source) {
    return NextResponse.json(
      { error: `Unknown source: ${body.source}. Available: ${Object.keys(SOURCES).join(', ')}` },
      { status: 400 },
    );
  }
  if (!source.isAvailable()) {
    return NextResponse.json(
      { error: `Source ${body.source} is not configured (missing API key or env var).` },
      { status: 503 },
    );
  }

  // Create the job row immediately so we can return an id even if discover()
  // fails — the UI shows the failure state instead of a network error.
  const { data: job, error: jobErr } = await supabase
    .from('scrape_jobs')
    .insert({
      source: body.source,
      status: 'discovering',
      params: body.filters,
      started_by: auth.userId,
    })
    .select('*')
    .single();
  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message || 'Failed to create job' }, { status: 500 });
  }

  let candidates;
  try {
    candidates = await source.discover(body.filters);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from('scrape_jobs').update({
      status: 'failed',
      error: msg,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id);
    return NextResponse.json({ error: msg, job_id: job.id }, { status: 502 });
  }

  // Bulk insert. ON CONFLICT (source, source_id) DO NOTHING dedups against
  // prior runs.
  let insertedCount = 0;
  if (candidates.length > 0) {
    const rows = candidates.map((c) => ({
      job_id: job.id,
      source: body.source,
      source_id: c.source_id,
      name: c.name,
      website: c.website ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      address: c.address ?? null,
      city: c.city ?? null,
      state: c.state ?? null,
      zip: c.zip ?? null,
      industry: c.industry ?? null,
      google_rating: c.google_rating ?? null,
      google_reviews_ct: c.google_reviews_ct ?? null,
      google_types: c.google_types ?? [],
      status: 'discovered',
    }));

    // Supabase JS doesn't expose an explicit ON CONFLICT clause; the
    // `upsert` method with ignoreDuplicates=true on a UNIQUE-indexed
    // (source, source_id) gives us the same behavior.
    const { data: inserted, error: insErr } = await supabase
      .from('lead_candidates')
      .upsert(rows, { onConflict: 'source,source_id', ignoreDuplicates: true })
      .select('id');
    if (insErr) {
      await supabase.from('scrape_jobs').update({
        status: 'failed',
        error: `Insert failed: ${insErr.message}`,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);
      return NextResponse.json({ error: insErr.message, job_id: job.id }, { status: 500 });
    }
    insertedCount = inserted?.length ?? 0;
  }

  // Move job to 'enriching' if anything landed; otherwise mark complete now.
  const nextStatus = insertedCount > 0 ? 'enriching' : 'completed';
  await supabase.from('scrape_jobs').update({
    status: nextStatus,
    discovered_count: insertedCount,
    completed_at: nextStatus === 'completed' ? new Date().toISOString() : null,
  }).eq('id', job.id);

  await audit({
    userId: auth.userId,
    action: 'run_lead_discovery',
    resourceType: 'scrape_job',
    resourceId: job.id,
    metadata: {
      source: body.source,
      filters: body.filters,
      discovered: insertedCount,
      total_returned: candidates.length,
    },
    request: req,
  });

  return NextResponse.json({
    job_id: job.id,
    status: nextStatus,
    discovered: insertedCount,
    total_returned: candidates.length,
    duplicates_skipped: candidates.length - insertedCount,
  });
}
