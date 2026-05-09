// GET  /api/engagements — list with filters (client_id/status/owner_id/source)
// POST /api/engagements — create

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import { EngagementCreateSchema } from '@/lib/schemas';
import { summarizePackagePricing, type EngagementPackage } from '@/lib/engagement-options';

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

const ServerEngagementCreate = EngagementCreateSchema.extend({
  // owner_id is server-only — admins can override which user owns a new engagement
  owner_id: z.string().nullish(),
});

export async function POST(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  let body;
  try { body = ServerEngagementCreate.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid body' }, { status: 400 });
  }

  // Verify client exists (RLS will enforce too, but a clear 400 is friendlier)
  const { data: client } = await supabase.from('clients').select('id').eq('id', body.client_id).single();
  if (!client) return NextResponse.json({ error: 'client_id does not match a client' }, { status: 400 });

  // If a specific contact is requested, verify it belongs to this client.
  if (body.contact_id != null) {
    const { data: contact } = await supabase
      .from('client_contacts')
      .select('id')
      .eq('id', body.contact_id)
      .eq('client_id', body.client_id)
      .maybeSingle();
    if (!contact) {
      return NextResponse.json(
        { error: 'Contact does not belong to the chosen client' },
        { status: 400 },
      );
    }
  }

  // Roll the package list into the cached aggregate columns. Manually-
  // submitted estimated_value (e.g., from the create modal) wins over the
  // package-derived total only when no packages have prices set — it's a
  // reasonable user override for the early-entry case.
  const packagesIn = (body.packages ?? []) as EngagementPackage[];
  const { one_time_total, monthly_total } = summarizePackagePricing(packagesIn);
  const estimatedValue = one_time_total > 0
    ? one_time_total
    : (body.estimated_value ?? 0);

  const { data, error } = await supabase
    .from('engagements')
    .insert({
      client_id: body.client_id,
      status: body.status || 'new',
      title: body.title ?? null,
      packages: packagesIn,
      source: body.source ?? null,
      source_detail: body.source_detail ?? null,
      estimated_value: estimatedValue,
      monthly_recurring_value: monthly_total,
      contract_months: body.contract_months ?? null,
      contact_id: body.contact_id ?? null,
      notes: body.notes ?? null,
      owner_id: body.owner_id ?? auth.userId,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit({
    userId: auth.userId,
    action: 'create',
    resourceType: 'engagement',
    resourceId: data.id,
    metadata: { client_id: body.client_id, status: data.status, source: data.source },
    request: req,
  });

  // TODO Phase D-iter-2: executeStatusActions (Slack notification on status entry)
  return NextResponse.json({ engagement: data }, { status: 201 });
}
