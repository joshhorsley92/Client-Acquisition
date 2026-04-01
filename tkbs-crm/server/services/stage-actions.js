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

      case 'trigger_skill':
        // Phase 3 will implement CLI invocation. For now, log intent.
        result.skillsTriggered.push(config.skill);
        result.actions.push({ type: 'trigger_skill', skill: config.skill });
        break;

      case 'record':
        handleRecord(db, dealId, config);
        result.actions.push({ type: 'record' });
        break;
    }
  }

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
