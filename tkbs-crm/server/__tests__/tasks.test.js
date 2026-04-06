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
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test User', 'test@test.com', hash, 'admin');
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

describe('POST /api/tasks', () => {
  test('creates a task for a deal', async () => {
    const res = await agent.post('/api/tasks').send({
      deal_id: 1,
      description: 'Send follow-up email',
      due_at: '2026-04-02T08:00:00',
    });
    expect(res.status).toBe(201);
    expect(res.body.task.description).toBe('Send follow-up email');
    expect(res.body.task.status).toBe('pending');
  });

  test('creates a task with natural language date', async () => {
    const res = await agent.post('/api/tasks').send({
      deal_id: 1,
      description: 'Call back',
      due_at_natural: 'next Tuesday at 8AM',
    });
    expect(res.status).toBe(201);
    expect(res.body.task.due_at).toBeDefined();
  });

  test('returns 400 without deal_id', async () => {
    const res = await agent.post('/api/tasks').send({ description: 'Test' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/tasks', () => {
  test('lists tasks grouped by status', async () => {
    await agent.post('/api/tasks').send({ deal_id: 1, description: 'Task 1', due_at: '2026-04-01T08:00:00' });
    await agent.post('/api/tasks').send({ deal_id: 1, description: 'Task 2', due_at: '2026-04-02T08:00:00' });
    const res = await agent.get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(2);
  });

  test('filters by deal_id', async () => {
    await agent.post('/api/tasks').send({ deal_id: 1, description: 'Task 1' });
    const res = await agent.get('/api/tasks?deal_id=1');
    expect(res.body.tasks).toHaveLength(1);
  });

  test('filters by status', async () => {
    await agent.post('/api/tasks').send({ deal_id: 1, description: 'Task 1' });
    const res = await agent.get('/api/tasks?status=pending');
    expect(res.body.tasks).toHaveLength(1);
    const res2 = await agent.get('/api/tasks?status=done');
    expect(res2.body.tasks).toHaveLength(0);
  });
});

describe('PATCH /api/tasks/:id', () => {
  test('marks a task as done', async () => {
    const create = await agent.post('/api/tasks').send({ deal_id: 1, description: 'Task 1' });
    const res = await agent.patch(`/api/tasks/${create.body.task.id}`).send({ status: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('done');
    expect(res.body.task.completed_at).toBeDefined();
  });

  test('reschedules a task', async () => {
    const create = await agent.post('/api/tasks').send({ deal_id: 1, description: 'Task 1', due_at: '2026-04-01T08:00:00' });
    const res = await agent.patch(`/api/tasks/${create.body.task.id}`).send({ due_at: '2026-04-05T10:00:00' });
    expect(res.body.task.due_at).toBe('2026-04-05T10:00:00');
  });
});
