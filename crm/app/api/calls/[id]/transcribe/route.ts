// POST /api/calls/:id/transcribe — Whisper transcription
//
// **v1.0: 501 Not Implemented.** The local-Python Whisper subprocess from
// the prototype doesn't run on Netlify Functions. Re-enable in v1.x by
// swapping in an OpenAI Whisper API call here (~$0.006/min, single-file
// change). Until then, paste transcripts into the textarea on the call
// detail page; Brand Profile extraction works fine without auto-transcribe.

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';

export async function POST() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;

  return NextResponse.json(
    {
      error: 'Whisper auto-transcription is paused for cloud — paste a transcript on the call page instead.',
      code: 'WHISPER_UNAVAILABLE',
    },
    { status: 501 },
  );
}
