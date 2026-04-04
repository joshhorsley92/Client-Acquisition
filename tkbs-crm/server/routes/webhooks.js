const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendWebhook } = require('../services/webhook-dispatcher');

router.use(requireAuth);

// List webhooks
router.get('/', (req, res) => {
  const webhooks = req.db.prepare('SELECT * FROM outbound_webhooks ORDER BY created_at DESC').all();
  res.json({ webhooks });
});

// Create webhook
router.post('/', requireAdmin, (req, res) => {
  const { name, url, events, headers } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url are required' });

  const result = req.db.prepare(
    'INSERT INTO outbound_webhooks (name, url, events, headers) VALUES (?, ?, ?, ?)'
  ).run(name, url, JSON.stringify(events || []), JSON.stringify(headers || {}));

  const webhook = req.db.prepare('SELECT * FROM outbound_webhooks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ webhook });
});

// Update webhook
router.patch('/:id', requireAdmin, (req, res) => {
  const existing = req.db.prepare('SELECT * FROM outbound_webhooks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Webhook not found' });

  const updates = [];
  const values = [];

  if (req.body.name !== undefined) { updates.push('name = ?'); values.push(req.body.name); }
  if (req.body.url !== undefined) { updates.push('url = ?'); values.push(req.body.url); }
  if (req.body.events !== undefined) { updates.push('events = ?'); values.push(JSON.stringify(req.body.events)); }
  if (req.body.headers !== undefined) { updates.push('headers = ?'); values.push(JSON.stringify(req.body.headers)); }
  if (req.body.enabled !== undefined) { updates.push('enabled = ?'); values.push(req.body.enabled ? 1 : 0); }

  if (updates.length > 0) {
    values.push(req.params.id);
    req.db.prepare(`UPDATE outbound_webhooks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const webhook = req.db.prepare('SELECT * FROM outbound_webhooks WHERE id = ?').get(req.params.id);
  res.json({ webhook });
});

// Delete webhook
router.delete('/:id', requireAdmin, (req, res) => {
  req.db.prepare('DELETE FROM outbound_webhooks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Test webhook — sends a test event directly to this webhook
router.post('/:id/test', requireAdmin, async (req, res) => {
  const webhook = req.db.prepare('SELECT * FROM outbound_webhooks WHERE id = ?').get(req.params.id);
  if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

  const payload = JSON.stringify({
    event: 'test',
    timestamp: new Date().toISOString(),
    data: { message: 'Test webhook from TKBS CRM' },
  });
  const headers = JSON.parse(webhook.headers || '{}');

  try {
    const result = await sendWebhook(webhook.url, payload, headers);
    res.json({ ok: true, status: result.status, message: 'Test event sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
