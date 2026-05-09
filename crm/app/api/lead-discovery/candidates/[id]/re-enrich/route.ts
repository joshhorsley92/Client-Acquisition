// POST /api/lead-discovery/candidates/[id]/re-enrich
// Re-runs the enrichment pipeline against an already-enriched candidate.
// Useful when the enrichment code itself changes (new signals, tuned timeouts,
// updated User-Agent) — without this, candidates discovered before the change
// keep their stale data because the (source, source_id) UNIQUE constraint
// blocks re-discovery.
//
// Same per-candidate budget as /enrich-next — one fetch with FETCH_TIMEOUT_MS,
// well under the Netlify 10s function ceiling.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { enrichCandidate } from '@/services/lead-discovery/enrichment';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { id } = await params;
  const candidateId = Number(id);
  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    return NextResponse.json({ error: 'Invalid candidate id' }, { status: 400 });
  }

  const { data: candidate } = await supabase
    .from('lead_candidates')
    .select('*')
    .eq('id', candidateId)
    .maybeSingle();
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  if (candidate.status === 'promoted') {
    return NextResponse.json({ error: 'Candidate is already promoted' }, { status: 409 });
  }

  try {
    const res = await enrichCandidate({
      website: candidate.website,
      google_rating: candidate.google_rating,
      google_reviews_ct: candidate.google_reviews_ct,
      email: candidate.email,
    });
    const { data: updated, error } = await supabase
      .from('lead_candidates')
      .update({
        enrichment_data: res.enrichment_data,
        opportunity_signals: res.opportunity_signals,
        opportunity_score: res.opportunity_score,
        email: res.email ?? candidate.email ?? null,
        status: 'enriched',
        enrich_error: null,
        enriched_at: new Date().toISOString(),
      })
      .eq('id', candidateId)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ candidate: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from('lead_candidates').update({
      status: 'failed',
      enrich_error: msg.slice(0, 500),
      enriched_at: new Date().toISOString(),
    }).eq('id', candidateId);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
