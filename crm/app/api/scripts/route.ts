// GET  /api/scripts — list, optionally filtered by stage
// POST /api/scripts — create

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  let query = supabase
    .from('script_templates')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  const stage = req.nextUrl.searchParams.get('stage');
  if (stage) query = query.eq('stage', stage);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scripts: data });
}

const Body = z.object({
  stage: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['email', 'call_script', 'objection', 'checklist', 'follow_up']),
  format: z.enum(['markdown', 'structured']).optional(),
  content: z.string().min(1),
  sort_order: z.number().optional(),
});

export async function POST(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  let body;
  try { body = Body.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid body' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('script_templates')
    .insert({ ...body, format: body.format || 'markdown', sort_order: body.sort_order ?? 0 })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ script: data }, { status: 201 });
}
