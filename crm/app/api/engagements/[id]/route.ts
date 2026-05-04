// GET    /api/engagements/:id — detail + client + documents + activities
// PATCH  /api/engagements/:id — update; logs status_change activity if status flips
// DELETE /api/engagements/:id

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  const { data: engagement, error } = await supabase
    .from('engagements').select('*').eq('id', id).single();
  if (error || !engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
  }

  const [{ data: client }, { data: documents }, { data: activities }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', engagement.client_id).single(),
    supabase.from('documents').select('*').eq('engagement_id', id).order('created_at', { ascending: false }),
    supabase.from('activities').select('*').eq('engagement_id', id).order('created_at', { ascending: false }),
  ]);

  return NextResponse.json({
    engagement,
    client: client || null,
    documents: documents || [],
    activities: activities || [],
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;
  const { id } = await ctx.params;
  const body = await req.json();

  const { data: existing } = await supabase
    .from('engagements').select('*').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  const isStatusChange = body.status && body.status !== existing.status;
  if (isStatusChange && body.status === 'lost' && !body.lost_reason && !existing.lost_reason) {
    return NextResponse.json({ error: 'lost_reason is required when closing as lost' }, { status: 400 });
  }

  const allowed = [
    'client_id', 'status', 'package_type', 'source', 'source_detail',
    'estimated_value', 'closed_value', 'lost_reason', 'notes', 'owner_id',
  ];
  const updates: Record<string, unknown> = {};
  for (const f of allowed) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  if (isStatusChange) {
    updates.status_changed_at = new Date().toISOString();
    if (body.status === 'won' || body.status === 'lost') {
      updates.closed_at = new Date().toISOString();
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ engagement: existing });
  }

  const { data: updated, error: updErr } = await supabase
    .from('engagements').update(updates).eq('id', id).select('*').single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Log status change as an activity for the audit trail.
  if (isStatusChange) {
    await supabase.from('activities').insert({
      client_id: existing.client_id,
      engagement_id: Number(id),
      type: 'status_change',
      content: `Status changed from ${existing.status} to ${body.status}`,
      created_by: auth.userId,
    });
    // TODO Phase D-iter-2: executeStatusActions (Slack notification)
  }

  return NextResponse.json({ engagement: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;
  const { error } = await supabase.from('engagements').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
