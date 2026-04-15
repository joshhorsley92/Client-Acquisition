/**
 * Dashboard API client — wraps HTTP calls to the TKBS Customer Dashboards
 * repo's /api/crm/* endpoints. Single place for auth header, retries, and
 * consistent error shape.
 *
 * Required env vars (set in tkbs-crm/.env):
 *   DASHBOARD_API_URL      — base URL, e.g. http://localhost:3000 or https://dashboard.turnkeymarketing.com
 *   DASHBOARD_SERVICE_KEY  — matches CRM_SERVICE_KEY on the Dashboard side
 *
 * All methods return { ok, status, data, error } — the caller never has to
 * try/catch. Use `if (!result.ok) { ... }` to handle failure.
 */

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;   // total attempts = 1 + retries = 3
const RETRY_BACKOFF_MS = 500;

function config() {
  const baseUrl = process.env.DASHBOARD_API_URL;
  const serviceKey = process.env.DASHBOARD_SERVICE_KEY;
  if (!baseUrl || !serviceKey) {
    return { error: 'DASHBOARD_API_URL and DASHBOARD_SERVICE_KEY must be set in tkbs-crm/.env' };
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), serviceKey };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Internal: run a fetch with timeout + retries on transient failures (5xx, network).
 * Never retries 4xx (they'll fail again the same way).
 */
async function request(method, pathAndQuery, body, { retries = DEFAULT_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const cfg = config();
  if (cfg.error) return { ok: false, status: 503, error: cfg.error };

  const url = `${cfg.baseUrl}${pathAndQuery}`;
  const headers = {
    'Authorization': `Bearer ${cfg.serviceKey}`,
    'Accept': 'application/json',
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    init.signal = controller.signal;

    try {
      const res = await fetch(url, init);
      clearTimeout(timeout);

      let data = null;
      const text = await res.text();
      if (text) {
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
      }

      if (res.ok) return { ok: true, status: res.status, data };

      // 4xx — don't retry, return the error from the Dashboard
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, status: res.status, error: data?.error || `Dashboard returned ${res.status}`, data };
      }

      // 5xx — retry
      lastError = { status: res.status, error: data?.error || `Dashboard ${res.status}` };
    } catch (err) {
      clearTimeout(timeout);
      const isAbort = err.name === 'AbortError';
      lastError = {
        status: 0,
        error: isAbort ? `Timeout after ${timeoutMs}ms` : `Network error: ${err.message || err}`,
      };
    }

    if (attempt < retries) {
      await sleep(RETRY_BACKOFF_MS * (attempt + 1)); // linear backoff
    }
  }

  return { ok: false, status: lastError?.status ?? 0, error: lastError?.error || 'Request failed' };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a prospect already exists on the Dashboard. Returns 404 (ok: false)
 * if not found — the caller should then call createProspect().
 */
async function findProspectByEmail(email) {
  return request('GET', `/api/crm/prospects/by-email/${encodeURIComponent(email)}`);
}

/**
 * Find-or-create a prospect. Idempotent — safe to call even if you didn't check
 * first. Returns 201 for new, 200 for existing.
 */
async function createProspect({ email, fullName, companyName }) {
  return request('POST', '/api/crm/prospects', {
    email,
    full_name: fullName || null,
    company_name: companyName,
  });
}

/**
 * PATCH a Brand Profile for an existing user. Fields passed in the body are
 * merged; unspecified fields are untouched. Returns the full updated profile.
 */
async function pushBrandProfile(userId, profileFields) {
  return request('PATCH', `/api/crm/prospects/${encodeURIComponent(userId)}/brand`, profileFields);
}

/**
 * Upgrade tier and create/fetch the launch_client for a user. Called at Closed Won.
 * @param {string} userId
 * @param {string} [tier='launch'] — one of 'launch', 'boost', 'orbit'
 */
async function activateLaunch(userId, tier = 'launch') {
  return request('POST', `/api/crm/prospects/${encodeURIComponent(userId)}/activate-launch`, { tier });
}

function isConfigured() {
  return !config().error;
}

module.exports = {
  findProspectByEmail,
  createProspect,
  pushBrandProfile,
  activateLaunch,
  isConfigured,
};
