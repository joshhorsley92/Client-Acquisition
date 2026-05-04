// POST /api/clients/:id/fit-score/recompute
// Recomputes the Fit Score from scratch and writes it back to clients.fit_score
// + clients.fit_score_breakdown. Returns the result.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { scoreClient } from '@/services/fit-score';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  try {
    const out = await scoreClient(supabase, id);
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Fit score computation failed' },
      { status: 500 },
    );
  }
}
