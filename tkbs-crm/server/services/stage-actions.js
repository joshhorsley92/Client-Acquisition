const { postNotification, buildStageChangeNotification, buildNewLeadNotification } = require('./slack');
const { dispatchWebhooks } = require('./webhook-dispatcher');

/**
 * Executes configured actions when a deal enters a new stage.
 * Returns a summary of what was done.
 */
function executeStageActions(db, dealId, newStage, userId) {
  const actions = db.prepare(
    'SELECT * FROM stage_actions WHERE stage = ? AND enabled = 1 ORDER BY sort_order ASC'
  ).all(newStage);

  const result = { actions: [], tasksCreated: 0, skillsTriggered: [] };

  for (const action of actions) {
    const config = JSON.parse(action.config || '{}');

    switch (action.action_type) {
      case 'create_tasks':
        result.tasksCreated += createTasks(db, dealId, config);
        result.actions.push({ type: 'create_tasks', count: config.tasks?.length || 0 });
        break;

      case 'start_cadence':
        result.tasksCreated += startCadence(db, dealId, config);
        result.actions.push({ type: 'start_cadence', reminders: config.reminders?.length || 0 });
        break;

      case 'trigger_skill': {
        const { isCliAvailable: cliAvailable, runTrackedJob } = require('./claude-cli');
        const { buildPrompt } = require('./ai-prompts');

        if (!cliAvailable()) {
          result.actions.push({ type: 'trigger_skill', skill: config.skill, skipped: true, reason: 'CLI not installed' });
          break;
        }

        const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId);
        const company = deal?.company_id ? db.prepare('SELECT * FROM companies WHERE id = ?').get(deal.company_id) : {};
        const contact = deal?.contact_id ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(deal.contact_id) : {};

        // Build prompt from config template with deal context
        let prompt = config.prompt_template || '';
        const context = {
          company: company?.name || '', contact: contact?.name || '',
          location: company?.location || '', industry: company?.industry || '',
          type: company?.type || '', source_detail: deal?.source_detail || '',
          notes: deal?.call_notes || '', package_type: deal?.package_type || '',
          services_discussed: deal?.services_discussed || '', pricing_notes: deal?.pricing_notes || '',
          call_notes: deal?.call_notes || '',
        };
        prompt = prompt.replace(/\{(\w+)\}/g, (match, field) => context[field] || match);

        const jobType = config.skill === 'tkbs-initial-analysis' ? 'analysis_deck' : 'proposal';

        // Run async — don't await in the action handler
        runTrackedJob(db, dealId, jobType, prompt).catch(err => {
          console.error(`Skill trigger failed for deal ${dealId}:`, err.message);
        });

        result.skillsTriggered.push(config.skill);
        result.actions.push({ type: 'trigger_skill', skill: config.skill, started: true });
        break;
      }

      case 'record':
        handleRecord(db, dealId, config);
        result.actions.push({ type: 'record' });
        break;
    }
  }

  // Auto-notify Slack on stage changes if enabled
  try {
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId);
    const company = deal?.company_id ? db.prepare('SELECT * FROM companies WHERE id = ?').get(deal.company_id) : null;
    const contact = deal?.contact_id ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(deal.contact_id) : null;
    const user = userId ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId) : null;

    if (newStage === 'lead') {
      const notif = buildNewLeadNotification(deal, company, contact);
      postNotification(db, notif).catch(() => {});
    } else {
      const notif = buildStageChangeNotification(deal, company, contact, null, newStage, user);
      postNotification(db, notif).catch(() => {});
    }
  } catch (e) { /* Slack notification is best-effort */ }

  // Dispatch outbound webhooks
  try {
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId);
    const company = deal?.company_id ? db.prepare('SELECT * FROM companies WHERE id = ?').get(deal.company_id) : null;
    const contact = deal?.contact_id ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(deal.contact_id) : null;

    const eventName = newStage === 'lead' ? 'deal.created' :
                       newStage === 'closed_won' ? 'deal.closed_won' :
                       newStage === 'closed_lost' ? 'deal.closed_lost' : 'deal.stage_changed';

    dispatchWebhooks(db, eventName, { deal, company, contact }).catch(() => {});
  } catch (e) { /* best effort */ }

  return result;
}

function createTasks(db, dealId, config) {
  const tasks = config.tasks || [];
  const now = new Date();
  let count = 0;

  for (const task of tasks) {
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + (task.due_offset_days || 0));
    const dueAt = dueDate.toISOString().replace('Z', '').split('.')[0];

    db.prepare(
      `INSERT INTO tasks (deal_id, description, due_at, auto_generated, template_key)
       VALUES (?, ?, ?, 1, ?)`
    ).run(dealId, task.description, dueAt, task.template || null);
    count++;
  }

  return count;
}

function startCadence(db, dealId, config) {
  const reminders = config.reminders || [];
  const now = new Date();
  let count = 0;

  for (const reminder of reminders) {
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + (reminder.day || 0));
    const dueAt = dueDate.toISOString().replace('Z', '').split('.')[0];

    const description = reminder.description || `Follow-up reminder (day ${reminder.day})`;

    db.prepare(
      `INSERT INTO tasks (deal_id, description, due_at, auto_generated, template_key)
       VALUES (?, ?, ?, 1, ?)`
    ).run(dealId, description, dueAt, reminder.template || null);
    count++;
  }

  return count;
}

function handleRecord(db, dealId, config) {
  if (config.cancel_pending_tasks) {
    db.prepare("UPDATE tasks SET status = 'overdue' WHERE deal_id = ? AND status = 'pending'").run(dealId);
  }
}

module.exports = { executeStageActions };
