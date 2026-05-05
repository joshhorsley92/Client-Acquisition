// GET  /api/calls — list with filters
// POST /api/calls — create (JSON body; audio upload happens separately
//   via the Phase E signed-URL endpoint)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import { CallCreateSchema } from '@/lib/schemas';

export async function GET(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const sp = req.nextUrl.searchParams;
  let query = supabase
    .from('call_recordings')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(200);

  if (sp.get('client_id')) query = query.eq('client_id', sp.get('client_id'));
  if (sp.get('engagement_id')) query = query.eq('engagement_id', sp.get('engagement_id'));
  if (sp.get('review_status')) query = query.eq('review_status', sp.get('review_status'));
  // Free-text search inside the transcript (ILIKE — internal CRM scale,
  // <10k rows expected). Promote to to_tsvector if/when this gets slow.
  const q = sp.get('q')?.trim();
  if (q) query = query.ilike('transcript', `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const calls = (data || []).map((row: any) => ({
    ...row,
    client_name: row.clients?.name,
    clients: undefined,
  }));
  return NextResponse.json({ calls });
}

// Server adds audio metadata fields; the client form schema (lib/schemas) doesn't
// include them — audio uploads via the signed-URL flow append them at submit.
const ServerCallCreate = CallCreateSchema.extend({
  audio_storage_path: z.string().nullish(),
  audio_original_name: z.string().nullish(),
  audio_size_bytes: z.coerce.number().nullish(),
});

export async function POST(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  let body;
  try { body = ServerCallCreate.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid body' }, { status: 400 });
  }

  if (!body.transcript?.trim() && !body.audio_storage_path) {
    return NextResponse.json(
      { error: 'Provide a transcript or upload an audio file (or both)' },
      { status: 400 },
    );
  }

  // Validate client + engagement-belongs-to-client.
  const { data: client } = await supabase.from('clients').select('id').eq('id', body.client_id).single();
  if (!client) return NextResponse.json({ error: 'client_id does not match a client' }, { status: 400 });
  if (body.engagement_id) {
    const { data: eng } = await supabase
      .from('engagements').select('id').eq('id', body.engagement_id).eq('client_id', body.client_id).maybeSingle();
    if (!eng) {
      return NextResponse.json({ error: 'engagement_id does not belong to the given client' }, { status: 400 });
    }
  }

  const transcriptSource = body.transcript?.trim() ? 'pasted' : null;

  const { data, error } = await supabase
    .from('call_recordings')
    .insert({
      client_id: body.client_id,
      engagement_id: body.engagement_id ?? null,
      call_date: body.call_date ?? null,
      duration_minutes: body.duration_minutes ?? null,
      audio_storage_path: body.audio_storage_path ?? null,
      audio_original_name: body.audio_original_name ?? null,
      audio_size_bytes: body.audio_size_bytes ?? null,
      transcript: body.transcript?.trim() || null,
      transcript_source: transcriptSource,
      notes: body.notes ?? null,
      created_by: auth.userId,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit({
    userId: auth.userId,
    action: 'create',
    resourceType: 'call',
    resourceId: data.id,
    metadata: {
      client_id: body.client_id,
      engagement_id: body.engagement_id ?? null,
      has_transcript: Boolean(body.transcript?.trim()),
      has_audio: Boolean(body.audio_storage_path),
    },
    request: req,
  });

  return NextResponse.json({ call: data }, { status: 201 });
}
