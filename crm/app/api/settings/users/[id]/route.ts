// DELETE /api/settings/users/:id — admin removes a user (cannot delete self)

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, isAuthError } from '@/lib/api-auth';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { audit } from '@/lib/audit';

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAdminAuth();
  if (isAuthError(result)) return result;
  const { auth } = result;
  const { id } = await ctx.params;

  if (id === auth.userId) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  const sb = createServiceRoleClient();
  const { data: existing } = await sb
    .from('profiles').select('email').eq('id', id).maybeSingle();

  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // ON DELETE CASCADE on crm.profiles → auth.users handles the profile row.

  await audit({
    userId: auth.userId,
    action: 'delete_user',
    resourceType: 'user',
    resourceId: id,
    metadata: { email: existing?.email ?? null },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
