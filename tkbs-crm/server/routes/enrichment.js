const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Phase 1 stub. Phase 2 will wire this to the Python pipeline at
// enrichment/pipeline.py (email_finder, Etsy/Kickstarter/county scrapers) and
// fan the result back into the client row.
//
// Contract kept stable so the UI can be built against it now:
//   POST /api/enrichment/run       { client_id }      → { status, client }
//   GET  /api/enrichment/:clientId                    → { status, enrichment_data }

router.post('/run', (req, res) => {
  const { client_id } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  const client = req.db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  req.db.prepare(
    "UPDATE clients SET enrichment_status = 'none', updated_at = datetime('now') WHERE id = ?"
  ).run(client_id);

  res.json({
    status: 'pending',
    message: 'Enrichment pipeline not yet wired (Phase 2). Client unchanged.',
    client,
  });
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
