const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  let query = 'SELECT * FROM script_templates';
  const params = [];

  if (req.query.stage) {
    query += ' WHERE stage = ?';
    params.push(req.query.stage);
  }

  query += ' ORDER BY sort_order ASC, created_at ASC';
  const scripts = req.db.prepare(query).all(...params);
  res.json({ scripts });
});

router.get('/:id', (req, res) => {
  const script = req.db.prepare('SELECT * FROM script_templates WHERE id = ?').get(req.params.id);
  if (!script) return res.status(404).json({ error: 'Script not found' });
  res.json({ script });
});

router.post('/', (req, res) => {
  const { stage, name, type, format, content, sort_order } = req.body;
  if (!stage || !name || !type || !content) {
    return res.status(400).json({ error: 'stage, name, type, and content are required' });
  }

  const result = req.db.prepare(
    `INSERT INTO script_templates (stage, name, type, format, content, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(stage, name, type, format || 'markdown', content, sort_order || 0);

  const script = req.db.prepare('SELECT * FROM script_templates WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ script });
});

router.patch('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM script_templates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Script not found' });

  const fields = ['stage', 'name', 'type', 'format', 'content', 'sort_order'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    req.db.prepare(`UPDATE script_templates SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const script = req.db.prepare('SELECT * FROM script_templates WHERE id = ?').get(req.params.id);
  res.json({ script });
});

router.delete('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM script_templates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Script not found' });
  req.db.prepare('DELETE FROM script_templates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
