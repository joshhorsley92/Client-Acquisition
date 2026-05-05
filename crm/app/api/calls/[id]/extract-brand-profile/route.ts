// POST /api/calls/:id/extract-brand-profile
// Calls Claude with the call transcript, stores the structured profile
// + sidecar (per-field confidence + source quote) on the call row.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { extractBrandProfile, computeCompletion, NoApiKeyError } from '@/services/brand-profile-extractor';
import { audit } from '@/lib/audit';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;
  const { id } = await ctx.params;

  const { data: call, error: callErr } = await supabase
    .from('call_recordings').select('*').eq('id', id).single();
  if (callErr || !call) return NextResponse.json({ error: 'Call not found' }, { status: 404 });
  if (!call.transcript || !call.transcript.trim()) {
    return NextResponse.json(
      { error: 'This call has no transcript. Paste one first.' },
      { status: 400 },
    );
  }

  const started = Date.now();
  try {
    const ext = await extractBrandProfile(call.transcript);
    const ms = Date.now() - started;

    const payload = {
      profile: ext.profile,
      sidecar: ext.sidecar,
      completion_percent: computeCompletion(ext.profile),
      extracted_at: new Date().toISOString(),
      model: ext.model,
      usage: ext.usage,
      duration_ms: ms,
    };

    await supabase.from('call_recordings').update({
      extracted_profile_json: payload,
      review_status: 'pending',
    }).eq('id', id);

    await audit({
      userId: auth.userId,
      action: 'extract_brand_profile',
      resourceType: 'call',
      resourceId: id,
      metadata: {
        completion_percent: payload.completion_percent,
        duration_ms: ms,
        client_id: call.client_id,
      },
      request: req,
    });

    return NextResponse.json({ extraction: payload });
  } catch (err) {
    if (err instanceof NoApiKeyError) {
      return NextResponse.json(
        { error: 'Extraction unavailable — ANTHROPIC_API_KEY not set on the server.' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Extraction failed' },
      { status: 500 },
    );
  }
}
