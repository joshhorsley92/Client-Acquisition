// POST /api/calls/:id/apply-to-client
// Merge this call's extracted Brand Profile into the client's canonical
// brand_profile, respecting paths the user has tagged 'manual'. Optional
// per-path overrides via { choices: { path: 'keep'|'take'|'skip' } } from
// the conflict diff modal.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { mergeExtractionIntoClient } from '@/services/brand-profile-merge';
import type { Choice } from '@/services/brand-profile-merge';
import { audit } from '@/lib/audit';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;
  const { id } = await ctx.params;

  const { data: call } = await supabase
    .from('call_recordings').select('*').eq('id', id).single();
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 });
  if (!call.extracted_profile_json) {
    return NextResponse.json(
      { error: 'No extracted Brand Profile to apply — run Extract first.' },
      { status: 400 },
    );
  }

  const extraction = call.extracted_profile_json as { profile?: Record<string, unknown> };
  if (!extraction.profile) {
    return NextResponse.json({ error: 'Extracted profile is empty' }, { status: 400 });
  }

  const { data: client } = await supabase
    .from('clients').select('*').eq('id', call.client_id).single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const currentProfile = (client.brand_profile as Record<string, unknown>) || {};
  const currentSources = (client.brand_profile_sources as Record<string, string>) || {};

  // Sanitize choices map — drop anything that isn't keep/take/skip.
  const body = await req.json().catch(() => ({}));
  const choices: Record<string, Choice> = {};
  if (body && typeof body === 'object' && body.choices && typeof body.choices === 'object') {
    for (const [path, val] of Object.entries(body.choices)) {
      if (val === 'keep' || val === 'take' || val === 'skip') {
        choices[path] = val as Choice;
      }
    }
  }

  const merged = mergeExtractionIntoClient(
    currentProfile, currentSources, extraction.profile, call.id, { choices },
  );

  const { error: updErr } = await supabase
    .from('clients')
    .update({ brand_profile: merged.profile, brand_profile_sources: merged.sources })
    .eq('id', client.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Best-effort activity log so the audit trail captures the merge.
  await supabase.from('activities').insert({
    client_id: client.id,
    engagement_id: call.engagement_id ?? null,
    type: 'system',
    content: `Applied call #${call.id} brand profile to client — ${merged.appliedPaths.length} updated, ${merged.mergedPaths.length} merged (arrays), ${merged.skippedPaths.length} preserved.`,
    metadata: {
      call_id: call.id,
      applied: merged.appliedPaths,
      merged: merged.mergedPaths,
      skipped: merged.skippedPaths,
      choices: Object.keys(choices).length ? choices : undefined,
    },
    created_by: auth.userId,
  });

  await audit({
    userId: auth.userId,
    action: 'apply_brand_profile',
    resourceType: 'client',
    resourceId: client.id,
    metadata: {
      call_id: call.id,
      applied_count: merged.appliedPaths.length,
      merged_count: merged.mergedPaths.length,
      skipped_count: merged.skippedPaths.length,
    },
    request: req,
  });

  return NextResponse.json({
    applied_paths: merged.appliedPaths,
    merged_paths: merged.mergedPaths,
    skipped_paths: merged.skippedPaths,
    profile: merged.profile,
    sources: merged.sources,
  });
}
