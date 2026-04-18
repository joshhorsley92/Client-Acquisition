const { WebClient } = require('@slack/web-api');

function getSlackClient(db) {
  const settings = db.prepare("SELECT * FROM integration_settings WHERE type = 'slack'").get();
  if (!settings || !settings.enabled) return null;

  const config = JSON.parse(settings.config || '{}');
  if (!config.bot_token) return null;

  return new WebClient(config.bot_token);
}

async function postNotification(db, { text, blocks, channel }) {
  const client = getSlackClient(db);
  if (!client) return null;

  const settings = db.prepare("SELECT * FROM integration_settings WHERE type = 'slack'").get();
  const config = JSON.parse(settings.config || '{}');
  const targetChannel = channel || config.default_channel || '#sales';

  try {
    const result = await client.chat.postMessage({
      channel: targetChannel,
      text,
      blocks,
    });
    return result;
  } catch (err) {
    console.error('Slack notification failed:', err.message);
    return null;
  }
}

function buildStatusChangeNotification(engagement, client, newStatus, user) {
  const emoji = newStatus === 'won' ? '🎉' : newStatus === 'lost' ? '❌' : '📋';
  const value = engagement.estimated_value
    ? ` — $${Number(engagement.estimated_value).toLocaleString()}`
    : '';
  return {
    text: `${emoji} *${client?.name || 'Unknown'}* moved to *${newStatus}*${value} by ${user?.name || 'Unknown'}`,
  };
}

function buildNewEngagementNotification(engagement, client) {
  const source = engagement.source
    ? ` (${engagement.source}${engagement.source_detail ? ` — ${engagement.source_detail}` : ''})`
    : '';
  return {
    text: `🆕 New engagement: *${client?.name || 'Unknown'}*${source}`,
  };
}

module.exports = {
  getSlackClient,
  postNotification,
  buildStatusChangeNotification,
  buildNewEngagementNotification,
};
