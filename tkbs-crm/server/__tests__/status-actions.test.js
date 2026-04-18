const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { executeStatusActions } = require('../services/status-actions');

function setupTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  db.exec(schema);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Test', 'test@test.com', 'hash', 'admin');
  db.prepare('INSERT INTO clients (name, owner_id) VALUES (?, ?)').run('Acme', 1);
  db.prepare(
    `INSERT INTO engagements (client_id, status, estimated_value, owner_id)
     VALUES (1, 'working', 5000, 1)`
  ).run();
  return db;
}

describe('executeStatusActions', () => {
  let db;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => { db.close(); });

  test('returns no actions for statuses with no configured action', () => {
    const result = executeStatusActions(db, 1, 'working', 1);
    expect(result.actions).toEqual([]);
  });

  test('fires activate_launch_on_dashboard on won (seeded in real db, manual insert in test)', () => {
    db.prepare(
      `INSERT INTO status_actions (status, action_type, config, sort_order)
       VALUES ('won', 'activate_launch_on_dashboard', '{}', 0)`
    ).run();

    const result = executeStatusActions(db, 1, 'won', 1);
    const kinds = result.actions.map((a) => a.type);
    expect(kinds).toContain('activate_launch_on_dashboard');
  });

  test('honors enabled=0 and skips disabled actions', () => {
    db.prepare(
      `INSERT INTO status_actions (status, action_type, config, enabled, sort_order)
       VALUES ('won', 'activate_launch_on_dashboard', '{}', 0, 0)`
    ).run();

    const result = executeStatusActions(db, 1, 'won', 1);
    expect(result.actions).toEqual([]);
  });
});
