const router = require('express').Router();

// Slack slash commands don't use session auth — they use signing secret verification
// For now, use a simple token check from the integration config

router.post('/commands', (req, res) => {
  const { command, text, token } = req.body;

  // Verify this is from Slack (basic check — production should use signing secret)
  const settings = req.db.prepare("SELECT * FROM integration_settings WHERE type = 'slack'").get();
  if (!settings || !settings.enabled) {
    return res.json({ text: 'TKBS CRM Slack integration is not configured.' });
  }

  switch (command) {
    case '/tkbs-deal':
      return handleDealLookup(req.db, text, res);
    case '/tkbs-tasks':
      return handleTasksList(req.db, res);
    case '/tkbs-pipeline':
      return handlePipelineSummary(req.db, res);
    default:
      return res.json({ text: `Unknown command: ${command}` });
  }
});

function handleDealLookup(db, searchText, res) {
  if (!searchText) return res.json({ text: 'Usage: /tkbs-deal [company name]' });

  const deal = db.prepare(
    `SELECT d.*, c.name as company_name, ct.name as contact_name
     FROM deals d
     LEFT JOIN companies c ON d.company_id = c.id
     LEFT JOIN contacts ct ON d.contact_id = ct.id
     WHERE c.name LIKE ? AND d.stage NOT IN ('closed_won', 'closed_lost')
     ORDER BY d.updated_at DESC LIMIT 1`
  ).get(`%${searchText}%`);

  if (!deal) return res.json({ text: `No active deal found for "${searchText}"` });

  const tasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE deal_id = ? AND status = 'pending'").get(deal.id);
  const lastActivity = db.prepare('SELECT * FROM activities WHERE deal_id = ? ORDER BY created_at DESC LIMIT 1').get(deal.id);

  const value = deal.estimated_value ? `$${Number(deal.estimated_value).toLocaleString()}/mo` : 'No value set';
  const text = [
    `*${deal.company_name}* — ${deal.contact_name || 'No contact'}`,
    `📋 Stage: ${deal.stage.replace('_', ' ')} | 💰 Value: ${value}`,
    `📌 ${tasks.count} pending task${tasks.count !== 1 ? 's' : ''}`,
    lastActivity ? `🕐 Last activity: ${lastActivity.content} (${lastActivity.created_at})` : '🕐 No activity logged',
  ].join('\n');

  res.json({ text });
}

function handleTasksList(db, res) {
  const overdue = db.prepare(
    `SELECT t.*, c.name as company_name FROM tasks t
     LEFT JOIN deals d ON t.deal_id = d.id
     LEFT JOIN companies c ON d.company_id = c.id
     WHERE t.status = 'pending' AND t.due_at < datetime('now')
     ORDER BY t.due_at ASC LIMIT 10`
  ).all();

  const today = db.prepare(
    `SELECT t.*, c.name as company_name FROM tasks t
     LEFT JOIN deals d ON t.deal_id = d.id
     LEFT JOIN companies c ON d.company_id = c.id
     WHERE t.status = 'pending' AND t.due_at >= date('now') AND t.due_at < date('now', '+1 day')
     ORDER BY t.due_at ASC LIMIT 10`
  ).all();

  const lines = [];
  if (overdue.length > 0) {
    lines.push(`*⚠️ Overdue (${overdue.length}):*`);
    overdue.forEach(t => lines.push(`• ${t.description} — ${t.company_name || 'No company'}`));
  }
  if (today.length > 0) {
    lines.push(`*📅 Today (${today.length}):*`);
    today.forEach(t => lines.push(`• ${t.description} — ${t.company_name || 'No company'}`));
  }
  if (lines.length === 0) lines.push('✅ No overdue or today tasks. You\'re all caught up!');

  res.json({ text: lines.join('\n') });
}

function handlePipelineSummary(db, res) {
  const stages = db.prepare(
    `SELECT d.stage, COUNT(*) as count, COALESCE(SUM(d.estimated_value), 0) as value
     FROM deals d WHERE d.stage NOT IN ('closed_won', 'closed_lost')
     GROUP BY d.stage ORDER BY count DESC`
  ).all();

  const total = stages.reduce((sum, s) => sum + s.count, 0);
  const totalValue = stages.reduce((sum, s) => sum + s.value, 0);

  const lines = [`*Pipeline Summary* — ${total} active deal${total !== 1 ? 's' : ''} | $${Number(totalValue).toLocaleString()}/mo`];
  stages.forEach(s => {
    lines.push(`• ${s.stage.replace('_', ' ')}: ${s.count} deal${s.count !== 1 ? 's' : ''} ($${Number(s.value).toLocaleString()}/mo)`);
  });

  if (stages.length === 0) lines.push('No active deals in pipeline.');

  res.json({ text: lines.join('\n') });
}

module.exports = router;
