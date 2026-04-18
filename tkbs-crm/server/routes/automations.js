const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { isCliAvailable, runCli } = require('../services/claude-cli');
const { buildPrompt } = require('../services/ai-prompts');
const { getLatestBrandProfile } = require('../services/brand-profile-loader');

router.use(requireAuth);

// Registry of generation workflows. Each automation pins a prompt type and
// declares its inputs. Adding a new kind means adding a row here + (if needed)
// a new case in ai-prompts.buildPrompt.
const AUTOMATIONS = {
  proposal: {
    promptType: 'proposal_content',
    jobType: 'proposal',
    requiresEngagement: true,
    usesBrandProfile: true,
  },
};

function logActivity(db, clientId, engagementId, type, content, metadata) {
  try {
    db.prepare(
      `INSERT INTO activities (client_id, engagement_id, type, content, metadata)
       VALUES (?, ?, ?, ?, ?)`
    ).run(clientId, engagementId || null, type, content, JSON.stringify(metadata || {}));
  } catch (e) { /* best-effort */ }
}

// POST /api/automations/run — kick off a generation asynchronously.
router.post('/run', (req, res) => {
  const { automation, client_id, engagement_id } = req.body || {};

  const meta = AUTOMATIONS[automation];
  if (!meta) {
    return res.status(400).json({ error: `Unknown automation: ${automation}. Available: ${Object.keys(AUTOMATIONS).join(', ')}` });
  }
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });
  if (meta.requiresEngagement && !engagement_id) {
    return res.status(400).json({ error: 'engagement_id is required for this automation' });
  }

  const client = req.db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  let engagement = null;
  if (engagement_id) {
    engagement = req.db.prepare(
      'SELECT * FROM engagements WHERE id = ? AND client_id = ?'
    ).get(engagement_id, client_id);
    if (!engagement) return res.status(400).json({ error: 'Engagement does not belong to this client' });
  }

  if (!isCliAvailable()) {
    return res.status(503).json({
      error: 'Claude Code CLI not installed. Run: npm install -g @anthropic-ai/claude-code',
    });
  }

  let brandProfile = null;
  let brandSource = null;
  if (meta.usesBrandProfile) {
    const loaded = getLatestBrandProfile(req.db, client_id);
    if (loaded) { brandProfile = loaded.profile; brandSource = loaded.source; }
  }

  const prompt = buildPrompt(meta.promptType, engagement, client, brandProfile);

  // Create the job record synchronously so the client has an id to poll against.
  const inserted = req.db.prepare(
    `INSERT INTO generation_jobs (engagement_id, type, status) VALUES (?, ?, 'running')`
  ).run(engagement_id || null, meta.jobType);
  const jobId = inserted.lastInsertRowid;

  res.json({
    job_id: jobId,
    automation,
    brand_profile_source: brandSource,
    status: 'running',
  });

  // Fire Claude asynchronously — never block the HTTP response on CLI runtime.
  runCli(prompt)
    .then(({ output }) => {
      req.db.prepare(
        `UPDATE generation_jobs
         SET status = 'completed', output = ?, completed_at = datetime('now')
         WHERE id = ?`
      ).run(output, jobId);
      logActivity(
        req.db, client_id, engagement_id || null, 'system',
        `Generated ${meta.jobType} via automation`,
        { job_id: jobId, automation, brand_profile_source: brandSource },
      );
    })
    .catch((err) => {
      req.db.prepare(
        `UPDATE generation_jobs
         SET status = 'failed', error = ?, completed_at = datetime('now')
         WHERE id = ?`
      ).run(err.message, jobId);
      logActivity(
        req.db, client_id, engagement_id || null, 'system',
        `Automation ${automation} failed: ${err.message}`,
        { job_id: jobId, automation },
      );
    });
});

// GET /api/automations/job/:id — poll for job status + output.
router.get('/job/:id', (req, res) => {
  const job = req.db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job });
});

// GET /api/automations/catalog — what's runnable. Used by the UI.
router.get('/catalog', (req, res) => {
  const catalog = Object.entries(AUTOMATIONS).map(([key, meta]) => ({
    key,
    requiresEngagement: meta.requiresEngagement,
    usesBrandProfile: meta.usesBrandProfile,
  }));
  res.json({ automations: catalog });
});

module.exports = router;
