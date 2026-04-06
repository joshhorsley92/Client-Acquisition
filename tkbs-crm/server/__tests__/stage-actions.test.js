const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { executeStageActions } = require('../services/stage-actions');

function setupTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

function seedTestData(db) {
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test', 'test@test.com', 'hash', 'admin');
  db.prepare('INSERT INTO companies (name) VALUES (?)').run('Acme');
  db.prepare('INSERT INTO contacts (name, company_id) VALUES (?, ?)').run('Sarah', 1);
  db.prepare('INSERT INTO deals (company_id, contact_id, stage, owner_id) VALUES (?, ?, ?, ?)').run(1, 1, 'lead', 1);

  // Add stage actions for lead stage
  db.prepare(`INSERT INTO stage_actions (stage, action_type, config, sort_order) VALUES (?, ?, ?, ?)`).run(
    'lead', 'create_tasks',
    JSON.stringify({ tasks: [
      { description: 'Research prospect', due_offset_days: 0 },
      { description: 'Send first outreach', due_offset_days: 1 },
    ]}),
    0
  );
}

let db;

beforeEach(() => {
  db = setupTestDb();
  seedTestData(db);
});

afterEach(() => { db.close(); });

describe('executeStageActions', () => {
  test('creates tasks when deal enters a stage with create_tasks action', () => {
    const result = executeStageActions(db, 1, 'lead', 1);
    expect(result.tasksCreated).toBe(2);

    const tasks = db.prepare('SELECT * FROM tasks WHERE deal_id = 1 ORDER BY id').all();
    expect(tasks).toHaveLength(2);
    expect(tasks[0].description).toBe('Research prospect');
    expect(tasks[0].auto_generated).toBe(1);
    expect(tasks[1].description).toBe('Send first outreach');
  });

  test('returns empty result when no actions configured', () => {
    const result = executeStageActions(db, 1, 'nonexistent_stage', 1);
    expect(result.tasksCreated).toBe(0);
    expect(result.actions).toHaveLength(0);
  });

  test('skips disabled actions', () => {
    db.prepare('UPDATE stage_actions SET enabled = 0 WHERE stage = ?').run('lead');
    const result = executeStageActions(db, 1, 'lead', 1);
    expect(result.tasksCreated).toBe(0);
  });
});

describe('closed_lost cancels pending tasks', () => {
  test('cancels all pending tasks when entering closed_lost', () => {
    // Create some pending tasks
    db.prepare('INSERT INTO tasks (deal_id, description, status) VALUES (?, ?, ?)').run(1, 'Task 1', 'pending');
    db.prepare('INSERT INTO tasks (deal_id, description, status) VALUES (?, ?, ?)').run(1, 'Task 2', 'pending');
    db.prepare('INSERT INTO tasks (deal_id, description, status) VALUES (?, ?, ?)').run(1, 'Task 3', 'done');

    // Add closed_lost action
    db.prepare(`INSERT INTO stage_actions (stage, action_type, config, sort_order) VALUES (?, ?, ?, ?)`).run(
      'closed_lost', 'record',
      JSON.stringify({ require_lost_reason: true, cancel_pending_tasks: true }),
      0
    );

    executeStageActions(db, 1, 'closed_lost', 1);

    const pending = db.prepare("SELECT * FROM tasks WHERE deal_id = 1 AND status = 'pending'").all();
    const done = db.prepare("SELECT * FROM tasks WHERE deal_id = 1 AND status = 'done'").all();
    expect(pending).toHaveLength(0);
    expect(done).toHaveLength(1); // The already-done task is untouched
  });
});
