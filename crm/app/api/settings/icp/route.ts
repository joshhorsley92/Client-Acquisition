// GET /api/settings/icp  — admin-only, read ICP config from crm.integration_settings
// PUT /api/settings/icp  — admin-only, write ICP config; validates weights sum to 100
//
// In v1.0 the ICP config lives in crm.integration_settings as a row with
// type='icp_config'. The legacy SQLite version stored it in a JSON file
// on disk (server/config/icp.json) — that path doesn't exist on Netlify
// Functions, so we move it to the database. Default config seeds on first
// read if no row exists yet.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, isAuthError } from '@/lib/api-auth';
import { audit } from '@/lib/audit';

const ICP_TYPE = 'icp_config';

const DEFAULT_ICP = {
  version: 1,
  updated_at: new Date().toISOString().slice(0, 10),
  notes: 'TKBS Ideal Customer Profile — source of truth for the Fit Score engine.',
  hourly_rate_usd: 100,
  target_industries: {
    included: ['retail', 'boutique', 'service', 'contractor', 'b2b'],
    excluded: ['large_corporation', 'art_sector', 'raw_materials', 'legal', 'medical', 'healthcare', 'insurance', 'accounting'],
  },
  revenue_range: { min_usd: 500_000, max_usd: 10_000_000 },
  geographic_preference: { primary_region: 'Michigan', primary_region_bonus: true, national_ok: true, international_ok: false },
  scoring_weights: { icp_match: 40, readiness_signals: 30, engagement: 30 },
};

export async function GET() {
  const result = await requireAdminAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;

  const { data } = await supabase
    .from('integration_settings')
    .select('config')
    .eq('type', ICP_TYPE)
    .maybeSingle();

  if (data?.config) return NextResponse.json(data.config);

  // First read — seed with defaults so the editor renders something useful.
  await supabase
    .from('integration_settings')
    .insert({ type: ICP_TYPE, config: DEFAULT_ICP, enabled: true });
  return NextResponse.json(DEFAULT_ICP);
}

export async function PUT(req: NextRequest) {
  const result = await requireAdminAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  const icp = await req.json().catch(() => null);
  if (!icp || typeof icp !== 'object') {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  // Validate scoring weights sum to 100
  const weights = icp.scoring_weights || {};
  const sum = (Number(weights.icp_match) || 0) + (Number(weights.readiness_signals) || 0) + (Number(weights.engagement) || 0);
  if (sum !== 100) {
    return NextResponse.json({ error: `Scoring weights must sum to 100 (currently ${sum})` }, { status: 400 });
  }

  // Validate revenue range
  const rev = icp.revenue_range || {};
  if (rev.min_usd != null && rev.max_usd != null && Number(rev.min_usd) >= Number(rev.max_usd)) {
    return NextResponse.json({ error: 'Revenue min must be less than max' }, { status: 400 });
  }

  icp.updated_at = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from('integration_settings')
    .upsert({ type: ICP_TYPE, config: icp, enabled: true }, { onConflict: 'type' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit({
    userId: auth.userId,
    action: 'update_icp',
    resourceType: 'icp_config',
    metadata: {
      target_industries_included: icp.target_industries?.included?.length,
      target_industries_excluded: icp.target_industries?.excluded?.length,
      revenue_min: icp.revenue_range?.min_usd,
      revenue_max: icp.revenue_range?.max_usd,
    },
    request: req,
  });

  return NextResponse.json(icp);
}
