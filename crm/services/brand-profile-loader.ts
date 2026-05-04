// Loads the "best" Brand Profile for a client — canonical source of truth
// for Automations.
//
// Precedence:
//   1. clients.brand_profile if non-empty (manual edits + merged call applies)
//   2. Most recent approved call extraction
//   3. Most recent pending extraction
//   4. Any extraction, most recent first
//
// Returns { profile, source } or null. `source` carries provenance metadata
// so the UI / activity log can hint where the profile came from.

// Loose Supabase shape — the schema-narrowed client from supabase-server
// has a different generic signature than the default that SupabaseClient
// is typed against, so we accept any here.
type SupabaseLike = {
  from: (table: string) => any;
};

export interface LoadedBrandProfile {
  profile: Record<string, unknown>;
  source:
    | { origin: 'client'; sources: Record<string, string> }
    | {
        origin: 'call';
        call_recording_id: number;
        review_status: string;
        call_date: string | null;
        created_at: string;
        completion_percent: number | null;
      };
}

function isMeaningful(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && Object.keys(v as object).length === 0) continue;
    return true;
  }
  return false;
}

export async function getLatestBrandProfile(
  supabase: SupabaseLike,
  clientId: number | string,
): Promise<LoadedBrandProfile | null> {
  // 1. Client-level canonical profile.
  const { data: client } = await supabase
    .from('clients')
    .select('brand_profile, brand_profile_sources')
    .eq('id', clientId)
    .single();

  if (client && isMeaningful(client.brand_profile)) {
    return {
      profile: client.brand_profile as Record<string, unknown>,
      source: {
        origin: 'client',
        sources: (client.brand_profile_sources as Record<string, string>) || {},
      },
    };
  }

  // 2-4. Fall back to call extractions, ranked by review_status then recency.
  const { data: rows } = await supabase
    .from('call_recordings')
    .select('id, extracted_profile_json, review_status, call_date, created_at')
    .eq('client_id', clientId)
    .not('extracted_profile_json', 'is', null)
    .order('created_at', { ascending: false });

  if (!rows || rows.length === 0) return null;

  // Stable sort: approved first, then pending, then anything else; recency
  // already came down from the SQL ORDER BY.
  const ranked = [...rows].sort((a, b) => {
    const order: Record<string, number> = { approved: 0, pending: 1 };
    return (order[a.review_status] ?? 2) - (order[b.review_status] ?? 2);
  });

  for (const row of ranked) {
    const payload = row.extracted_profile_json as
      | { profile?: Record<string, unknown>; completion_percent?: number }
      | null;
    if (!payload || !payload.profile) continue;
    return {
      profile: payload.profile,
      source: {
        origin: 'call',
        call_recording_id: row.id as number,
        review_status: row.review_status,
        call_date: row.call_date,
        created_at: row.created_at,
        completion_percent: payload.completion_percent ?? null,
      },
    };
  }
  return null;
}
