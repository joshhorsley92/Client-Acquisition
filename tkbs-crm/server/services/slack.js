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

function buildStageChangeNotification(deal, company, contact, oldStage, newStage, user) {
  const emoji = newStage === 'closed_won' ? '🎉' : newStage === 'closed_lost' ? '❌' : '📋';
  const value = deal.estimated_value ? ` — $${Number(deal.estimated_value).toLocaleString()}/mo` : '';
  return {
    text: `${emoji} *${company?.name || 'Unknown'}* moved to *${newStage.replace('_', ' ')}*${value} by ${user?.name || 'Unknown'}`,
  };
}

function buildNewLeadNotification(deal, company, contact) {
  return {
    text: `🆕 New lead: *${company?.name || 'Unknown'}*${deal.source ? ` (${deal.source}${deal.source_detail ? ` — ${deal.source_detail}` : ''})` : ''}`,
  };
}

function buildOverdueDigest(tasks) {
  if (tasks.length === 0) return null;
  const list = tasks.slice(0, 10).map(t => `• ${t.description} — ${t.company_name || 'No company'}`).join('\n');
  return {
    text: `⚠️ You have ${tasks.length} overdue task${tasks.length > 1 ? 's' : ''}:\n${list}`,
  };
}

module.exports = { getSlackClient, postNotification, buildStageChangeNotification, buildNewLeadNotification, buildOverdueDigest };
