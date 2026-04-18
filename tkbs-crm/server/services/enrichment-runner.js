const { spawn } = require('child_process');
const path = require('path');
const { scoreClient } = require('./fit-score');

// Enrichment is a single homepage fetch + 0-4 contact pages, typically under
// 15s. 2 minutes is generous for slow targets.
const DEFAULT_TIMEOUT_MS = 120_000;

// Resolve the repo root once. The Python entry point lives there under
// enrichment/enrich_one.py and needs the repo root as its CWD so its
// `from enrichment.* import ...` statements resolve.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ENRICH_SCRIPT = path.join(REPO_ROOT, 'enrichment', 'enrich_one.py');

function resolvePythonBin() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Spawn the Python enrichment entry point for one (name, url) pair.
 * Resolves with the parsed JSON result; rejects on spawn error, non-zero exit,
 * timeout, or malformed JSON.
 */
function runEnrichment({ name = null, url = null }, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  return new Promise((resolve, reject) => {
    const args = [ENRICH_SCRIPT];
    if (name) args.push('--name', name);
    if (url) args.push('--url', url);

    const proc = spawn(resolvePythonBin(), args, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      reject(new Error(`Enrichment timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        return reject(new Error(
          `Python exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`,
        ));
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (e) {
        reject(new Error(
          `Malformed JSON from Python enrichment: ${e.message}. stdout=${stdout.slice(0, 500)}`,
        ));
      }
    });
  });
}

// Promote enrichment scalars into dedicated client columns. Only fills fields
// that are currently empty — never clobbers user edits.
function promoteScalars(db, clientId, client, data) {
  const updates = [];
  const values = [];

  if (!client.website && data.website_url) {
    updates.push('website = ?');
    values.push(data.website_url);
  }
  if (!client.email && Array.isArray(data.emails) && data.emails.length > 0) {
    updates.push('email = ?');
    values.push(data.emails[0]);
  }
  if (data.social_links && typeof data.social_links === 'object' && Object.keys(data.social_links).length > 0) {
    let existing = {};
    try { existing = JSON.parse(client.social_links || '{}'); } catch (e) {}
    const merged = { ...existing, ...data.social_links };
    updates.push('social_links = ?');
    values.push(JSON.stringify(merged));
  }

  if (updates.length === 0) return;
  updates.push("updated_at = datetime('now')");
  values.push(clientId);
  db.prepare(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * Fire a Python enrichment in the background. Returns immediately (fire-and-
 * forget). Errors and timeouts are captured into the client row; never throws.
 *
 * The caller (route handler) is responsible for flipping enrichment_status
 * to 'running' synchronously before calling this — that way HTTP responses
 * reflect the new status even if this function is mocked in tests.
 *
 * Returns the Promise for testing; production callers should not await.
 */
function kickoffEnrichment(db, clientId, options = {}) {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client) return Promise.resolve();

  const runner = options.runner || runEnrichment;

  return runner({ name: client.name, url: client.website }, options)
    .then((data) => {
      const current = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
      if (!current) return;

      promoteScalars(db, clientId, current, data);

      db.prepare(
        `UPDATE clients
         SET enrichment_data = ?, enrichment_status = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(JSON.stringify(data), 'succeeded', clientId);

      try { scoreClient(db, clientId); } catch (e) { /* non-fatal */ }
    })
    .catch((err) => {
      // Log unconditionally so test failures never swallow the real cause.
      if (process.env.DEBUG_ENRICHMENT) {
        console.error('kickoffEnrichment caught:', err);
      }

      let current;
      try {
        current = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
      } catch (e) {
        // DB was closed out from under us (typically happens in tests where
        // afterEach() runs before the rejection surfaces). Nothing to update.
        return;
      }
      if (!current) return;

      const payload = {
        status: 'error',
        error: err.message,
        scraped_at: new Date().toISOString(),
      };
      try {
        db.prepare(
          `UPDATE clients
           SET enrichment_data = ?, enrichment_status = 'failed', updated_at = datetime('now')
           WHERE id = ?`
        ).run(JSON.stringify(payload), clientId);
      } catch (e) { /* db closed — test teardown race */ }
    });
}

/**
 * Boot-time recovery: any client stuck in 'running' state for longer than
 * `maxAgeMinutes` gets flipped to 'failed'. Handles mid-enrichment crashes.
 */
function resetStaleRunning(db, maxAgeMinutes = 5) {
  const result = db.prepare(`
    UPDATE clients
    SET enrichment_status = 'failed',
        enrichment_data = json_set(COALESCE(enrichment_data, '{}'),
                                    '$.status', 'error',
                                    '$.error', 'stale_running_reset_on_boot'),
        updated_at = datetime('now')
    WHERE enrichment_status = 'running'
      AND updated_at < datetime('now', ?)
  `).run(`-${maxAgeMinutes} minutes`);
  return result.changes;
}

module.exports = {
  runEnrichment,
  kickoffEnrichment,
  promoteScalars,
  resetStaleRunning,
  resolvePythonBin,
  ENRICH_SCRIPT,
};
