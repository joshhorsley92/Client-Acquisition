const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth);

// List all integrations
router.get('/', (req, res) => {
  const integrations = req.db.prepare('SELECT * FROM integration_settings ORDER BY type').all();
  res.json({ integrations });
});

// Get single integration
router.get('/:type', (req, res) => {
  const integration = req.db.prepare('SELECT * FROM integration_settings WHERE type = ?').get(req.params.type);
  if (!integration) return res.status(404).json({ error: 'Integration not found' });
  res.json({ integration });
});

// Update integration config
router.patch('/:type', requireAdmin, (req, res) => {
  const existing = req.db.prepare('SELECT * FROM integration_settings WHERE type = ?').get(req.params.type);
  if (!existing) return res.status(404).json({ error: 'Integration not found' });

  const updates = [];
  const values = [];

  if (req.body.config !== undefined) {
    updates.push('config = ?');
    values.push(JSON.stringify(req.body.config));
  }
  if (req.body.enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(req.body.enabled ? 1 : 0);
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(req.params.type);
    req.db.prepare(`UPDATE integration_settings SET ${updates.join(', ')} WHERE type = ?`).run(...values);
  }

  const integration = req.db.prepare('SELECT * FROM integration_settings WHERE type = ?').get(req.params.type);
  res.json({ integration });
});

module.exports = router;
