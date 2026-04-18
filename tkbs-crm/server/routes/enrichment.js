const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { kickoffEnrichment } = require('../services/enrichment-runner');

router.use(requireAuth);

router.post('/run', (req, res) => {
  const { client_id } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  const client = req.db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  if (client.enrichment_status === 'running') {
    return res.status(409).json({
      error: 'Enrichment already in progress for this client',
      status: 'running',
    });
  }

  // Flip to running synchronously so the response + any concurrent read sees
  // the new state. The service then handles the async spawn.
  req.db.prepare(
    "UPDATE clients SET enrichment_status = 'running', updated_at = datetime('now') WHERE id = ?"
  ).run(client_id);

  // Fire-and-forget — never await. The service captures errors into the row.
  kickoffEnrichment(req.db, client_id);

  const updated = req.db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
  res.json({ status: 'running', client: updated });
});

router.get('/:clientId', (req, res) => {
  const client = req.db.prepare(
    'SELECT id, enrichment_status, enrichment_data FROM clients WHERE id = ?'
  ).get(req.params.clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  let data = {};
  try { data = JSON.parse(client.enrichment_data || '{}'); } catch (e) {}

  res.json({ status: client.enrichment_status, enrichment_data: data });
});

module.exports = router;
