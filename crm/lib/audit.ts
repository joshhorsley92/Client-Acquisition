import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';

// Writes to crm.audit_log via the service-role client. RLS makes audit_log
// admin-read-only and writes go through service-role only — direct user-scoped
// inserts would be silently dropped.
//
// Fire-and-forget: a failed audit write must never break the request that
// triggered it. We log to the server console and move on.

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'extract_brand_profile'
  | 'apply_brand_profile'
  | 'run_automation'
  | 'import_csv'
  | 'recompute_fit_score'
  | 'update_icp'
  | 'create_user'
  | 'delete_user';

export type AuditResource =
  | 'client'
  | 'engagement'
  | 'call'
  | 'automation_job'
  | 'user'
  | 'icp_config'
  | 'integration';

interface AuditEntry {
  userId: string;
  action: AuditAction;
  resourceType?: AuditResource;
  resourceId?: string | number;
  metadata?: Record<string, unknown>;
  request?: NextRequest | Request;
}

function extractIp(request?: NextRequest | Request): string | null {
  if (!request) return null;
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return request.headers.get('x-real-ip');
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('audit_log').insert({
      user_id: entry.userId,
      action: entry.action,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId != null ? String(entry.resourceId) : null,
      metadata: entry.metadata ?? {},
      ip_address: extractIp(entry.request),
    });
    if (error) {
      console.error('[audit] insert failed:', error.message);
    }
  } catch (err) {
    console.error('[audit] unexpected error:', err);
  }
}
