const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  const companies = req.db.prepare('SELECT * FROM companies ORDER BY created_at DESC').all();
  res.json({ companies });
});

router.get('/:id', (req, res) => {
  const company = req.db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  res.json({ company });
});

router.post('/', (req, res) => {
  const { name, location, industry, type, website, social_links, employee_count, revenue_estimate, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const result = req.db.prepare(
    `INSERT INTO companies (name, location, industry, type, website, social_links, employee_count, revenue_estimate, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(name, location || null, industry || null, type || null, website || null,
    JSON.stringify(social_links || {}), employee_count || null, revenue_estimate || null, notes || null);

  const company = req.db.prepare('SELECT * FROM companies WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ company });
});

router.patch('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Company not found' });

  const fields = ['name', 'location', 'industry', 'type', 'website', 'employee_count', 'revenue_estimate', 'notes'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (req.body.social_links !== undefined) {
    updates.push('social_links = ?');
    values.push(JSON.stringify(req.body.social_links));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    req.db.prepare(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const company = req.db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  res.json({ company });
});

router.delete('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Company not found' });

  req.db.prepare('DELETE FROM companies WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
