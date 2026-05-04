// GET /api/automations/job/:id — poll for job status + output

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  const { data, error } = await supabase
    .from('generation_jobs').select('*').eq('id', id).single();
  if (error || !data) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json({ job: data });
}
