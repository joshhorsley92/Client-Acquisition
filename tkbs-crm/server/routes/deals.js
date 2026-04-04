const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { executeStageActions } = require('../services/stage-actions');
const { runTrackedJob, isCliAvailable } = require('../services/claude-cli');
const { buildPrompt, getPromptTypesForStage } = require('../services/ai-prompts');

router.use(requireAuth);

router.get('/', (req, res) => {
  let query = 'SELECT d.*, c.name as company_name, ct.name as contact_name FROM deals d LEFT JOIN companies c ON d.company_id = c.id LEFT JOIN contacts ct ON d.contact_id = ct.id';
  const conditions = [];
  const params = [];

  if (req.query.stage) {
    conditions.push('d.stage = ?');
    params.push(req.query.stage);
  }

  if (req.query.owner_id) {
    conditions.push('d.owner_id = ?');
    params.push(req.query.owner_id);
  }
  if (req.query.source) {
    conditions.push('d.source = ?');
    params.push(req.query.source);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY d.created_at DESC';
  const deals = req.db.prepare(query).all(...params);
  res.json({ deals });
});

router.get('/:id', (req, res) => {
  const deal = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  const company = deal.company_id
    ? req.db.prepare('SELECT * FROM companies WHERE id = ?').get(deal.company_id)
    : null;
  const contact = deal.contact_id
    ? req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(deal.contact_id)
    : null;
  const tasks = req.db.prepare('SELECT * FROM tasks WHERE deal_id = ? ORDER BY due_at ASC').all(deal.id);
  const documents = req.db.prepare('SELECT * FROM documents WHERE deal_id = ? ORDER BY created_at DESC').all(deal.id);

  res.json({ deal, company, contact, tasks, documents });
});

router.post('/', (req, res) => {
  const { contact_id, company_id, stage, source, source_detail, estimated_value, package_type, services_discussed } = req.body;
  if (!contact_id && !company_id) {
    return res.status(400).json({ error: 'contact_id or company_id is required' });
  }

  const dealStage = stage || 'lead';

  const result = req.db.prepare(
    `INSERT INTO deals (contact_id, company_id, stage, source, source_detail, estimated_value, package_type, services_discussed, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    contact_id || null, company_id || null, dealStage, source || null, source_detail || null,
    estimated_value || 0, package_type || null, JSON.stringify(services_discussed || []),
    req.user.id
  );

  const deal = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(result.lastInsertRowid);

  // Fire stage actions for initial stage
  try {
    executeStageActions(req.db, deal.id, dealStage, req.user.id);
  } catch (e) {}

  res.status(201).json({ deal });
});

router.patch('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Deal not found' });

  const isStageChange = req.body.stage && req.body.stage !== existing.stage;

  // Require lost_reason for closed_lost
  if (isStageChange && req.body.stage === 'closed_lost' && !req.body.lost_reason) {
    return res.status(400).json({ error: 'lost_reason is required when closing a deal as lost' });
  }

  const fields = [
    'contact_id', 'company_id', 'stage', 'source', 'source_detail',
    'estimated_value', 'package_type', 'pricing_notes', 'call_notes',
    'research_findings', 'objections_noted', 'lost_reason', 'owner_id',
  ];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (req.body.services_discussed !== undefined) {
    updates.push('services_discussed = ?');
    values.push(JSON.stringify(req.body.services_discussed));
  }

  if (isStageChange) {
    updates.push("stage_entered_at = datetime('now', 'subsec')");

    if (req.body.stage === 'closed_won' || req.body.stage === 'closed_lost') {
      updates.push("closed_at = datetime('now', 'subsec')");
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    req.db.prepare(`UPDATE deals SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  // Log stage change as activity
  if (isStageChange) {
    req.db.prepare(
      `INSERT INTO activities (deal_id, contact_id, type, content, created_by)
       VALUES (?, ?, 'stage_change', ?, ?)`
    ).run(
      req.params.id,
      existing.contact_id,
      `Stage changed from ${existing.stage} to ${req.body.stage}`,
      req.user.id
    );

    // Execute stage actions
    const actionResult = executeStageActions(req.db, parseInt(req.params.id), req.body.stage, req.user.id);
  }

  const deal = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  res.json({ deal });
});

// GET /api/deals/:id/generation-status
router.get('/:id/generation-status', (req, res) => {
  const jobs = req.db.prepare(
    'SELECT * FROM generation_jobs WHERE deal_id = ? ORDER BY started_at DESC'
  ).all(req.params.id);
  const active = jobs.find(j => j.status === 'running');
  res.json({ jobs, activeJob: active || null });
});

// POST /api/deals/:id/generate — trigger AI content generation
router.post('/:id/generate', async (req, res) => {
  const deal = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  if (!isCliAvailable()) {
    return res.status(503).json({ error: 'Claude Code CLI is not installed. Run: npm install -g @anthropic-ai/claude-code' });
  }

  const company = deal.company_id ? req.db.prepare('SELECT * FROM companies WHERE id = ?').get(deal.company_id) : {};
  const contact = deal.contact_id ? req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(deal.contact_id) : {};

  const promptType = req.body.prompt_type || getPromptTypesForStage(deal.stage)[0] || 'generic';
  const prompt = buildPrompt(promptType, deal, contact, company);

  // Start async — respond immediately
  res.json({ status: 'started', message: 'AI generation started. Poll /generation-status for updates.' });

  // Run in background
  runTrackedJob(req.db, deal.id, 'ai_content', prompt).catch(err => {
    console.error('Generation job failed:', err.message);
  });
});

router.delete('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Deal not found' });

  req.db.prepare('DELETE FROM deals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
