const { spawn, execSync } = require('child_process');
const path = require('path');

/**
 * Checks if the Claude Code CLI is installed and available.
 */
function isCliAvailable() {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the command and args for spawning claude CLI.
 */
function buildCliCommand(prompt) {
  return {
    command: 'claude',
    args: ['--print', prompt],
  };
}

/**
 * Spawns Claude Code CLI with the given prompt.
 * Returns a promise that resolves with the output or rejects with an error.
 *
 * @param {string} prompt - The prompt to send to Claude
 * @param {object} options - Optional settings
 * @param {string} options.cwd - Working directory for the CLI process
 * @param {number} options.timeout - Timeout in ms (default: 300000 = 5 min)
 * @returns {Promise<{output: string, exitCode: number}>}
 */
function runCli(prompt, options = {}) {
  const { cwd, timeout = 300000 } = options;
  const { command, args } = buildCliCommand(prompt);

  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: cwd || process.cwd(),
      timeout,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ output: stdout.trim(), exitCode: code });
      } else {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}

/**
 * Runs Claude CLI and tracks the job in the generation_jobs table.
 * Updates job status on completion or failure.
 *
 * @param {object} db - Database connection
 * @param {number} dealId - Deal ID to link the job to
 * @param {string} type - Job type (analysis_deck, proposal, ai_content)
 * @param {string} prompt - The prompt to send
 * @param {object} options - Optional settings passed to runCli
 */
async function runTrackedJob(db, dealId, type, prompt, options = {}) {
  // Create the job record
  const result = db.prepare(
    `INSERT INTO generation_jobs (deal_id, type, status) VALUES (?, ?, 'running')`
  ).run(dealId, type);
  const jobId = result.lastInsertRowid;

  try {
    const { output } = await runCli(prompt, options);

    db.prepare(
      `UPDATE generation_jobs SET status = 'completed', output = ?, completed_at = datetime('now') WHERE id = ?`
    ).run(output, jobId);

    // Log activity
    db.prepare(
      `INSERT INTO activities (deal_id, type, content, metadata) VALUES (?, 'system', ?, ?)`
    ).run(dealId, `AI generation completed: ${type}`, JSON.stringify({ job_id: jobId }));

    return { jobId, output, status: 'completed' };
  } catch (err) {
    db.prepare(
      `UPDATE generation_jobs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`
    ).run(err.message, jobId);

    // Log error as activity
    db.prepare(
      `INSERT INTO activities (deal_id, type, content, metadata) VALUES (?, 'system', ?, ?)`
    ).run(dealId, `AI generation failed: ${type} — ${err.message}`, JSON.stringify({ job_id: jobId }));

    return { jobId, error: err.message, status: 'failed' };
  }
}

module.exports = { isCliAvailable, buildCliCommand, runCli, runTrackedJob };
