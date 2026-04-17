const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

let chrono;
try { chrono = require('chrono-node'); } catch (e) { chrono = null; }

router.use(requireAuth);

router.get('/', (req, res) => {
  let query = 'SELECT t.*, d.company_id, c.name as company_name, ct.name as contact_name FROM tasks t LEFT JOIN deals d ON t.deal_id = d.id LEFT JOIN companies c ON d.company_id = c.id LEFT JOIN contacts ct ON d.contact_id = ct.id';
  const conditions = [];
  const params = [];

  if (req.query.deal_id) {
    conditions.push('t.deal_id = ?');
    params.push(req.query.deal_id);
  }
  if (req.query.status) {
    conditions.push('t.status = ?');
    params.push(req.query.status);
  }
  if (req.query.due === 'today') {
    conditions.push("date(t.due_at) = date('now')");
  }
  if (req.query.due === 'overdue') {
    conditions.push("t.due_at < datetime('now') AND (t.status IS NULL OR t.status != 'done')");
  }
  if (req.query.exclude_auto === 'true') {
    conditions.push('(t.auto_generated IS NULL OR t.auto_generated = 0)');
  }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY t.due_at ASC NULLS LAST, t.created_at ASC';

  const tasks = req.db.prepare(query).all(...params);
  res.json({ tasks });
});

router.post('/', (req, res) => {
  const { deal_id, description, due_at, due_at_natural, auto_generated, template_key, notes } = req.body;
  if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
  if (!description) return res.status(400).json({ error: 'description is required' });

  let resolvedDueAt = due_at || null;
  if (!resolvedDueAt && due_at_natural && chrono) {
    const parsed = chrono.parseDate(due_at_natural);
    if (parsed) resolvedDueAt = parsed.toISOString().replace('Z', '').split('.')[0];
  }

  const result = req.db.prepare(
    `INSERT INTO tasks (deal_id, description, due_at, auto_generated, template_key, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(deal_id, description, resolvedDueAt, auto_generated ? 1 : 0, template_key || null, notes || null);

  const task = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ task });
});

router.patch('/:id', (req, res) => {
  const task = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const updates = [];
  const values = [];

  if (req.body.description !== undefined) { updates.push('description = ?'); values.push(req.body.description); }
  if (req.body.due_at !== undefined) { updates.push('due_at = ?'); values.push(req.body.due_at); }
  if (req.body.notes !== undefined) { updates.push('notes = ?'); values.push(req.body.notes); }
  if (req.body.status !== undefined) {
    updates.push('status = ?');
    values.push(req.body.status);
    if (req.body.status === 'done') {
      updates.push("completed_at = datetime('now')");
    }
  }

  if (updates.length > 0) {
    values.push(req.params.id);
    req.db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const updated = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  res.json({ task: updated });
});

router.delete('/:id', (req, res) => {
  const task = req.db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  req.db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
