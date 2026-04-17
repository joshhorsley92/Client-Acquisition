const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  let query = 'SELECT ct.*, c.name as company_name FROM contacts ct LEFT JOIN companies c ON ct.company_id = c.id';
  const params = [];
  const conditions = [];

  if (req.query.company_id) {
    conditions.push('ct.company_id = ?');
    params.push(req.query.company_id);
  }

  if (req.query.q) {
    const term = `%${req.query.q}%`;
    conditions.push('(ct.name LIKE ? OR ct.email LIKE ? OR ct.phone LIKE ? OR c.name LIKE ?)');
    params.push(term, term, term, term);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  const sort = req.query.sort || 'company';
  if (sort === 'name') {
    query += ' ORDER BY ct.name ASC';
  } else if (sort === 'recent') {
    query += ' ORDER BY ct.created_at DESC';
  } else {
    query += ' ORDER BY c.name ASC NULLS LAST, ct.name ASC';
  }

  const contacts = req.db.prepare(query).all(...params);
  res.json({ contacts });
});

router.get('/:id', (req, res) => {
  const contact = req.db.prepare(
    'SELECT contacts.*, companies.name as company_name FROM contacts LEFT JOIN companies ON contacts.company_id = companies.id WHERE contacts.id = ?'
  ).get(req.params.id);
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
