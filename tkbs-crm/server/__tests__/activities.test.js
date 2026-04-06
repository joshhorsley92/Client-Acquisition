const request = require('supertest');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../index');

function setupTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

function seedTestData(db) {
  const hash = bcrypt.hashSync('testpass123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
    'Test User', 'test@test.com', hash, 'admin'
  );
  db.prepare('INSERT INTO companies (name) VALUES (?)').run('Acme');
  db.prepare('INSERT INTO contacts (name, company_id) VALUES (?, ?)').run('Sarah', 1);
  db.prepare('INSERT INTO deals (company_id, contact_id, stage, owner_id) VALUES (?, ?, ?, ?)').run(1, 1, 'lead', 1);
}

let db, app, agent;

beforeEach(async () => {
  db = setupTestDb();
  seedTestData(db);
  app = createApp(db);
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
});

afterEach(() => { db.close(); });

describe('POST /api/activities', () => {
  test('logs an activity on a deal', async () => {
    const res = await agent.post('/api/activities').send({
      deal_id: 1,
      type: 'email',
      content: 'Sent cold email #1',
    });
    expect(res.status).toBe(201);
    expect(res.body.activity.type).toBe('email');
    expect(res.body.activity.created_by).toBe(1);
  });

  test('returns 400 without deal_id', async () => {
    const res = await agent.post('/api/activities').send({ type: 'note', content: 'test' });
    expect(res.status).toBe(400);
  });

  test('returns 400 without type', async () => {
    const res = await agent.post('/api/activities').send({ deal_id: 1, content: 'test' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/activities', () => {
  test('lists activities for a deal', async () => {
    await agent.post('/api/activities').send({ deal_id: 1, type: 'email', content: 'Email 1' });
    await agent.post('/api/activities').send({ deal_id: 1, type: 'call', content: 'Call 1' });
    const res = await agent.get('/api/activities?deal_id=1');
    expect(res.status).toBe(200);
    expect(res.body.activities).toHaveLength(2);
  });

  test('returns empty array for deal with no activities', async () => {
    const res = await agent.get('/api/activities?deal_id=1');
    expect(res.body.activities).toHaveLength(0);
  });
});
