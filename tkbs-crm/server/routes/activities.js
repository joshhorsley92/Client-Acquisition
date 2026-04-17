const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  const { deal_id } = req.query;
  let query = 'SELECT a.*, c.name AS company_name FROM activities a LEFT JOIN deals d ON a.deal_id = d.id LEFT JOIN companies c ON d.company_id = c.id';
  const conditions = [];
  const params = [];

  if (deal_id) {
    conditions.push('a.deal_id = ?');
    params.push(deal_id);
  }
  if (req.query.exclude_auto === 'true') {
    conditions.push("a.type IN ('note', 'call', 'email', 'meeting', 'stage_change')");
  }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY a.created_at DESC';

  const limit = req.query.limit ? Math.min(200, parseInt(req.query.limit)) : null;
  if (limit) query += ` LIMIT ${limit}`;

  const activities = req.db.prepare(query).all(...params);
  res.json({ activities });
});

router.post('/', (req, res) => {
  const { deal_id, contact_id, type, content, metadata } = req.body;
  if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
  if (!type) return res.status(400).json({ error: 'type is required' });

  const deal = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(deal_id);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  const result = req.db.prepare(
    `INSERT INTO activities (deal_id, contact_id, type, content, metadata, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    deal_id,
    contact_id || deal.contact_id || null,
    type,
    content || null,
    JSON.stringify(metadata || {}),
    req.user.id
  );

  const activity = req.db.prepare('SELECT * FROM activities WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ activity });
});

module.exports = router;
