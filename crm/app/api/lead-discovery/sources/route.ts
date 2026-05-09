// GET /api/lead-discovery/sources
// Lists the discovery sources that are currently configured (have their
// API keys set). The UI uses this to populate the Source dropdown — sources
// without their env vars are hidden so users don't pick them and get a 503.

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { listAvailableSources, SOURCES } from '@/services/lead-discovery/registry';

export async function GET() {
  const result = await requireAuth();
  if (isAuthError(result)) return result;

  return NextResponse.json({
    sources: listAvailableSources(),
    all: Object.values(SOURCES).map(({ key, label }) => ({
      key,
      label,
      available: SOURCES[key]!.isAvailable(),
    })),
  });
}
