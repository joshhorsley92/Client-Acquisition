// GET /api/calls/:id/apply-to-client/preview
// Non-destructive: returns the per-field conflicts that would surface if
// this call's extracted profile were applied to its client right now.
// Annotates each conflict with the current source tag (manual / call:N /
// merged:N) so the modal can hint where the existing value came from.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { computeBrandProfileDiff } from '@/services/brand-profile-merge';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
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
    .from('clients')
    .select('brand_profile, brand_profile_sources')
    .eq('id', call.client_id)
    .single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const currentProfile = (client.brand_profile as Record<string, unknown>) || {};
  const currentSources = (client.brand_profile_sources as Record<string, string>) || {};

  const conflicts = computeBrandProfileDiff(currentProfile, extraction.profile).map((c) => ({
    ...c,
    current_source: currentSources[c.path] || null,
  }));

  return NextResponse.json({ conflicts });
}
