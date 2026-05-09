// GET    /api/engagements/:id — detail + client + documents + activities
// PATCH  /api/engagements/:id — update; logs status_change activity if status flips
// DELETE /api/engagements/:id

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import { EngagementPatchSchema } from '@/lib/schemas';
import { summarizePackagePricing, type EngagementPackage } from '@/lib/engagement-options';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  const { data: engagement, error } = await supabase
    .from('engagements').select('*').eq('id', id).single();
  if (error || !engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
  }

  const [{ data: client }, { data: activities }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', engagement.client_id).single(),
    supabase.from('activities').select('*').eq('engagement_id', id).order('created_at', { ascending: false }),
  ]);

  return NextResponse.json({
    engagement,
    client: client || null,
    activities: activities || [],
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;
  const { id } = await ctx.params;
  const body = await req.json();

  const { data: existing } = await supabase
    .from('engagements').select('*').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  const isStatusChange = body.status && body.status !== existing.status;
  if (isStatusChange && body.status === 'lost' && !body.lost_reason && !existing.lost_reason) {
    return NextResponse.json({ error: 'lost_reason is required when closing as lost' }, { status: 400 });
  }

  // Validate the structured fields that have schema rules ('other' requires
  // a label, contract_months has bounds, title is trimmed/length-capped).
  // Other fields are passed through.
  if (
    body.packages !== undefined ||
    body.contract_months !== undefined ||
    body.title !== undefined ||
    body.contact_id !== undefined
  ) {
    const parsed = EngagementPatchSchema.safeParse({
      title: body.title,
      packages: body.packages,
      contract_months: body.contract_months,
      contact_id: body.contact_id,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || 'Invalid payload' },
        { status: 400 },
      );
    }
    if (parsed.data.title !== undefined) body.title = parsed.data.title;
    if (parsed.data.packages !== undefined) body.packages = parsed.data.packages;
    if (parsed.data.contract_months !== undefined) body.contract_months = parsed.data.contract_months;
    if (parsed.data.contact_id !== undefined) body.contact_id = parsed.data.contact_id;
  }

  // If a contact_id is being set, make sure it actually belongs to the
  // engagement's client — otherwise users could attach an unrelated
  // contact via a hand-crafted PATCH.
  if (body.contact_id != null) {
    const { data: contact } = await supabase
      .from('client_contacts')
      .select('id')
      .eq('id', body.contact_id)
      .eq('client_id', existing.client_id)
      .maybeSingle();
    if (!contact) {
      return NextResponse.json(
        { error: 'Contact does not belong to this engagement\'s client' },
        { status: 400 },
      );
    }
  }

  const allowed = [
    'client_id', 'status', 'title', 'packages', 'source', 'source_detail',
    'estimated_value', 'closed_value', 'monthly_recurring_value',
    'closed_monthly_value', 'contract_months', 'contact_id',
    'lost_reason', 'notes', 'owner_id',
  ];
  const updates: Record<string, unknown> = {};
  for (const f of allowed) {
    if (body[f] !== undefined) updates[f] = body[f];
  }

  // Whenever packages change, recompute the cached aggregate columns so
  // reports queries don't need to walk the JSONB array. estimated_value
  // is overwritten only when the package list has any priced rows — if
  // no prices are set yet, leave whatever scalar the user typed alone.
  if (Array.isArray(body.packages)) {
    const packages = body.packages as EngagementPackage[];
    const { one_time_total, monthly_total } = summarizePackagePricing(packages);
    const anyPriced = packages.some((p) => Number(p.unit_price ?? 0) > 0);
    if (anyPriced) {
      updates.estimated_value = one_time_total;
    }
    updates.monthly_recurring_value = monthly_total;

    // If we're closing as won AND the package list has MRR, lock in the
    // closed_monthly_value at close time the same way closed_value is
    // typically locked in.
    if (body.status === 'won' && monthly_total > 0 && body.closed_monthly_value === undefined) {
      updates.closed_monthly_value = monthly_total;
    }
  }
  if (isStatusChange) {
    updates.status_changed_at = new Date().toISOString();
    if (body.status === 'won' || body.status === 'lost') {
      updates.closed_at = new Date().toISOString();
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ engagement: existing });
  }

  // Concurrency guard: when transitioning to a closed status, require the
  // current row to still be open. Two simultaneous closes (one to 'won',
  // one to 'lost') can't both win.
  let updateQuery = supabase.from('engagements').update(updates).eq('id', id);
  if (isStatusChange && (body.status === 'won' || body.status === 'lost')) {
    updateQuery = updateQuery.in('status', ['new', 'working']);
  }
  const { data: updated, error: updErr } = await updateQuery.select('*').maybeSingle();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json(
      { error: 'Engagement was already closed by another change. Reload to see the current state.' },
      { status: 409 },
    );
  }

  // Log status change as an activity for the per-client audit trail.
  if (isStatusChange) {
    await supabase.from('activities').insert({
      client_id: existing.client_id,
      engagement_id: Number(id),
      type: 'status_change',
      content: `Status changed from ${existing.status} to ${body.status}`,
      created_by: auth.userId,
    });
    // TODO Phase D-iter-2: executeStatusActions (Slack notification)
  }

  await audit({
    userId: auth.userId,
    action: 'update',
    resourceType: 'engagement',
    resourceId: id,
    metadata: {
      fields: Object.keys(updates),
      status_change: isStatusChange ? { from: existing.status, to: body.status } : undefined,
    },
    request: req,
  });

  return NextResponse.json({ engagement: updated });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;
  const { id } = await ctx.params;

  const { data: existing } = await supabase
    .from('engagements').select('client_id, status').eq('id', id).maybeSingle();

  const { error } = await supabase.from('engagements').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit({
    userId: auth.userId,
    action: 'delete',
    resourceType: 'engagement',
    resourceId: id,
    metadata: existing ? { client_id: existing.client_id, status: existing.status } : {},
    request: req,
  });

  return NextResponse.json({ ok: true });
}
