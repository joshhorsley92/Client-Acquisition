// GET    /api/calls/:id
// PATCH  /api/calls/:id
// DELETE /api/calls/:id  (also deletes the audio object from Storage)

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  const { data, error } = await supabase
    .from('call_recordings')
    .select('*, clients(name, email)')
    .eq('id', id)
    .single();
  if (error || !data) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

  const call = {
    ...data,
    client_name: (data as any).clients?.name,
    client_email: (data as any).clients?.email,
    clients: undefined,
  };
  return NextResponse.json({ call });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;
  const body = await req.json();

  const allowed = [
    'call_date', 'duration_minutes', 'transcript', 'transcript_source',
    'notes', 'engagement_id', 'review_status', 'extracted_profile_json',
  ];
  const updates: Record<string, unknown> = {};
  for (const f of allowed) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  // Auto-stamp transcript_source on a transcript edit if caller didn't set it.
  if (body.transcript !== undefined && body.transcript_source === undefined) {
    updates.transcript_source = body.transcript?.trim() ? 'pasted' : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('call_recordings').update(updates).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ call: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  // Fetch the audio path so we can clean up Storage too.
  const { data: existing } = await supabase
    .from('call_recordings').select('audio_storage_path').eq('id', id).single();
  if (existing?.audio_storage_path) {
    await supabase.storage.from('crm-call-recordings').remove([existing.audio_storage_path]);
  }

  const { error } = await supabase.from('call_recordings').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
