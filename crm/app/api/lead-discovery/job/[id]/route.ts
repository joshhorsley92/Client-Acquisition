// GET /api/lead-discovery/job/[id]
// Returns the job row + counts of candidates by status. Drives the UI poll.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const { data: job } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  // Count candidates per status for this job
  const { data: rows } = await supabase
    .from('lead_candidates')
    .select('status')
    .eq('job_id', jobId);

  const counts: Record<string, number> = {
    discovered: 0, enriching: 0, enriched: 0, dismissed: 0, promoted: 0, failed: 0,
  };
  for (const r of rows ?? []) {
    if (r.status in counts) counts[r.status as keyof typeof counts]++;
  }

  return NextResponse.json({ job, counts });
}
