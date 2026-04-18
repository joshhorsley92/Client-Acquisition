const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  let query = `
    SELECT a.*, c.name AS client_name
    FROM activities a
    JOIN clients c ON a.client_id = c.id
  `;
  const conditions = [];
  const params = [];

  if (req.query.client_id) {
    conditions.push('a.client_id = ?');
    params.push(req.query.client_id);
  }
  if (req.query.engagement_id) {
    conditions.push('a.engagement_id = ?');
    params.push(req.query.engagement_id);
  }
  if (req.query.exclude_auto === 'true') {
    conditions.push("a.type IN ('note', 'call', 'email', 'meeting', 'status_change')");
  }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY a.created_at DESC';

  const limit = req.query.limit ? Math.min(200, parseInt(req.query.limit, 10)) : null;
  if (limit) query += ` LIMIT ${limit}`;

  const activities = req.db.prepare(query).all(...params);
  res.json({ activities });
});

router.post('/', (req, res) => {
  const { client_id, engagement_id, type, content, metadata } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });
  if (!type) return res.status(400).json({ error: 'type is required' });

  const client = req.db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  if (engagement_id) {
    const engagement = req.db.prepare(
      'SELECT id FROM engagements WHERE id = ? AND client_id = ?'
    ).get(engagement_id, client_id);
    if (!engagement) {
      return res.status(400).json({ error: 'engagement_id does not belong to the given client' });
    }
  }

  const result = req.db.prepare(
    `INSERT INTO activities (client_id, engagement_id, type, content, metadata, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    client_id,
    engagement_id || null,
    type,
    content || null,
    JSON.stringify(metadata || {}),
    req.user.id,
  );

  const activity = req.db.prepare('SELECT * FROM activities WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ activity });
});

module.exports = router;
