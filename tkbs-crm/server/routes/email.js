const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { sendEmail } = require('../services/gmail');
const { syncInboundEmails } = require('../services/email-sync');
const crypto = require('crypto');

// Rewrite links in HTML body to route through click tracking
function rewriteLinks(html, trackingId, baseUrl) {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    const trackUrl = `${baseUrl}/api/email/click/${trackingId}?url=${encodeURIComponent(url)}`;
    return `href="${trackUrl}"`;
  });
}

// Click tracking redirect (no auth — needs to be publicly accessible)
router.get('/click/:trackingId', (req, res) => {
  const { trackingId } = req.params;
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  req.db.prepare(
    "UPDATE email_messages SET clicked_at = datetime('now') WHERE tracking_pixel_id = ? AND clicked_at IS NULL"
  ).run(trackingId);

  // Log activity on click
  const email = req.db.prepare('SELECT * FROM email_messages WHERE tracking_pixel_id = ?').get(trackingId);
  if (email && email.deal_id) {
    req.db.prepare(
      "INSERT INTO activities (deal_id, contact_id, type, content, metadata) VALUES (?, ?, 'system', ?, ?)"
    ).run(email.deal_id, email.contact_id, 'Link clicked in email', JSON.stringify({ url, email_id: email.id }));
  }

  res.redirect(url);
});

// Tracking pixel endpoint (no auth — needs to be publicly accessible)
router.get('/track/:pixelId', (req, res) => {
  const { pixelId } = req.params;

  // Update opened_at
  req.db.prepare(
    "UPDATE email_messages SET opened_at = datetime('now') WHERE tracking_pixel_id = ? AND opened_at IS NULL"
  ).run(pixelId);

  // Return 1x1 transparent GIF
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.set({ 'Content-Type': 'image/gif', 'Content-Length': pixel.length, 'Cache-Control': 'no-cache, no-store' });
  res.send(pixel);
});

router.use(requireAuth);

// Send email from a deal
router.post('/send', async (req, res) => {
  const { deal_id, to, subject, body } = req.body;
  if (!deal_id || !to || !subject || !body) {
    return res.status(400).json({ error: 'deal_id, to, subject, and body are required' });
  }

  // Get Gmail config
  const gmail = req.db.prepare("SELECT * FROM integration_settings WHERE type = 'gmail'").get();
  if (!gmail || !gmail.enabled) {
    return res.status(503).json({ error: 'Gmail is not connected. Go to Settings → Integrations to connect.' });
  }

  const config = JSON.parse(gmail.config);
  if (!config.tokens) {
    return res.status(503).json({ error: 'Gmail tokens not found. Reconnect in Settings.' });
  }

  // Generate tracking pixel ID
  const trackingPixelId = crypto.randomUUID();
  const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3001';
  const trackingPixel = `<img src="${baseUrl}/api/email/track/${trackingPixelId}" width="1" height="1" style="display:none" />`;

  // Rewrite links for click tracking, then append tracking pixel
  const bodyWithLinks = rewriteLinks(body, trackingPixelId, baseUrl);
  const bodyWithTracking = bodyWithLinks + trackingPixel;

  try {
    const result = await sendEmail(config.tokens, {
      to,
      subject,
      body: bodyWithTracking,
      from: config.email,
    });

    // Get deal's contact
    const deal = req.db.prepare('SELECT * FROM deals WHERE id = ?').get(deal_id);

    // Store email message
    req.db.prepare(
      `INSERT INTO email_messages (deal_id, contact_id, direction, gmail_message_id, gmail_thread_id, subject, body_text, body_html, from_email, to_email, sent_at, tracking_pixel_id)
       VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
    ).run(deal_id, deal?.contact_id || null, result.id, result.threadId, subject, body, bodyWithTracking, config.email, to, trackingPixelId);

    // Log activity
    req.db.prepare(
      `INSERT INTO activities (deal_id, contact_id, type, content, metadata, created_by)
       VALUES (?, ?, 'email', ?, ?, ?)`
    ).run(deal_id, deal?.contact_id || null, `Email sent: ${subject}`, JSON.stringify({ gmail_message_id: result.id, to }), req.user.id);

    res.json({ ok: true, message_id: result.id, thread_id: result.threadId });
  } catch (err) {
    console.error('Gmail send error:', err);
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});

// Manual sync trigger
router.post('/sync', async (req, res) => {
  const result = await syncInboundEmails(req.db);
  res.json(result);
});

// Get email thread for a deal
router.get('/thread/:deal_id', (req, res) => {
  const emails = req.db.prepare(
    'SELECT * FROM email_messages WHERE deal_id = ? ORDER BY created_at ASC'
  ).all(req.params.deal_id);
  res.json({ emails });
});

module.exports = router;
