// GET /api/calls/:id/audio
// Returns a short-lived signed download URL for the call's audio file in
// Supabase Storage. The frontend uses this to populate <audio src=...>
// or a download link. URL is valid for 1 hour.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

const SIGNED_URL_EXPIRES_SECONDS = 60 * 60;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  const { data: call } = await supabase
    .from('call_recordings')
    .select('audio_storage_path, audio_original_name')
    .eq('id', id)
    .single();
  if (!call?.audio_storage_path) {
    return NextResponse.json({ error: 'No audio file for this call' }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from('crm-call-recordings')
    .createSignedUrl(call.audio_storage_path, SIGNED_URL_EXPIRES_SECONDS, {
      download: call.audio_original_name || true,
    });
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create signed download URL' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url: data.signedUrl,
    filename: call.audio_original_name || 'call-audio',
    expires_in: SIGNED_URL_EXPIRES_SECONDS,
  });
}
