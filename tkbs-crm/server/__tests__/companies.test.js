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

function seedTestUser(db) {
  const hash = bcrypt.hashSync('testpass123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
    'Test User', 'test@test.com', hash, 'admin'
  );
}

let db, app, agent;

beforeEach(async () => {
  db = setupTestDb();
  seedTestUser(db);
  app = createApp(db);
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
});

afterEach(() => { db.close(); });

describe('POST /api/companies', () => {
  test('creates a company', async () => {
    const res = await agent.post('/api/companies').send({
      name: 'Acme Manufacturing',
      location: 'Detroit, MI',
      industry: 'Manufacturing',
      type: 'B2B',
    });
    expect(res.status).toBe(201);
    expect(res.body.company.name).toBe('Acme Manufacturing');
    expect(res.body.company.id).toBeDefined();
  });

  test('returns 400 without name', async () => {
    const res = await agent.post('/api/companies').send({ location: 'Detroit' });
    expect(res.status).toBe(400);
  });

  test('returns 401 when not logged in', async () => {
    const res = await request(app).post('/api/companies').send({ name: 'Test' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/companies', () => {
  test('lists companies', async () => {
    await agent.post('/api/companies').send({ name: 'Company A' });
    await agent.post('/api/companies').send({ name: 'Company B' });
    const res = await agent.get('/api/companies');
    expect(res.status).toBe(200);
    expect(res.body.companies).toHaveLength(2);
  });
});

describe('GET /api/companies/:id', () => {
  test('returns a single company', async () => {
    const create = await agent.post('/api/companies').send({ name: 'Acme', industry: 'Tech' });
    const res = await agent.get(`/api/companies/${create.body.company.id}`);
    expect(res.status).toBe(200);
    expect(res.body.company.name).toBe('Acme');
  });

  test('returns 404 for missing company', async () => {
    const res = await agent.get('/api/companies/999');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/companies/:id', () => {
  test('updates a company', async () => {
    const create = await agent.post('/api/companies').send({ name: 'Old Name' });
    const res = await agent.patch(`/api/companies/${create.body.company.id}`).send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.company.name).toBe('New Name');
  });
});

describe('DELETE /api/companies/:id', () => {
  test('deletes a company', async () => {
    const create = await agent.post('/api/companies').send({ name: 'ToDelete' });
    const res = await agent.delete(`/api/companies/${create.body.company.id}`);
    expect(res.status).toBe(200);
    const get = await agent.get(`/api/companies/${create.body.company.id}`);
    expect(get.status).toBe(404);
  });
});
