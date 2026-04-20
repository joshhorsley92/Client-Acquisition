const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { scoreClient } = require('../services/fit-score');
const { kickoffEnrichment } = require('../services/enrichment-runner');

router.use(requireAuth);

const SORT_COLUMNS = {
  created_at: 'c.created_at',
  name: 'c.name',
  lifetime_revenue: 'lifetime_revenue',
  last_activity_at: 'last_activity_at',
  fit_score: 'c.fit_score',
};

// GET /api/clients — list with engagement rollups
router.get('/', (req, res) => {
  let query = `
    SELECT
      c.*,
      (SELECT COUNT(*) FROM engagements WHERE client_id = c.id) AS total_engagements,
      (SELECT COUNT(*) FROM engagements WHERE client_id = c.id AND status IN ('new','working')) AS open_engagements,
      (SELECT COUNT(*) FROM engagements WHERE client_id = c.id AND status = 'won') AS won_engagements,
      (SELECT COALESCE(SUM(COALESCE(closed_value, estimated_value)), 0)
         FROM engagements WHERE client_id = c.id AND status = 'won') AS lifetime_revenue,
      (SELECT MAX(created_at) FROM activities WHERE client_id = c.id) AS last_activity_at
    FROM clients c
  `;
  const conditions = [];
  const params = [];

  if (req.query.owner_id) {
    conditions.push('c.owner_id = ?');
    params.push(req.query.owner_id);
  }
  if (req.query.industry) {
    conditions.push('c.industry = ?');
    params.push(req.query.industry);
  }
  if (req.query.status) {
    conditions.push('c.id IN (SELECT client_id FROM engagements WHERE status = ?)');
    params.push(req.query.status);
  }
  if (req.query.search) {
    conditions.push('(c.name LIKE ? OR c.email LIKE ? OR c.primary_contact_name LIKE ? OR c.website LIKE ?)');
    const s = `%${req.query.search}%`;
    params.push(s, s, s, s);
  }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');

  const sortCol = SORT_COLUMNS[req.query.sort_by] || 'c.created_at';
  const sortDir = req.query.sort_dir === 'asc' ? 'ASC' : 'DESC';
  query += ` ORDER BY ${sortCol} ${sortDir}`;

  const clients = req.db.prepare(query).all(...params);
  res.json({ clients });
});

// GET /api/clients/:id — detail with engagements
router.get('/:id', (req, res) => {
  const client = req.db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const engagements = req.db.prepare(
    'SELECT * FROM engagements WHERE client_id = ? ORDER BY opened_at DESC'
  ).all(client.id);

  // Lazy fit-score compute (once, then cached on the row).
  if (client.fit_score == null) {
    try {
      const result = scoreClient(req.db, client.id);
      client.fit_score = result.score;
      client.fit_score_breakdown = JSON.stringify({ breakdown: result.breakdown, flags: result.flags });
      try { req.audit('fit_score_computed', 'client', client.id, { score: result.score }); } catch (e) {}
    } catch (e) { /* non-fatal */ }
  }

  res.json({ client, engagements });
});

// POST /api/clients
router.post('/', (req, res) => {
  const {
    name, website, industry, location, type,
    primary_contact_name, email, phone, role, preferred_contact,
    employee_count, revenue_estimate, notes,
    additional_contacts, social_links,
  } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  const result = req.db.prepare(
    `INSERT INTO clients (
       name, website, industry, location, type,
       primary_contact_name, email, phone, role, preferred_contact,
       employee_count, revenue_estimate, notes,
       additional_contacts, social_links, owner_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name,
    website || null, industry || null, location || null, type || null,
    primary_contact_name || null, email || null, phone || null, role || null, preferred_contact || null,
    employee_count || null, revenue_estimate || null, notes || null,
    JSON.stringify(additional_contacts || []),
    JSON.stringify(social_links || {}),
    req.user.id,
  );

  const client = req.db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);

  // Fit score — best effort, never blocks creation.
  try {
    const fit = scoreClient(req.db, client.id);
    client.fit_score = fit.score;
    client.fit_score_breakdown = JSON.stringify({ breakdown: fit.breakdown, flags: fit.flags });
    try { req.audit('fit_score_computed', 'client', client.id, { score: fit.score }); } catch (e) {}
  } catch (e) { /* non-fatal */ }

  // Auto-kick enrichment if we have a website to scrape. Fire-and-forget —
  // the runner captures errors into the client row. Skipped in tests via
  // DISABLE_AUTO_ENRICHMENT=1 so the suite doesn't spawn Python.
  if (client.website && process.env.DISABLE_AUTO_ENRICHMENT !== '1') {
    try {
      req.db.prepare(
        "UPDATE clients SET enrichment_status = 'running', updated_at = datetime('now') WHERE id = ?"
      ).run(client.id);
      client.enrichment_status = 'running';
      kickoffEnrichment(req.db, client.id);
    } catch (e) { /* non-fatal */ }
  }

  res.status(201).json({ client });
});

// PATCH /api/clients/:id
router.patch('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });

  const textFields = [
    'name', 'website', 'industry', 'location', 'type',
    'employee_count', 'revenue_estimate',
    'primary_contact_name', 'email', 'phone', 'role', 'preferred_contact',
    'notes', 'owner_id', 'enrichment_status',
  ];
  const jsonFields = ['additional_contacts', 'social_links', 'enrichment_data', 'brand_profile', 'brand_profile_sources'];

  const updates = [];
  const values = [];

  for (const field of textFields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }
  for (const field of jsonFields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(typeof req.body[field] === 'string' ? req.body[field] : JSON.stringify(req.body[field]));
    }
  }

  if (updates.length === 0) {
    return res.json({ client: existing });
  }

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);
  req.db.prepare(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const client = req.db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  res.json({ client });
});

// DELETE /api/clients/:id — cascades to engagements and activities
router.delete('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  req.db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/clients/:id/activities
router.get('/:id/activities', (req, res) => {
  const activities = req.db.prepare(
    'SELECT * FROM activities WHERE client_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json({ activities });
});

// POST /api/clients/:id/fit-score/recompute
router.post('/:id/fit-score/recompute', (req, res) => {
  const existing = req.db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });

  try {
    const result = scoreClient(req.db, existing.id);
    try { req.audit('fit_score_computed', 'client', existing.id, { score: result.score }); } catch (e) {}
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Fit score computation failed' });
  }
});

module.exports = router;
