const { google } = require('googleapis');
const { getAuthedClient } = require('./gmail');

/**
 * Polls Gmail for new messages and imports ones that match CRM contacts.
 *
 * Filters:
 * - Only imports emails from senders that match a contact's email in the DB
 * - Skips emails from the user's own address (outbound tracked separately)
 * - Only looks at emails from the last 24 hours (or since last sync)
 * - Skips emails already imported (by gmail_message_id)
 * - Optional: only sync emails with a specific Gmail label
 */
async function syncInboundEmails(db) {
  const settings = db.prepare("SELECT * FROM integration_settings WHERE type = 'gmail'").get();
  if (!settings || !settings.enabled) return { synced: 0, skipped: 0 };

  const config = JSON.parse(settings.config || '{}');
  if (!config.tokens) return { synced: 0, skipped: 0 };

  const oauth2Client = getAuthedClient(config.tokens);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Get all contact emails for matching
  const contacts = db.prepare('SELECT id, email FROM contacts WHERE email IS NOT NULL AND email != ""').all();
  const contactEmailMap = {};
  contacts.forEach(c => { contactEmailMap[c.email.toLowerCase()] = c.id; });

  if (Object.keys(contactEmailMap).length === 0) return { synced: 0, skipped: 0, reason: 'No contacts with emails' };

  // Build search query — emails from the last 24 hours, in inbox
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const afterDate = oneDayAgo.toISOString().split('T')[0].replace(/-/g, '/');

  // Optional label filter from config
  const labelFilter = config.sync_label ? `label:${config.sync_label}` : 'in:inbox';
  const query = `${labelFilter} after:${afterDate} -from:${config.email}`;

  let synced = 0;
  let skipped = 0;

  try {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    });

    const messages = listRes.data.messages || [];

    for (const msg of messages) {
      // Skip if already imported
      const existing = db.prepare('SELECT id FROM email_messages WHERE gmail_message_id = ?').get(msg.id);
      if (existing) { skipped++; continue; }

      // Fetch full message
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = fullMsg.data.payload.headers;
      const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '(no subject)';
      const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

      // Extract email from "Name <email>" format
      const emailMatch = fromHeader.match(/<(.+?)>/) || [null, fromHeader.trim()];
      const senderEmail = (emailMatch[1] || '').toLowerCase().trim();

      // Only import if sender matches a CRM contact
      const contactId = contactEmailMap[senderEmail];
      if (!contactId) { skipped++; continue; }

      // Find the contact's active deal
      const deal = db.prepare(
        "SELECT * FROM deals WHERE contact_id = ? AND stage NOT IN ('closed_won', 'closed_lost') ORDER BY updated_at DESC LIMIT 1"
      ).get(contactId);

      // Extract body text
      let bodyText = '';
      if (fullMsg.data.payload.parts) {
        const textPart = fullMsg.data.payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart && textPart.body.data) {
          bodyText = Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
        }
      } else if (fullMsg.data.payload.body?.data) {
        bodyText = Buffer.from(fullMsg.data.payload.body.data, 'base64url').toString('utf-8');
      }

      // Store email
      db.prepare(
        `INSERT INTO email_messages (deal_id, contact_id, direction, gmail_message_id, gmail_thread_id, subject, body_text, from_email, to_email, sent_at)
         VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        deal?.id || null, contactId, msg.id, fullMsg.data.threadId,
        subject, bodyText, senderEmail, config.email,
        date ? new Date(date).toISOString().replace('Z', '').split('.')[0] : null
      );

      // Log activity on the deal
      if (deal) {
        db.prepare(
          "INSERT INTO activities (deal_id, contact_id, type, content, metadata) VALUES (?, ?, 'email', ?, ?)"
        ).run(deal.id, contactId, `Email received: ${subject}`, JSON.stringify({ gmail_message_id: msg.id, from: senderEmail }));
      }

      synced++;
    }
  } catch (err) {
    console.error('Gmail sync error:', err.message);
    return { synced, skipped, error: err.message };
  }

  return { synced, skipped };
}

module.exports = { syncInboundEmails };
