// Lead-acquisition pipeline runner.
//
// Spawns the Python pipeline (`main.py scrape county` -> `enrich` -> `push`)
// as background subprocesses and streams stdout/stderr into the row's
// log_output column so the UI can poll and display progress. Final push
// counts are parsed from main.py's stdout and persisted as
// pushed/skipped/error totals on the job row.
//
// Job lifecycle:  pending -> running -> succeeded | failed
// (Cancelled is reserved for a later "stop" feature; not yet wired.)

const path = require('path');
const { spawn } = require('child_process');

// Re-uses the Whisper python override so a single env var picks the right
// interpreter for both transcription and the lead pipeline.
const PYTHON_BIN = process.env.WHISPER_PYTHON || process.env.TKBS_PYTHON || 'python';
// Repo root is two levels above this file (tkbs-crm/server/services/...).
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function nowIso() {
  return new Date().toISOString();
}

function setStatus(db, jobId, status, fields = {}) {
  const cols = ['status = ?'];
  const vals = [status];
  for (const [k, v] of Object.entries(fields)) {
    cols.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(jobId);
  db.prepare(`UPDATE scrape_jobs SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
}

// Append a chunk of subprocess output to the log column. Tolerates very
// large outputs by capping at 200 KB to keep the row small enough to ship
// over the wire on every poll.
const MAX_LOG_BYTES = 200 * 1024;
function appendLog(db, jobId, text) {
  if (!text) return;
  const row = db.prepare('SELECT log_output FROM scrape_jobs WHERE id = ?').get(jobId);
  if (!row) return;
  let combined = (row.log_output || '') + text;
  if (combined.length > MAX_LOG_BYTES) {
    const truncated = combined.length - MAX_LOG_BYTES;
    combined = '[…truncated ' + truncated + ' bytes…]\n' + combined.slice(-MAX_LOG_BYTES);
  }
  db.prepare('UPDATE scrape_jobs SET log_output = ? WHERE id = ?').run(combined, jobId);
}

function parsePushSummary(log) {
  if (!log) return { pushed: 0, skipped: 0, errors: 0 };
  // main.py prints "Pushed: N", "Skipped: M", "Errors: E" — match the LAST
  // occurrence in case earlier steps printed similar lines.
  const grab = (label) => {
    const re = new RegExp(`${label}:\\s*(\\d+)`, 'g');
    let last = null;
    let m;
    while ((m = re.exec(log)) !== null) last = m[1];
    return last == null ? 0 : parseInt(last, 10);
  };
  return {
    pushed: grab('Pushed'),
    skipped: grab('Skipped'),
    errors: grab('Errors'),
  };
}

// Run a single Python step. Resolves on exit code 0; rejects otherwise.
function runStep(db, jobId, label, args, env) {
  return new Promise((resolve, reject) => {
    appendLog(db, jobId, `\n[runner] ${nowIso()}  step: ${label}\n[runner] ${PYTHON_BIN} ${args.join(' ')}\n`);

    const proc = spawn(PYTHON_BIN, args, {
      cwd: REPO_ROOT,
      env,
      windowsHide: true,
    });

    proc.stdout.on('data', (chunk) => appendLog(db, jobId, chunk.toString()));
    proc.stderr.on('data', (chunk) => appendLog(db, jobId, chunk.toString()));

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(
          `Could not start "${PYTHON_BIN}". Set WHISPER_PYTHON or TKBS_PYTHON to the right Python executable.`
        ));
      } else {
        reject(err);
      }
    });

    proc.on('exit', (code) => {
      appendLog(db, jobId, `\n[runner] step ${label} exited with code ${code}\n`);
      if (code === 0) resolve();
      else reject(new Error(`Step "${label}" exited with code ${code}`));
    });
  });
}

// Drives one scrape_jobs row through scrape -> enrich -> push. Resolves
// quietly on success or failure — the row's status carries the outcome.
async function runScrapeJob(db, jobId) {
  if (!db || !jobId) throw new Error('runScrapeJob requires db and jobId');

  const job = db.prepare('SELECT * FROM scrape_jobs WHERE id = ?').get(jobId);
  if (!job) return;
  let params = {};
  try { params = JSON.parse(job.params || '{}'); } catch (e) { /* ignore */ }

  setStatus(db, jobId, 'running', { started_at: nowIso() });

  const env = { ...process.env };
  if (Array.isArray(params.counties) && params.counties.length) {
    env.TKBS_COUNTIES = params.counties.join(',');
  }
  if (Array.isArray(params.industries) && params.industries.length) {
    env.TKBS_INDUSTRIES = params.industries.join(',');
  }

  appendLog(db, jobId,
    `[runner] ${nowIso()}  Starting lead-acquisition pipeline\n` +
    `[runner] params: ${JSON.stringify(params)}\n`
  );

  try {
    await runStep(db, jobId, 'scrape', ['main.py', 'scrape', 'county'], env);
    await runStep(db, jobId, 'enrich', ['main.py', 'enrich'], env);
    await runStep(db, jobId, 'push', ['main.py', 'push'], env);

    const fresh = db.prepare('SELECT log_output FROM scrape_jobs WHERE id = ?').get(jobId);
    const summary = parsePushSummary(fresh?.log_output || '');
    setStatus(db, jobId, 'succeeded', {
      finished_at: nowIso(),
      pushed_count: summary.pushed,
      skipped_count: summary.skipped,
      error_count: summary.errors,
    });
  } catch (err) {
    setStatus(db, jobId, 'failed', {
      finished_at: nowIso(),
      error: err.message || 'Pipeline failed.',
    });
  }
}

module.exports = { runScrapeJob, parsePushSummary };
