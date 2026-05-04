// GET  /api/clients — list with engagement rollups + filters + sort
// POST /api/clients — create

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-auth';

const SORT_COLUMNS = new Set([
  'created_at', 'name', 'lifetime_revenue', 'last_activity_at', 'fit_score',
]);

export async function GET(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { searchParams } = req.nextUrl;
  const ownerId = searchParams.get('owner_id');
  const industry = searchParams.get('industry');
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const sortBy = searchParams.get('sort_by') || 'created_at';
  const sortDir = searchParams.get('sort_dir') === 'asc' ? 'asc' : 'desc';
  const sortColumn = SORT_COLUMNS.has(sortBy) ? sortBy : 'created_at';

  let query = supabase.from('clients_with_rollups').select('*');
  if (ownerId) query = query.eq('owner_id', ownerId);
  if (industry) query = query.eq('industry', industry);
  if (status) {
    // Filter clients that have at least one engagement in the given status.
    // Using a sub-select via .in() requires a separate query; simpler is to
    // fetch matching client_ids first.
    const { data: ids } = await supabase
      .from('engagements')
      .select('client_id')
      .eq('status', status);
    const clientIds = (ids || []).map((r) => r.client_id);
    if (clientIds.length === 0) return NextResponse.json({ clients: [] });
    query = query.in('id', clientIds);
  }
  if (search) {
    // Postgres ILIKE — case-insensitive across name, email, contact, website
    const pattern = `%${search}%`;
    query = query.or(
      `name.ilike.${pattern},email.ilike.${pattern},primary_contact_name.ilike.${pattern},website.ilike.${pattern}`,
    );
  }
  query = query.order(sortColumn, { ascending: sortDir === 'asc' });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clients: data });
}

const CreateBody = z.object({
  name: z.string().min(1),
  website: z.string().nullish(),
  industry: z.string().nullish(),
  location: z.string().nullish(),
  type: z.enum(['B2B', 'B2C']).nullish(),
  primary_contact_name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  role: z.string().nullish(),
  preferred_contact: z.enum(['email', 'phone', 'text', 'linkedin']).nullish(),
  employee_count: z.string().nullish(),
  revenue_estimate: z.string().nullish(),
  notes: z.string().nullish(),
  additional_contacts: z.array(z.any()).optional(),
  social_links: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  let body;
  try {
    body = CreateBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid body' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ ...body, owner_id: auth.userId })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ client: data }, { status: 201 });
}
