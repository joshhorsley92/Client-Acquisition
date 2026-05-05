// GET  /api/settings/users  — admin-only list of all users (joins auth.users + crm.profiles)
// POST /api/settings/users  — admin creates a new user (sends recovery link instead of setting password)

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, isAuthError } from '@/lib/api-auth';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { audit } from '@/lib/audit';
import { UserCreateSchema } from '@/lib/schemas';

export async function GET() {
  const result = await requireAdminAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, created_at')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}

export async function POST(req: NextRequest) {
  const result = await requireAdminAuth();
  if (isAuthError(result)) return result;
  const { auth } = result;

  let body;
  try { body = UserCreateSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid body' }, { status: 400 });
  }

  // Create via Supabase Auth admin API. The handle_new_user_to_crm trigger
  // populates crm.profiles automatically; we only need to bump the role if
  // the new user is supposed to be admin.
  const sb = createServiceRoleClient();
  const tempPassword = crypto.randomUUID();
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: body.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: body.name, role: body.role },
  });
  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 400 });
  }

  if (body.role === 'admin') {
    await sb.from('profiles').update({ role: 'admin' }).eq('id', created.user!.id);
  }

  // Generate a recovery link the new user will follow to set their real password.
  const { data: link } = await sb.auth.admin.generateLink({
    type: 'recovery',
    email: body.email,
  });

  await audit({
    userId: auth.userId,
    action: 'create_user',
    resourceType: 'user',
    resourceId: created.user?.id,
    metadata: { email: body.email, role: body.role },
    request: req,
  });

  return NextResponse.json(
    {
      user: {
        id: created.user?.id,
        name: body.name,
        email: body.email,
        role: body.role,
      },
      recovery_link: link?.properties?.action_link || null,
    },
    { status: 201 },
  );
}
