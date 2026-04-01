const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  let query = 'SELECT * FROM contacts';
  const params = [];

  if (req.query.company_id) {
    query += ' WHERE company_id = ?';
    params.push(req.query.company_id);
  }

  query += ' ORDER BY created_at DESC';
  const contacts = req.db.prepare(query).all(...params);
  res.json({ contacts });
});

router.get('/:id', (req, res) => {
  const contact = req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  res.json({ contact });
});

router.post('/', (req, res) => {
  const { name, email, phone, role, preferred_contact, notes, company_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const result = req.db.prepare(
    `INSERT INTO contacts (name, email, phone, role, preferred_contact, notes, company_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(name, email || null, phone || null, role || null, preferred_contact || null, notes || null, company_id || null);

  const contact = req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ contact });
});

router.patch('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  const fields = ['name', 'email', 'phone', 'role', 'preferred_contact', 'notes', 'company_id'];
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
    req.db.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const contact = req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  res.json({ contact });
});

router.delete('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  req.db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
