// GET    /api/clients/:id — detail + engagements (+ lazy fit-score compute)
// PATCH  /api/clients/:id — update fields; auto-tags brand_profile changes as 'manual'
// DELETE /api/clients/:id — cascade delete via FK

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { diffChangedPaths } from '@/services/brand-profile-merge';
import { audit } from '@/lib/audit';

// Fields a user is allowed to PATCH directly. Anything else (fit_score,
// enrichment_*, source_*, owner_id, timestamps) is computed or system-owned
// and must go through its own endpoint.
const ALLOWED_PATCH_FIELDS = new Set([
  'name', 'website', 'industry', 'location', 'type',
  'primary_contact_name', 'email', 'phone', 'role', 'preferred_contact',
  'employee_count', 'revenue_estimate', 'notes',
  'additional_contacts', 'social_links',
  'brand_profile', 'brand_profile_sources',
]);

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
  const { auth, supabase } = result;
  const { id } = await ctx.params;

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  for (const k of Object.keys(body)) {
    if (ALLOWED_PATCH_FIELDS.has(k)) updates[k] = body[k];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  // Special handling for brand_profile updates: auto-tag changed leaf paths
  // as 'manual' in brand_profile_sources unless the caller supplied sources
  // explicitly (the diff modal does that path).
  if (updates.brand_profile !== undefined && updates.brand_profile_sources === undefined) {
    const { data: existing } = await supabase
      .from('clients')
      .select('brand_profile, brand_profile_sources')
      .eq('id', id)
      .single();

    const oldProfile = (existing?.brand_profile as Record<string, unknown>) || {};
    const newProfile = updates.brand_profile as Record<string, unknown>;
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

  await audit({
    userId: auth.userId,
    action: 'update',
    resourceType: 'client',
    resourceId: id,
    metadata: { fields: Object.keys(updates) },
    request: req,
  });

  return NextResponse.json({ client: data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;
  const { id } = await ctx.params;

  const { data: existing } = await supabase
    .from('clients').select('name').eq('id', id).maybeSingle();

  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await audit({
    userId: auth.userId,
    action: 'delete',
    resourceType: 'client',
    resourceId: id,
    metadata: { name: existing?.name ?? null },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
