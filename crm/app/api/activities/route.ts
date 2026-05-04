// GET  /api/activities — list with filters (client_id, engagement_id, exclude_auto)
// POST /api/activities — create

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const sp = req.nextUrl.searchParams;
  let query = supabase
    .from('activities')
    .select('*, clients(name)')
    .order('created_at', { ascending: false });

  if (sp.get('client_id')) query = query.eq('client_id', sp.get('client_id'));
  if (sp.get('engagement_id')) query = query.eq('engagement_id', sp.get('engagement_id'));
  if (sp.get('exclude_auto') === 'true') {
    query = query.in('type', ['note', 'call', 'email', 'meeting', 'status_change']);
  }
  const limitParam = sp.get('limit');
  if (limitParam) {
    const limit = Math.min(200, parseInt(limitParam, 10) || 50);
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const activities = (data || []).map((row: any) => ({
    ...row,
    client_name: row.clients?.name,
    clients: undefined,
  }));
  return NextResponse.json({ activities });
}

const Body = z.object({
  client_id: z.union([z.number(), z.string()]),
  engagement_id: z.union([z.number(), z.string()]).nullish(),
  type: z.enum(['email', 'call', 'meeting', 'note', 'status_change', 'system']),
  content: z.string().nullish(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  let body;
  try { body = Body.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid body' }, { status: 400 });
  }

  // Validate engagement belongs to client when both supplied.
  if (body.engagement_id) {
    const { data: eng } = await supabase
      .from('engagements').select('id').eq('id', body.engagement_id).eq('client_id', body.client_id).maybeSingle();
    if (!eng) return NextResponse.json({ error: 'engagement_id does not belong to the given client' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('activities')
    .insert({
      client_id: body.client_id,
      engagement_id: body.engagement_id ?? null,
      type: body.type,
      content: body.content ?? null,
      metadata: body.metadata ?? {},
      created_by: auth.userId,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ activity: data }, { status: 201 });
}
