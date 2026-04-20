/**
 * Loads the "best" Brand Profile we have for a client — the canonical source
 * of truth for Automations (proposal generation, etc.).
 *
 * Precedence:
 *   1. clients.brand_profile if non-empty (manual edits + merged call applications)
 *   2. Most recent approved call extraction (backward-compat fallback for clients
 *      that were onboarded before we added the client-level brand profile)
 *   3. Most recent pending extraction
 *   4. Any extraction, most recent first
 *
 * Returns `{ profile, source }` or null if nothing is available.
 */

function isMeaningful(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (const v of Object.values(obj)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && Object.keys(v).length === 0) continue;
    return true;
  }
  return false;
}

function getLatestBrandProfile(db, clientId) {
  // 1. Client-level canonical profile.
  const client = db.prepare(
    'SELECT brand_profile, brand_profile_sources FROM clients WHERE id = ?'
  ).get(clientId);
  if (client) {
    let profile = null;
    try { profile = JSON.parse(client.brand_profile || '{}'); } catch (e) {}
    if (isMeaningful(profile)) {
      let sources = {};
      try { sources = JSON.parse(client.brand_profile_sources || '{}'); } catch (e) {}
      return {
        profile,
        source: { origin: 'client', sources },
      };
    }
  }

  // 2-4. Fall back to call extractions (legacy clients, or clients that haven't
  // applied any call yet).
  const rows = db.prepare(`
    SELECT id, extracted_profile_json, review_status, call_date, created_at
    FROM call_recordings
    WHERE client_id = ? AND extracted_profile_json IS NOT NULL
    ORDER BY
      CASE review_status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
      created_at DESC
  `).all(clientId);

  for (const row of rows) {
    let payload;
    try { payload = JSON.parse(row.extracted_profile_json); } catch (e) { continue; }
    if (!payload || !payload.profile) continue;

    return {
      profile: payload.profile,
      source: {
        origin: 'call',
        call_recording_id: row.id,
        review_status: row.review_status,
        call_date: row.call_date,
        created_at: row.created_at,
        completion_percent: payload.completion_percent,
      },
    };
  }
  return null;
}

module.exports = { getLatestBrandProfile };
