// POST /api/calls/upload-url
// Returns a signed URL the browser uses to PUT a file directly to Supabase
// Storage. We never proxy the audio bytes through a Netlify Function (5xx
// risk on big files + extra latency); the function just mints the URL and
// hands back the bucket-relative path that the subsequent POST /api/calls
// stores on the call_recordings row.
//
// Body: { filename: string }   (the original filename, used to compose a
//                                stable bucket-relative path)
// Returns: { token: string, path: string }
//
// Frontend flow:
//   1. POST here → { token, path }
//   2. supabase.storage.from('crm-call-recordings').uploadToSignedUrl(path, token, file)
//   3. POST /api/calls with { client_id, audio_storage_path: path, ... }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-auth';

const Body = z.object({
  filename: z.string().min(1),
});

const BUCKET = 'crm-call-recordings';

function safeName(name: string): string {
  return name.replace(/[^a-z0-9.\-_]/gi, '_').slice(0, 200);
}

export async function POST(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  let body;
  try { body = Body.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid body' }, { status: 400 });
  }

  // Path shape: <user_id>/<timestamp>-<rand>-<safe_name>
  // Scoping by user_id keeps each upload in its own subdirectory and lines up
  // with future per-user storage RLS policies if we want them.
  const path = `${auth.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(body.filename)}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create signed upload URL' },
      { status: 500 },
    );
  }

  return NextResponse.json({ token: data.token, path: data.path });
}
