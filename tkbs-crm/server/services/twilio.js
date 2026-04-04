function getTwilioClient(db) {
  const settings = db.prepare("SELECT * FROM integration_settings WHERE type = 'twilio'").get();
  if (!settings || !settings.enabled) return null;

  const config = JSON.parse(settings.config || '{}');
  if (!config.account_sid || !config.auth_token) return null;

  const twilio = require('twilio');
  return { client: twilio(config.account_sid, config.auth_token), from: config.phone_number };
}

async function sendSms(db, { to, body, deal_id, contact_id }) {
  const twilio = getTwilioClient(db);
  if (!twilio) throw new Error('Twilio not configured');
  const { client, from } = twilio;

  const message = await client.messages.create({ body, from, to });

  // Store SMS record
  db.prepare(
    `INSERT INTO sms_messages (deal_id, contact_id, direction, twilio_sid, from_number, to_number, body, status, sent_at)
     VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, datetime('now'))`
  ).run(deal_id || null, contact_id || null, message.sid, from, to, body, message.status);

  // Log activity
  if (deal_id) {
    db.prepare(
      "INSERT INTO activities (deal_id, contact_id, type, content, metadata) VALUES (?, ?, 'call', ?, ?)"
    ).run(deal_id, contact_id || null, `SMS sent: ${body.substring(0, 100)}`, JSON.stringify({ twilio_sid: message.sid, to }));
  }

  return message;
}

module.exports = { getTwilioClient, sendSms };
