/**
 * Loads the "best" Brand Profile we have for a client, drawn from the
 * extracted_profile_json field on call_recordings.
 *
 * Preference order:
 *   1. most recent approved extraction,
 *   2. most recent pending extraction,
 *   3. any extraction, most recent first.
 *
 * Returns `{ profile, source }` or null if no extraction exists for the
 * client. `source` carries metadata the UI can show ("from call on X,
 * reviewed Y") so generated output is traceable.
 */

function getLatestBrandProfile(db, clientId) {
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
