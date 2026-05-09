// GET  /api/clients/[id]/contacts — list contacts for a client (primary first)
// POST /api/clients/[id]/contacts — add a contact; if `is_primary=true`,
//   demotes any existing primary in the same client and syncs the legacy
//   cache fields on crm.clients to match.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import { ClientContactCreateSchema } from '@/lib/schemas';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('client_contacts')
    .select('*')
    .eq('client_id', clientId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ contacts: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });
  }

  let body;
  try { body = ClientContactCreateSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid body' }, { status: 400 });
  }

  // Verify client exists.
  const { data: client } = await supabase
    .from('clients').select('id').eq('id', clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // If creating as primary, demote any existing primary first so the
  // partial UNIQUE index doesn't block the insert.
  if (body.is_primary) {
    await supabase
      .from('client_contacts')
      .update({ is_primary: false })
      .eq('client_id', clientId)
      .eq('is_primary', true);
  }

  const { data: contact, error } = await supabase
    .from('client_contacts')
    .insert({
      client_id: clientId,
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      role: body.role ?? null,
      preferred_contact: body.preferred_contact ?? null,
      notes: body.notes ?? null,
      is_primary: body.is_primary ?? false,
    })
    .select('*')
    .single();
  if (error || !contact) {
    return NextResponse.json({ error: error?.message || 'Failed to create contact' }, { status: 500 });
  }

  // Sync the legacy cache on clients when this contact is primary, so the
  // ai-prompts / scrub / import-clients code paths that read the cached
  // primary_contact_name + email + phone + role + preferred_contact stay
  // accurate without code changes.
  if (contact.is_primary) {
    await supabase.from('clients').update({
      primary_contact_name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role,
      preferred_contact: contact.preferred_contact,
    }).eq('id', clientId);
  }

  await audit({
    userId: auth.userId,
    action: 'create',
    resourceType: 'client',
    resourceId: clientId,
    metadata: { kind: 'contact', contact_id: contact.id, is_primary: contact.is_primary },
    request: req,
  });

  return NextResponse.json({ contact }, { status: 201 });
}
