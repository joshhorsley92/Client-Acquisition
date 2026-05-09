// GET /api/lead-discovery/candidates
// Query: ?status=enriched&job_id=&min_score=&limit=&source=
// Returns a list of lead candidates, sorted by opportunity_score desc.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const jobId = url.searchParams.get('job_id');
  const minScore = url.searchParams.get('min_score');
  const source = url.searchParams.get('source');
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 100, 1), 500) : 200;

  let q = supabase
    .from('lead_candidates')
    .select('*')
    .order('opportunity_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);
  if (jobId) q = q.eq('job_id', Number(jobId));
  if (source) q = q.eq('source', source);
  if (minScore) q = q.gte('opportunity_score', Number(minScore));

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ candidates: data ?? [] });
}
