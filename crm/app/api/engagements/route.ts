// GET  /api/engagements — list with filters (client_id/status/owner_id/source)
// POST /api/engagements — create

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const sp = req.nextUrl.searchParams;
  let query = supabase
    .from('engagements')
    .select('*, clients(name)')  // join client name (PostgREST embedded resource)
    .order('opened_at', { ascending: false });

  if (sp.get('client_id')) query = query.eq('client_id', sp.get('client_id'));
  if (sp.get('status')) query = query.eq('status', sp.get('status'));
  if (sp.get('owner_id')) query = query.eq('owner_id', sp.get('owner_id'));
  if (sp.get('source')) query = query.eq('source', sp.get('source'));

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten the embedded client name to a top-level field for legacy parity
  const engagements = (data || []).map((row: any) => ({
    ...row,
    client_name: row.clients?.name,
    clients: undefined,
  }));
  return NextResponse.json({ engagements });
}

const CreateBody = z.object({
  client_id: z.union([z.number(), z.string()]),
  status: z.enum(['new', 'working', 'won', 'lost']).optional(),
  package_type: z.enum(['boost', 'launch', 'both', 'undecided']).nullish(),
  source: z.enum(['referral', 'cold', 'web', 'content', 'paid_ads']).nullish(),
  source_detail: z.string().nullish(),
  estimated_value: z.number().optional(),
  notes: z.string().nullish(),
  owner_id: z.string().nullish(),
});

export async function POST(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  let body;
  try { body = CreateBody.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid body' }, { status: 400 });
  }

  // Verify client exists (RLS will enforce too, but a clear 400 is friendlier)
  const { data: client } = await supabase.from('clients').select('id').eq('id', body.client_id).single();
  if (!client) return NextResponse.json({ error: 'client_id does not match a client' }, { status: 400 });

  const { data, error } = await supabase
    .from('engagements')
    .insert({
      client_id: body.client_id,
      status: body.status || 'new',
      package_type: body.package_type ?? null,
      source: body.source ?? null,
      source_detail: body.source_detail ?? null,
      estimated_value: body.estimated_value ?? 0,
      notes: body.notes ?? null,
      owner_id: body.owner_id ?? auth.userId,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // TODO Phase D-iter-2: executeStatusActions (Slack notification on status entry)
  return NextResponse.json({ engagement: data }, { status: 201 });
}
