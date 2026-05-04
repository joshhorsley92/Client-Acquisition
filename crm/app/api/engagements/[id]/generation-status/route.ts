// GET /api/engagements/:id/generation-status — list jobs + return active one for polling

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  const { data: jobs, error } = await supabase
    .from('generation_jobs')
    .select('*')
    .eq('engagement_id', id)
    .order('started_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const active = (jobs || []).find((j) => j.status === 'running') || null;
  return NextResponse.json({ jobs: jobs || [], activeJob: active });
}
