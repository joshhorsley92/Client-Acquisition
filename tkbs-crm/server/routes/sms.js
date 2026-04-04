const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { sendSms } = require('../services/twilio');

// Twilio inbound webhook (no auth — Twilio sends directly)
router.post('/inbound', (req, res) => {
  const { From, To, Body, MessageSid } = req.body;

  // Try to match sender to a contact
  const contact = req.db.prepare('SELECT * FROM contacts WHERE phone = ?').get(From);
  let dealId = null;
  if (contact) {
    const deal = req.db.prepare(
      "SELECT * FROM deals WHERE contact_id = ? AND stage NOT IN ('closed_won', 'closed_lost') ORDER BY updated_at DESC LIMIT 1"
    ).get(contact.id);
    dealId = deal?.id;
  }

  // Store inbound SMS
  req.db.prepare(
    `INSERT INTO sms_messages (deal_id, contact_id, direction, twilio_sid, from_number, to_number, body, status, sent_at)
     VALUES (?, ?, 'inbound', ?, ?, ?, ?, 'received', datetime('now'))`
  ).run(dealId, contact?.id || null, MessageSid, From, To, Body);

  // Log activity
  if (dealId) {
    req.db.prepare(
      "INSERT INTO activities (deal_id, contact_id, type, content, metadata) VALUES (?, ?, 'call', ?, ?)"
    ).run(dealId, contact?.id || null, `SMS received: ${Body.substring(0, 100)}`, JSON.stringify({ twilio_sid: MessageSid, from: From }));
  }

  // Respond with TwiML (empty response = don't auto-reply)
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

router.use(requireAuth);

// Send SMS
router.post('/send', async (req, res) => {
  const { deal_id, contact_id, to, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'to and body are required' });

  try {
    const message = await sendSms(req.db, { to, body, deal_id, contact_id });
    res.json({ ok: true, sid: message.sid, status: message.status });
  } catch (err) {
    console.error('SMS send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get SMS history for a deal
router.get('/history/:deal_id', (req, res) => {
  const messages = req.db.prepare(
    'SELECT * FROM sms_messages WHERE deal_id = ? ORDER BY created_at DESC'
  ).all(req.params.deal_id);
  res.json({ messages });
});

module.exports = router;
