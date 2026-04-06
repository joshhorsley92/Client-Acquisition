const request = require('supertest');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../index');

function setupTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  db.exec(schema);
  // Add lead stage action so executeStageActions has something to do
  db.prepare("INSERT INTO stage_actions (stage, action_type, config, sort_order) VALUES (?, ?, ?, ?)").run(
    'lead', 'create_tasks', JSON.stringify({ tasks: [{ description: 'Research prospect', due_offset_days: 0 }] }), 0
  );
  return db;
}

let db, app;

beforeEach(() => {
  db = setupTestDb();
  app = createApp(db);
});

afterEach(() => { db.close(); });

describe('POST /api/intake/form', () => {
  test('creates company, contact, and deal from form submission', async () => {
    const res = await request(app).post('/api/intake/form').send({
      name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '555-1234',
      company_name: 'Smith Co',
      message: 'Interested in marketing services',
      source: 'web',
    });
    expect(res.status).toBe(201);
    expect(res.body.deal_id).toBeDefined();
    expect(res.body.company_id).toBeDefined();
    expect(res.body.contact_id).toBeDefined();

    // Verify deal was created
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(res.body.deal_id);
    expect(deal.stage).toBe('lead');
    expect(deal.source).toBe('web');

    // Verify tasks were auto-created by stage actions
    const tasks = db.prepare('SELECT * FROM tasks WHERE deal_id = ?').all(res.body.deal_id);
    expect(tasks.length).toBeGreaterThan(0);
  });

  test('reuses existing company by name', async () => {
    db.prepare('INSERT INTO companies (name) VALUES (?)').run('Existing Co');
    const res = await request(app).post('/api/intake/form').send({
      name: 'John',
      company_name: 'Existing Co',
    });
    expect(res.status).toBe(201);
    expect(res.body.company_id).toBe(1); // Should reuse existing
  });

  test('reuses existing contact by email', async () => {
    db.prepare('INSERT INTO contacts (name, email) VALUES (?, ?)').run('Jane', 'jane@test.com');
    const res = await request(app).post('/api/intake/form').send({
      name: 'Jane Smith',
      email: 'jane@test.com',
      company_name: 'New Co',
    });
    expect(res.status).toBe(201);
    expect(res.body.contact_id).toBe(1); // Should reuse existing
  });

  test('returns 400 without name or company_name', async () => {
    const res = await request(app).post('/api/intake/form').send({ email: 'test@test.com' });
    expect(res.status).toBe(400);
  });
});
