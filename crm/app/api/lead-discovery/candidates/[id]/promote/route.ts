// POST /api/lead-discovery/candidates/[id]/promote
// Promotes a triaged candidate to a full crm.clients row. Mirrors the field
// mapping used by /api/import-clients so behavior is consistent regardless
// of intake path.

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

  const { data: candidate } = await supabase
    .from('lead_candidates')
    .select('*')
    .eq('id', candidateId)
    .maybeSingle();
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  if (candidate.status === 'promoted' && candidate.promoted_client_id) {
    return NextResponse.json({ error: 'Already promoted', client_id: candidate.promoted_client_id }, { status: 409 });
  }

  // Check dedup against existing clients before insert. Same two-tier
  // behavior as CSV import.
  const sourceLeadId = `${candidate.source}:${candidate.source_id}`;
  const { data: bySource } = await supabase
    .from('clients')
    .select('id, name')
    .eq('source_lead_id', sourceLeadId)
    .maybeSingle();
  if (bySource) {
    await supabase.from('lead_candidates')
      .update({ status: 'promoted', promoted_client_id: bySource.id })
      .eq('id', candidateId);
    return NextResponse.json({
      client_id: bySource.id,
      candidate_id: candidateId,
      already_existed: true,
    });
  }

  const { data: created, error: insErr } = await supabase
    .from('clients')
    .insert({
      name: candidate.name,
      website: candidate.website,
      industry: candidate.industry,
      location: [candidate.city, candidate.state].filter(Boolean).join(', ') || null,
      email: candidate.email,
      phone: candidate.phone,
      enrichment_data: candidate.enrichment_data ?? {},
      enrichment_status: candidate.opportunity_score != null ? 'succeeded' : 'none',
      source_lead_id: sourceLeadId,
      source_platform: candidate.source,
      source_imported_at: new Date().toISOString(),
      owner_id: auth.userId,
    })
    .select('id')
    .single();
  if (insErr || !created) {
    return NextResponse.json({ error: insErr?.message || 'Failed to create client' }, { status: 500 });
  }

  await supabase
    .from('lead_candidates')
    .update({ status: 'promoted', promoted_client_id: created.id })
    .eq('id', candidateId);

  await audit({
    userId: auth.userId,
    action: 'promote_lead_candidate',
    resourceType: 'lead_candidate',
    resourceId: candidateId,
    metadata: {
      source: candidate.source,
      source_id: candidate.source_id,
      promoted_client_id: created.id,
      opportunity_score: candidate.opportunity_score,
    },
    request: req,
  });

  return NextResponse.json({ client_id: created.id, candidate_id: candidateId });
}
