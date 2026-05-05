// GET   /api/integrations/:type — admin-only (config may contain secrets)
// PATCH /api/integrations/:type — admin-only, update config + enabled

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, isAuthError } from '@/lib/api-auth';
import { audit } from '@/lib/audit';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ type: string }> }) {
  const result = await requireAdminAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { type } = await ctx.params;

  const { data, error } = await supabase
    .from('integration_settings').select('*').eq('type', type).single();
  if (error || !data) return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  return NextResponse.json({ integration: data });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ type: string }> }) {
  const result = await requireAdminAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;
  const { type } = await ctx.params;

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.config !== undefined) updates.config = body.config;
  if (body.enabled !== undefined) updates.enabled = !!body.enabled;
  if (Object.keys(updates).length === 0) {
    const { data } = await supabase.from('integration_settings').select('*').eq('type', type).single();
    return NextResponse.json({ integration: data });
  }

  // Upsert so creating + updating an integration is the same call shape.
  const { data, error } = await supabase
    .from('integration_settings')
    .upsert({ type, ...updates }, { onConflict: 'type' })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit({
    userId: auth.userId,
    action: 'update',
    resourceType: 'integration',
    resourceId: type,
    metadata: {
      fields: Object.keys(updates),
      enabled: 'enabled' in updates ? updates.enabled : undefined,
    },
    request: req,
  });

  return NextResponse.json({ integration: data });
}
