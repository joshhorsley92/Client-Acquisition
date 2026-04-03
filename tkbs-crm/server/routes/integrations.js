const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getAuthUrl, getTokensFromCode, getUserEmail } = require('../services/gmail');

// Google OAuth - initiate (must be before router.use(requireAuth))
router.get('/google/auth', requireAuth, requireAdmin, (req, res) => {
  try {
    const url = getAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI environment variables.' });
  }
});

// Google OAuth - callback (no requireAuth — redirect from Google)
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing authorization code');

  try {
    const tokens = await getTokensFromCode(code);
    const email = await getUserEmail(tokens);

    // Store tokens for gmail
    req.db.prepare(
      "UPDATE integration_settings SET config = ?, enabled = 1, updated_at = datetime('now') WHERE type = 'gmail'"
    ).run(JSON.stringify({ tokens, email }));

    // Also enable google_calendar (shares same OAuth)
    req.db.prepare(
      "UPDATE integration_settings SET config = ?, enabled = 1, updated_at = datetime('now') WHERE type = 'google_calendar'"
    ).run(JSON.stringify({ tokens, email }));

    // Redirect back to settings page
    res.redirect('/settings?connected=google');
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect('/settings?error=google_auth_failed');
  }
});

// Google OAuth - disconnect
router.post('/google/disconnect', requireAuth, requireAdmin, (req, res) => {
  req.db.prepare(
    "UPDATE integration_settings SET config = '{}', enabled = 0, updated_at = datetime('now') WHERE type = 'gmail'"
  ).run();
  req.db.prepare(
    "UPDATE integration_settings SET config = '{}', enabled = 0, updated_at = datetime('now') WHERE type = 'google_calendar'"
  ).run();
  res.json({ ok: true });
});

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
