// GET    /api/clients/:id — detail + engagements (+ lazy fit-score compute)
// PATCH  /api/clients/:id — update fields; auto-tags brand_profile changes as 'manual'
// DELETE /api/clients/:id — cascade delete via FK

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { diffChangedPaths } from '@/services/brand-profile-merge';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const { data: engagements } = await supabase
    .from('engagements')
    .select('*')
    .eq('client_id', id)
    .order('opened_at', { ascending: false });

  // Lazy fit-score compute could go here. Skipping in v1.0 for simplicity —
  // the dedicated POST /:id/fit-score/recompute endpoint is the path.

  return NextResponse.json({ client, engagements: engagements || [] });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  const body = await req.json();

  // Special handling for brand_profile updates: auto-tag changed leaf paths
  // as 'manual' in brand_profile_sources unless the caller supplied sources
  // explicitly (the diff modal does that path).
  let updates = { ...body };
  if (body.brand_profile !== undefined && body.brand_profile_sources === undefined) {
    const { data: existing } = await supabase
      .from('clients')
      .select('brand_profile, brand_profile_sources')
      .eq('id', id)
      .single();

    const oldProfile = (existing?.brand_profile as Record<string, unknown>) || {};
    const newProfile = body.brand_profile as Record<string, unknown>;
    const oldSources = (existing?.brand_profile_sources as Record<string, string>) || {};

    const changed = diffChangedPaths(oldProfile, newProfile);
    const nextSources = { ...oldSources };
    for (const path of changed) nextSources[path] = 'manual';
    updates.brand_profile_sources = nextSources;
  }

  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ client: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
