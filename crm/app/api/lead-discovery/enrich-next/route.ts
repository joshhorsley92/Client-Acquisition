// POST /api/lead-discovery/enrich-next
// Body: { job_id, batch_size? }
// Phase 2 worker. Picks N candidates with status='discovered' for the job,
// enriches them one at a time, updates rows. Each invocation is bounded by
// the batch_size + per-candidate fetch timeout, so it fits in a Netlify
// Function's 10s budget. The UI fires this on each poll tick until the
// 'discovered' count hits zero.
//
// Concurrency safety: we claim candidates with an UPDATE that filters on
// status='discovered' and bumps to 'enriching' atomically. Two concurrent
// callers can't grab the same row.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { EnrichNextSchema } from '@/lib/schemas';
import { enrichCandidate } from '@/services/lead-discovery/enrichment';

// 1 candidate per invocation. With FETCH_TIMEOUT_MS=8000 in enrichment.ts,
// one fetch fits comfortably under the Netlify Free 10s function ceiling.
// The polling loop calls this endpoint more often to keep throughput up.
const DEFAULT_BATCH = 1;

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let body;
  try { body = EnrichNextSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid body' }, { status: 400 });
  }

  // Use the service-role client for the claim-and-update so the UPDATE...
  // RETURNING isn't blocked by RLS edge cases, and so subsequent writeback
  // doesn't depend on the user's session lifetime.
  const sb = createServiceRoleClient();
  const batchSize = body.batch_size ?? DEFAULT_BATCH;

  // Claim a batch atomically: update the first N pending rows to 'enriching'
  // and return them. RPC would be cleanest but we don't have one defined,
  // so do a select-then-update; protected by the per-row status check.
  const { data: pending } = await sb
    .from('lead_candidates')
    .select('id, name, website, email, google_rating, google_reviews_ct')
    .eq('job_id', body.job_id)
    .eq('status', 'discovered')
    .order('id', { ascending: true })
    .limit(batchSize);

  if (!pending || pending.length === 0) {
    // Nothing to do — finalize the job if it's still in 'enriching'.
    await sb.from('scrape_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', body.job_id).eq('status', 'enriching');

    return NextResponse.json({ enriched: 0, remaining: 0, finalized: true });
  }

  const claimedIds = pending.map((p) => p.id);
  const { data: claimed } = await sb
    .from('lead_candidates')
    .update({ status: 'enriching' })
    .in('id', claimedIds)
    .eq('status', 'discovered')
    .select('id');
  const claimedSet = new Set((claimed ?? []).map((r) => r.id));

  let enriched = 0;
  for (const cand of pending) {
    if (!claimedSet.has(cand.id)) continue; // another worker grabbed it
    try {
      const res = await enrichCandidate({
        website: cand.website,
        google_rating: cand.google_rating,
        google_reviews_ct: cand.google_reviews_ct,
        email: cand.email,
      });
      await sb.from('lead_candidates').update({
        enrichment_data: res.enrichment_data,
        opportunity_signals: res.opportunity_signals,
        opportunity_score: res.opportunity_score,
        email: res.email ?? cand.email ?? null,
        status: 'enriched',
        enriched_at: new Date().toISOString(),
      }).eq('id', cand.id);
      enriched++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await sb.from('lead_candidates').update({
        status: 'failed',
        enrich_error: msg.slice(0, 500),
        enriched_at: new Date().toISOString(),
      }).eq('id', cand.id);
    }
  }

  // Bump the job's enriched_count by what we actually finished.
  if (enriched > 0) {
    const { data: cur } = await sb
      .from('scrape_jobs')
      .select('enriched_count')
      .eq('id', body.job_id)
      .single();
    await sb.from('scrape_jobs').update({
      enriched_count: (cur?.enriched_count ?? 0) + enriched,
    }).eq('id', body.job_id);
  }

  // How many remain
  const { count: remaining } = await sb
    .from('lead_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', body.job_id)
    .eq('status', 'discovered');

  let finalized = false;
  if ((remaining ?? 0) === 0) {
    const { count: stillEnriching } = await sb
      .from('lead_candidates')
      .select('id', { head: true, count: 'exact' })
      .eq('job_id', body.job_id)
      .eq('status', 'enriching');
    if ((stillEnriching ?? 0) === 0) {
      await sb.from('scrape_jobs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', body.job_id).eq('status', 'enriching');
      finalized = true;
    }
  }

  return NextResponse.json({
    enriched,
    remaining: remaining ?? 0,
    finalized,
  });
}
