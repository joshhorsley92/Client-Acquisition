// GET /api/settings/audit-log — admin-only, paginated audit_log read

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const result = await requireAdminAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '50', 10) || 50));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const [{ count, error: countErr }, { data, error: rowsErr }] = await Promise.all([
    supabase.from('audit_log').select('*', { count: 'exact', head: true }),
    supabase
      .from('audit_log')
      .select('id, user_id, action, resource_type, resource_id, metadata, ip_address, created_at, profiles(name, email)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to),
  ]);
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  const logs = (data || []).map((row: any) => ({
    ...row,
    user_name: row.profiles?.name,
    user_email: row.profiles?.email,
    profiles: undefined,
  }));
  return NextResponse.json({ logs, total: count || 0, page, limit });
}
