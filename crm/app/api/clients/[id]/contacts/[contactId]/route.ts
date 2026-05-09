// PATCH  /api/clients/[id]/contacts/[contactId] — update a contact
// DELETE /api/clients/[id]/contacts/[contactId] — remove a contact;
//   if it was the primary, clears the legacy cache on crm.clients so a
//   downstream consumer doesn't keep showing data that's been deleted.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import { ClientContactUpdateSchema } from '@/lib/schemas';

async function loadContact(
  supabase: any, clientId: number, contactId: number,
) {
  const { data } = await supabase
    .from('client_contacts')
    .select('*')
    .eq('id', contactId)
    .eq('client_id', clientId)
    .maybeSingle();
  return data;
}

async function syncClientCacheToPrimary(supabase: any, clientId: number) {
  // Read whichever row is currently primary for this client and write its
  // fields onto the clients row cache. If nothing's primary, clear the cache.
  const { data: primary } = await supabase
    .from('client_contacts')
    .select('name, email, phone, role, preferred_contact')
    .eq('client_id', clientId)
    .eq('is_primary', true)
    .maybeSingle();
  await supabase.from('clients').update({
    primary_contact_name: primary?.name ?? null,
    email: primary?.email ?? null,
    phone: primary?.phone ?? null,
    role: primary?.role ?? null,
    preferred_contact: primary?.preferred_contact ?? null,
  }).eq('id', clientId);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  const { id, contactId: cid } = await params;
  const clientId = Number(id);
  const contactId = Number(cid);
  if (!Number.isInteger(clientId) || !Number.isInteger(contactId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body;
  try { body = ClientContactUpdateSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid body' }, { status: 400 });
  }

  const existing = await loadContact(supabase, clientId, contactId);
  if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  // If this PATCH promotes this row to primary, demote others first so the
  // partial UNIQUE index doesn't block the update.
  if (body.is_primary === true && !existing.is_primary) {
    await supabase
      .from('client_contacts')
      .update({ is_primary: false })
      .eq('client_id', clientId)
      .eq('is_primary', true);
  }

  const updates: Record<string, unknown> = {};
  for (const k of ['name', 'email', 'phone', 'role', 'preferred_contact', 'notes', 'is_primary'] as const) {
    if (body[k] !== undefined) updates[k] = body[k] === '' ? null : body[k];
  }

  const { data: updated, error } = await supabase
    .from('client_contacts')
    .update(updates)
    .eq('id', contactId)
    .select('*')
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: error?.message || 'Update failed' }, { status: 500 });
  }

  // Sync the cache on clients whenever the primary changed OR the now-
  // primary contact's identifying data changed.
  if (updated.is_primary || existing.is_primary) {
    await syncClientCacheToPrimary(supabase, clientId);
  }

  await audit({
    userId: auth.userId,
    action: 'update',
    resourceType: 'client',
    resourceId: clientId,
    metadata: { kind: 'contact', contact_id: contactId, fields: Object.keys(updates) },
    request: req,
  });

  return NextResponse.json({ contact: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  const { id, contactId: cid } = await params;
  const clientId = Number(id);
  const contactId = Number(cid);
  if (!Number.isInteger(clientId) || !Number.isInteger(contactId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const existing = await loadContact(supabase, clientId, contactId);
  if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  const { error } = await supabase
    .from('client_contacts')
    .delete()
    .eq('id', contactId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If we just deleted the primary, clear the cache on clients. The user
  // can mark another contact as primary if they want.
  if (existing.is_primary) {
    await syncClientCacheToPrimary(supabase, clientId);
  }

  await audit({
    userId: auth.userId,
    action: 'delete',
    resourceType: 'client',
    resourceId: clientId,
    metadata: { kind: 'contact', contact_id: contactId, was_primary: existing.is_primary },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
