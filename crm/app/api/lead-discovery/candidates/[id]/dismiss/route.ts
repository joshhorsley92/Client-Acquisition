// POST /api/lead-discovery/candidates/[id]/dismiss
// Marks a candidate as 'dismissed' so it stops appearing in the triage feed.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { audit } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  const { id } = await params;
  const candidateId = Number(id);
  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    return NextResponse.json({ error: 'Invalid candidate id' }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from('lead_candidates')
    .update({ status: 'dismissed' })
    .eq('id', candidateId)
    .select('id, source')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  await audit({
    userId: auth.userId,
    action: 'dismiss_lead_candidate',
    resourceType: 'lead_candidate',
    resourceId: candidateId,
    metadata: { source: updated.source },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
