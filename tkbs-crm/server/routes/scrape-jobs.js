// Lead-acquisition pipeline jobs API.
//
// POST /api/scrape-jobs       — kick off a new scrape -> enrich -> push run
// GET  /api/scrape-jobs       — list recent jobs (newest first)
// GET  /api/scrape-jobs/:id   — fetch one job (used for polling)

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { runScrapeJob } = require('../services/scrape-job-runner');

router.use(requireAuth);

const ALLOWED_COUNTIES = ['Wayne', 'Oakland', 'Macomb'];
const ALLOWED_INDUSTRIES = ['retail/boutique', 'contractor_services'];

function startInBackground(db, jobId) {
  Promise.resolve()
    .then(() => runScrapeJob(db, jobId))
    .catch((err) => console.error(`scrape-job ${jobId} crashed:`, err));
}

router.post('/', (req, res) => {
  const inProgress = req.db.prepare(
    "SELECT id FROM scrape_jobs WHERE status IN ('pending','running') ORDER BY id DESC LIMIT 1"
  ).get();
  if (inProgress) {
    return res.status(409).json({
      error: 'A scrape job is already running. Wait for it to finish before starting another.',
      job_id: inProgress.id,
    });
  }

  const counties = Array.isArray(req.body.counties)
    ? req.body.counties.filter((c) => ALLOWED_COUNTIES.includes(c))
    : [];
  const industries = Array.isArray(req.body.industries)
    ? req.body.industries.filter((i) => ALLOWED_INDUSTRIES.includes(i))
    : [];

  const params = {
    counties: counties.length ? counties : ALLOWED_COUNTIES,
    industries: industries.length ? industries : ALLOWED_INDUSTRIES,
  };

  const result = req.db.prepare(`
    INSERT INTO scrape_jobs (status, params, created_by)
    VALUES ('pending', ?, ?)
  `).run(JSON.stringify(params), req.user.id);

  req.audit('scrape_job_started', 'scrape_job', result.lastInsertRowid, params);
  startInBackground(req.db, result.lastInsertRowid);

  const job = req.db.prepare('SELECT * FROM scrape_jobs WHERE id = ?').get(result.lastInsertRowid);
  res.status(202).json({ job });
});

router.get('/', (req, res) => {
  const jobs = req.db.prepare(`
    SELECT j.*, u.name AS created_by_name
    FROM scrape_jobs j
    LEFT JOIN users u ON u.id = j.created_by
    ORDER BY j.created_at DESC, j.id DESC
    LIMIT 50
  `).all();
  res.json({ jobs });
});

router.get('/:id', (req, res) => {
  const job = req.db.prepare('SELECT * FROM scrape_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job });
});

module.exports = router;
