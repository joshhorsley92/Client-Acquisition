const { postNotification, buildStatusChangeNotification, buildNewEngagementNotification } = require('./slack');
const { dispatchWebhooks } = require('./webhook-dispatcher');

/**
 * Executes configured actions when an engagement enters a new status.
 * v2 ships with a single action type (activate_launch_on_dashboard); the
 * create_tasks/start_cadence/trigger_skill/record pathways from v1 are gone.
 * Slack + webhook notifications still fire on every transition.
 */
function executeStatusActions(db, engagementId, newStatus, userId) {
  const actions = db.prepare(
    'SELECT * FROM status_actions WHERE status = ? AND enabled = 1 ORDER BY sort_order ASC'
  ).all(newStatus);

  const result = { actions: [] };

  for (const action of actions) {
    const config = JSON.parse(action.config || '{}');
    if (action.action_type === 'activate_launch_on_dashboard') {
      activateLaunchOnDashboard(db, engagementId, config).catch((err) => {
        console.error(`activate_launch_on_dashboard failed for engagement ${engagementId}:`, err.message);
      });
      result.actions.push({ type: 'activate_launch_on_dashboard', started: true });
    }
  }

  // Slack notification — best-effort
  try {
    const engagement = db.prepare('SELECT * FROM engagements WHERE id = ?').get(engagementId);
    const client = engagement?.client_id
      ? db.prepare('SELECT * FROM clients WHERE id = ?').get(engagement.client_id)
      : null;
    const user = userId ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId) : null;

    if (newStatus === 'new') {
      const notif = buildNewEngagementNotification(engagement, client);
      postNotification(db, notif).catch(() => {});
    } else {
      const notif = buildStatusChangeNotification(engagement, client, newStatus, user);
      postNotification(db, notif).catch(() => {});
    }
  } catch (e) { /* best-effort */ }

  // Outbound webhooks
  try {
    const engagement = db.prepare('SELECT * FROM engagements WHERE id = ?').get(engagementId);
    const client = engagement?.client_id
      ? db.prepare('SELECT * FROM clients WHERE id = ?').get(engagement.client_id)
      : null;

    const eventName = newStatus === 'new' ? 'engagement.created'
      : newStatus === 'won' ? 'engagement.won'
      : newStatus === 'lost' ? 'engagement.lost'
      : 'engagement.status_changed';

    dispatchWebhooks(db, eventName, { engagement, client }).catch(() => {});
  } catch (e) { /* best-effort */ }

  return result;
}

/**
 * 'won' handler: push Brand Profile prerequisites + activate launch on
 * Dashboard. Resilient: never throws. Leaves launch_activated_at null on
 * failure so the engagement is flagged for manual retry.
 */
async function activateLaunchOnDashboard(db, engagementId, config) {
  const dashboardClient = require('./dashboard-client');
  if (!dashboardClient.isConfigured()) {
    console.warn(`activate_launch skipped for engagement ${engagementId}: Dashboard integration not configured`);
    return;
  }

  const engagement = db.prepare('SELECT * FROM engagements WHERE id = ?').get(engagementId);
  if (!engagement) return;
  if (engagement.launch_activated_at) return;

  if (!engagement.dashboard_user_id) {
    console.warn(
      `activate_launch skipped for engagement ${engagementId}: no dashboard_user_id. ` +
      'Push the Brand Profile from /calls/:id first.',
    );
    logActivity(db, engagement.client_id, engagementId, 'note',
      '⚠ Launch activation skipped — Brand Profile not yet pushed to Dashboard. Push from the call detail page, then re-move to Won.');
    return;
  }

  const tierMap = { launch: 'launch', boost: 'boost' };
  const configuredTier = (config && config.tier) || null;
  const resolvedTier = configuredTier || tierMap[engagement.package_type] || 'launch';

  const result = await dashboardClient.activateLaunch(engagement.dashboard_user_id, resolvedTier);
  if (!result.ok) {
    console.warn(
      `activate_launch failed for engagement ${engagementId}: ${result.error} (status ${result.status})`,
    );
    logActivity(db, engagement.client_id, engagementId, 'note',
      `⚠ Launch activation failed on Dashboard: ${result.error}. Retry later.`);
    return;
  }

  db.prepare(
    `UPDATE engagements
     SET launch_client_id = ?, launch_activated_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
  ).run(result.data.launch_client_id, engagementId);

  logActivity(db, engagement.client_id, engagementId, 'system',
    `✓ Launch program activated on Dashboard — tier: ${result.data.tier}, launch_client_id: ${result.data.launch_client_id}.`);
}

function logActivity(db, clientId, engagementId, type, content) {
  try {
    db.prepare(
      `INSERT INTO activities (client_id, engagement_id, type, content, metadata, created_at)
       VALUES (?, ?, ?, ?, '{}', datetime('now'))`,
    ).run(clientId, engagementId, type, content);
  } catch (e) {
    console.error('logActivity failed:', e.message);
  }
}

module.exports = { executeStatusActions };
