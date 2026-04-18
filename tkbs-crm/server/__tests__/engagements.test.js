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

function seed(db) {
  const hash = bcrypt.hashSync('testpass123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Test', 'test@test.com', hash, 'admin');
  db.prepare('INSERT INTO clients (name, owner_id) VALUES (?, ?)').run('Acme', 1);
}

let db, app, agent;

beforeEach(async () => {
  db = setupTestDb();
  seed(db);
  app = createApp(db);
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
});

afterEach(() => { db.close(); });

describe('POST /api/engagements', () => {
  test('creates an engagement attached to a client', async () => {
    const res = await agent.post('/api/engagements').send({
      client_id: 1, status: 'new', estimated_value: 5000, source: 'referral',
    });
    expect(res.status).toBe(201);
    expect(res.body.engagement.client_id).toBe(1);
    expect(res.body.engagement.status).toBe('new');
    expect(res.body.engagement.estimated_value).toBe(5000);
  });

  test('defaults status to new', async () => {
    const res = await agent.post('/api/engagements').send({ client_id: 1 });
    expect(res.body.engagement.status).toBe('new');
  });

  test('rejects missing client_id', async () => {
    const res = await agent.post('/api/engagements').send({ status: 'new' });
    expect(res.status).toBe(400);
  });

  test('rejects unknown client_id', async () => {
    const res = await agent.post('/api/engagements').send({ client_id: 999 });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/engagements/:id', () => {
  test('status transition updates status_changed_at and logs activity', async () => {
    const created = await agent.post('/api/engagements').send({ client_id: 1, status: 'new' });
    const id = created.body.engagement.id;

    const res = await agent.patch(`/api/engagements/${id}`).send({ status: 'working' });
    expect(res.status).toBe(200);
    expect(res.body.engagement.status).toBe('working');

    const activities = db.prepare('SELECT * FROM activities WHERE engagement_id = ?').all(id);
    expect(activities.length).toBeGreaterThan(0);
    expect(activities[0].type).toBe('status_change');
  });

  test('won transition stamps closed_at', async () => {
    const created = await agent.post('/api/engagements').send({ client_id: 1 });
    const id = created.body.engagement.id;

    const res = await agent.patch(`/api/engagements/${id}`).send({
      status: 'won', closed_value: 4500,
    });
    expect(res.body.engagement.closed_at).toBeTruthy();
    expect(res.body.engagement.closed_value).toBe(4500);
  });

  test('lost status requires lost_reason', async () => {
    const created = await agent.post('/api/engagements').send({ client_id: 1 });
    const res = await agent.patch(`/api/engagements/${created.body.engagement.id}`).send({
      status: 'lost',
    });
    expect(res.status).toBe(400);
  });

  test('lost status accepts lost_reason', async () => {
    const created = await agent.post('/api/engagements').send({ client_id: 1 });
    const res = await agent.patch(`/api/engagements/${created.body.engagement.id}`).send({
      status: 'lost', lost_reason: 'price',
    });
    expect(res.status).toBe(200);
    expect(res.body.engagement.lost_reason).toBe('price');
  });
});

describe('GET /api/engagements', () => {
  test('lists with joined client_name', async () => {
    await agent.post('/api/engagements').send({ client_id: 1, estimated_value: 1000 });
    const res = await agent.get('/api/engagements');
    expect(res.status).toBe(200);
    expect(res.body.engagements[0].client_name).toBe('Acme');
  });

  test('filters by client_id', async () => {
    db.prepare('INSERT INTO clients (name, owner_id) VALUES (?, ?)').run('Beta', 1);
    await agent.post('/api/engagements').send({ client_id: 1 });
    await agent.post('/api/engagements').send({ client_id: 2 });

    const res = await agent.get('/api/engagements?client_id=1');
    expect(res.body.engagements).toHaveLength(1);
  });

  test('filters by status', async () => {
    await agent.post('/api/engagements').send({ client_id: 1, status: 'new' });
    await agent.post('/api/engagements').send({ client_id: 1, status: 'working' });

    const res = await agent.get('/api/engagements?status=new');
    expect(res.body.engagements).toHaveLength(1);
  });
});

describe('DELETE /api/engagements/:id', () => {
  test('removes the engagement', async () => {
    const created = await agent.post('/api/engagements').send({ client_id: 1 });
    const res = await agent.delete(`/api/engagements/${created.body.engagement.id}`);
    expect(res.status).toBe(200);

    const remaining = db.prepare('SELECT COUNT(*) AS n FROM engagements').get().n;
    expect(remaining).toBe(0);
  });
});
