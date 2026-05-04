// GET /api/automations/catalog — what's runnable. Used by the UI.

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { AUTOMATIONS } from '@/services/automation-registry';

export async function GET() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;

  const catalog = Object.entries(AUTOMATIONS).map(([key, meta]) => ({
    key,
    requiresEngagement: meta.requiresEngagement,
    usesBrandProfile: meta.usesBrandProfile,
  }));
  return NextResponse.json({ automations: catalog });
}
