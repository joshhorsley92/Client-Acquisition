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

  test('returns notification side effects (Slack + webhooks) — no external actions', () => {
    const result = executeStatusActions(db, 1, 'working', 1);
    const kinds = result.actions.map((a) => a.type);
    expect(kinds).toContain('slack_notification');
    expect(kinds).toContain('webhook_dispatch');
  });

  test('emits engagement.won event on won transition', () => {
    const result = executeStatusActions(db, 1, 'won', 1);
    const hook = result.actions.find((a) => a.type === 'webhook_dispatch');
    expect(hook?.event).toBe('engagement.won');
  });

  test('emits engagement.created on new transition', () => {
    const result = executeStatusActions(db, 1, 'new', 1);
    const hook = result.actions.find((a) => a.type === 'webhook_dispatch');
    expect(hook?.event).toBe('engagement.created');
  });

  test('swallows a missing engagement gracefully', () => {
    expect(() => executeStatusActions(db, 999, 'working', 1)).not.toThrow();
  });
});
