const { postNotification, buildStatusChangeNotification, buildNewEngagementNotification } = require('./slack');
const { dispatchWebhooks } = require('./webhook-dispatcher');

/**
 * Runs notification side effects when an engagement enters a new status.
 *
 * The CRM is decoupled from the Dashboard, so no external activation calls
 * happen here anymore — only Slack notifications and outbound webhook
 * dispatch (both are internal / user-configured).
 */
function executeStatusActions(db, engagementId, newStatus, userId) {
  const result = { actions: [] };

  const engagement = db.prepare('SELECT * FROM engagements WHERE id = ?').get(engagementId);
  const client = engagement?.client_id
    ? db.prepare('SELECT * FROM clients WHERE id = ?').get(engagement.client_id)
    : null;
  const user = userId ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId) : null;

  // Slack — best-effort; never blocks the status transition.
  try {
    const notif = newStatus === 'new'
      ? buildNewEngagementNotification(engagement, client)
      : buildStatusChangeNotification(engagement, client, newStatus, user);
    postNotification(db, notif).catch(() => {});
    result.actions.push({ type: 'slack_notification' });
  } catch (e) { /* best-effort */ }

  // Outbound webhooks — same best-effort guarantee.
  try {
    const eventName = newStatus === 'new' ? 'engagement.created'
      : newStatus === 'won' ? 'engagement.won'
      : newStatus === 'lost' ? 'engagement.lost'
      : 'engagement.status_changed';
    dispatchWebhooks(db, eventName, { engagement, client }).catch(() => {});
    result.actions.push({ type: 'webhook_dispatch', event: eventName });
  } catch (e) { /* best-effort */ }

  return result;
}

module.exports = { executeStatusActions };
