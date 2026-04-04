const { listNewMessages } = require('./gmail');

/**
 * Syncs inbound emails from Gmail, matches to contacts, links to deals.
 * Should be called periodically (e.g., every 5 minutes).
 */
async function syncInboundEmails(db) {
  const gmail = db.prepare("SELECT * FROM integration_settings WHERE type = 'gmail'").get();
  if (!gmail || !gmail.enabled) return { synced: 0, reason: 'Gmail not connected' };

  const config = JSON.parse(gmail.config);
  if (!config.tokens) return { synced: 0, reason: 'No tokens' };

  // Get last sync time
  const lastSync = config.lastSync || null;
  let synced = 0;

  try {
    const messages = await listNewMessages(config.tokens, lastSync);

    for (const msg of messages) {
      // Skip if already stored
      const existing = db.prepare('SELECT id FROM email_messages WHERE gmail_message_id = ?').get(msg.id);
      if (existing) continue;

      // Extract email address from "Name <email>" format
      const emailMatch = msg.from.match(/<(.+?)>/) || [null, msg.from.trim()];
      const fromEmail = emailMatch[1].toLowerCase();

      // Skip outbound (from our own email)
      if (fromEmail === config.email) continue;

      // Match to contact
      const contact = db.prepare('SELECT * FROM contacts WHERE LOWER(email) = ?').get(fromEmail);
      if (!contact) continue; // Only sync emails from known contacts

      // Find active deal for this contact
      const deal = db.prepare(
        "SELECT * FROM deals WHERE contact_id = ? AND stage NOT IN ('closed_won', 'closed_lost') ORDER BY updated_at DESC LIMIT 1"
      ).get(contact.id);

      if (!deal) continue; // Only link to active deals

      // Store email
      db.prepare(
        `INSERT INTO email_messages (deal_id, contact_id, direction, gmail_message_id, gmail_thread_id, subject, body_text, from_email, to_email, sent_at)
         VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?)`
      ).run(deal.id, contact.id, msg.id, msg.threadId, msg.subject, msg.bodyText, fromEmail, msg.to, msg.date);

      // Log activity
      db.prepare(
        `INSERT INTO activities (deal_id, contact_id, type, content, metadata)
         VALUES (?, ?, 'email', ?, ?)`
      ).run(deal.id, contact.id, `Inbound email: ${msg.subject}`, JSON.stringify({ gmail_message_id: msg.id, from: fromEmail }));

      synced++;
    }

    // Update last sync time
    config.lastSync = new Date().toISOString();
    db.prepare("UPDATE integration_settings SET config = ?, updated_at = datetime('now') WHERE type = 'gmail'").run(JSON.stringify(config));

    return { synced };
  } catch (err) {
    console.error('Email sync error:', err);
    return { synced: 0, error: err.message };
  }
}

module.exports = { syncInboundEmails };
