const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { executeStatusActions } = require('../services/status-actions');
const { runTrackedJob, isCliAvailable } = require('../services/claude-cli');
const { buildPrompt, getPromptTypesForStatus } = require('../services/ai-prompts');

router.use(requireAuth);

router.get('/', (req, res) => {
  let query = `
    SELECT e.*, c.name AS client_name
    FROM engagements e
    JOIN clients c ON e.client_id = c.id
  `;
  const conditions = [];
  const params = [];

  if (req.query.client_id) {
    conditions.push('e.client_id = ?');
    params.push(req.query.client_id);
  }
  if (req.query.status) {
    conditions.push('e.status = ?');
    params.push(req.query.status);
  }
  if (req.query.owner_id) {
    conditions.push('e.owner_id = ?');
    params.push(req.query.owner_id);
  }
  if (req.query.source) {
    conditions.push('e.source = ?');
    params.push(req.query.source);
  }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY e.opened_at DESC';

  const engagements = req.db.prepare(query).all(...params);
  res.json({ engagements });
});

router.get('/:id', (req, res) => {
  const engagement = req.db.prepare('SELECT * FROM engagements WHERE id = ?').get(req.params.id);
  if (!engagement) return res.status(404).json({ error: 'Engagement not found' });

  const client = req.db.prepare('SELECT * FROM clients WHERE id = ?').get(engagement.client_id);
  const documents = req.db.prepare(
    'SELECT * FROM documents WHERE engagement_id = ? ORDER BY created_at DESC'
  ).all(engagement.id);
  const activities = req.db.prepare(
    'SELECT * FROM activities WHERE engagement_id = ? ORDER BY created_at DESC'
  ).all(engagement.id);

  res.json({ engagement, client, documents, activities });
});

router.post('/', (req, res) => {
  const {
    client_id, status, package_type, source, source_detail,
    estimated_value, notes, owner_id,
  } = req.body;

  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  const clientExists = req.db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
  if (!clientExists) return res.status(400).json({ error: 'client_id does not match a client' });

  const engagementStatus = status || 'new';

  const result = req.db.prepare(
    `INSERT INTO engagements (
       client_id, status, package_type, source, source_detail,
       estimated_value, notes, owner_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    client_id, engagementStatus,
    package_type || null, source || null, source_detail || null,
    estimated_value || 0, notes || null,
    owner_id || req.user.id,
  );

  const engagement = req.db.prepare('SELECT * FROM engagements WHERE id = ?').get(result.lastInsertRowid);

  try {
    executeStatusActions(req.db, engagement.id, engagementStatus, req.user.id);
  } catch (e) { /* non-fatal */ }

  res.status(201).json({ engagement });
});

router.patch('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM engagements WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Engagement not found' });

  const isStatusChange = req.body.status && req.body.status !== existing.status;

  if (isStatusChange && req.body.status === 'lost' && !req.body.lost_reason && !existing.lost_reason) {
    return res.status(400).json({ error: 'lost_reason is required when closing an engagement as lost' });
  }

  const fields = [
    'client_id', 'status', 'package_type', 'source', 'source_detail',
    'estimated_value', 'closed_value', 'lost_reason', 'notes', 'owner_id',
  ];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (isStatusChange) {
    updates.push("status_changed_at = datetime('now', 'subsec')");
    if (req.body.status === 'won' || req.body.status === 'lost') {
      updates.push("closed_at = datetime('now', 'subsec')");
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    req.db.prepare(`UPDATE engagements SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  if (isStatusChange) {
    req.db.prepare(
      `INSERT INTO activities (client_id, engagement_id, type, content, created_by)
       VALUES (?, ?, 'status_change', ?, ?)`
    ).run(
      existing.client_id,
      parseInt(req.params.id, 10),
      `Status changed from ${existing.status} to ${req.body.status}`,
      req.user.id,
    );

    try {
      executeStatusActions(req.db, parseInt(req.params.id, 10), req.body.status, req.user.id);
    } catch (e) { /* non-fatal */ }
  }

  const engagement = req.db.prepare('SELECT * FROM engagements WHERE id = ?').get(req.params.id);
  res.json({ engagement });
});

router.delete('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT id FROM engagements WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Engagement not found' });
  req.db.prepare('DELETE FROM engagements WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/engagements/:id/generation-status
router.get('/:id/generation-status', (req, res) => {
  const jobs = req.db.prepare(
    'SELECT * FROM generation_jobs WHERE engagement_id = ? ORDER BY started_at DESC'
  ).all(req.params.id);
  const active = jobs.find((j) => j.status === 'running');
  res.json({ jobs, activeJob: active || null });
});

// POST /api/engagements/:id/generate — AI proposal/content generation
router.post('/:id/generate', (req, res) => {
  const engagement = req.db.prepare('SELECT * FROM engagements WHERE id = ?').get(req.params.id);
  if (!engagement) return res.status(404).json({ error: 'Engagement not found' });

  if (!isCliAvailable()) {
    return res.status(503).json({
      error: 'Claude Code CLI is not installed. Run: npm install -g @anthropic-ai/claude-code',
    });
  }

  const client = req.db.prepare('SELECT * FROM clients WHERE id = ?').get(engagement.client_id) || {};

  const promptType = req.body.prompt_type || getPromptTypesForStatus(engagement.status)[0] || 'generic';
  const prompt = buildPrompt(promptType, engagement, client);

  res.json({ status: 'started', message: 'AI generation started. Poll /generation-status for updates.' });

  runTrackedJob(req.db, engagement.id, 'ai_content', prompt).catch((err) => {
    console.error('Generation job failed:', err.message);
  });
});

module.exports = router;
