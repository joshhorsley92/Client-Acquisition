// POST /api/auth/login
// Wraps Supabase signInWithPassword; sets the session cookie via
// @supabase/ssr. The browser-side login page also has the option of
// calling supabase.auth.signInWithPassword directly — this route exists
// for any server-side flows we add later (e.g., a CLI tool).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(body);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ user: { id: data.user?.id, email: data.user?.email } });
}
