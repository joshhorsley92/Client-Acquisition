// GET    /api/scripts/:id
// PATCH  /api/scripts/:id
// DELETE /api/scripts/:id

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

const ALLOWED_FIELDS = ['stage', 'name', 'type', 'format', 'content', 'sort_order'];

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  const { data, error } = await supabase
    .from('script_templates').select('*').eq('id', id).single();
  if (error || !data) return NextResponse.json({ error: 'Script not found' }, { status: 404 });
  return NextResponse.json({ script: data });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  for (const f of ALLOWED_FIELDS) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  if (Object.keys(updates).length === 0) {
    const { data } = await supabase.from('script_templates').select('*').eq('id', id).single();
    return NextResponse.json({ script: data });
  }

  const { data, error } = await supabase
    .from('script_templates').update(updates).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ script: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  const { error } = await supabase.from('script_templates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
