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

describe('POST /api/scripts', () => {
  test('creates a script template', async () => {
    const res = await agent.post('/api/scripts').send({
      stage: 'outreach',
      name: 'Cold Email #1',
      type: 'email',
      content: 'Hey {contact},\n\nI noticed {company} in {location}...',
    });
    expect(res.status).toBe(201);
    expect(res.body.script.name).toBe('Cold Email #1');
    expect(res.body.script.format).toBe('markdown');
  });
});

describe('GET /api/scripts', () => {
  test('lists scripts filtered by stage', async () => {
    await agent.post('/api/scripts').send({ stage: 'outreach', name: 'Email 1', type: 'email', content: 'test' });
    await agent.post('/api/scripts').send({ stage: 'outreach', name: 'Email 2', type: 'email', content: 'test' });
    await agent.post('/api/scripts').send({ stage: 'follow_up', name: 'Follow Up', type: 'email', content: 'test' });

    const res = await agent.get('/api/scripts?stage=outreach');
    expect(res.body.scripts).toHaveLength(2);
  });

  test('returns all scripts without filter', async () => {
    await agent.post('/api/scripts').send({ stage: 'outreach', name: 'E1', type: 'email', content: 'test' });
    await agent.post('/api/scripts').send({ stage: 'follow_up', name: 'E2', type: 'email', content: 'test' });
    const res = await agent.get('/api/scripts');
    expect(res.body.scripts).toHaveLength(2);
  });
});

describe('PATCH /api/scripts/:id', () => {
  test('updates a script', async () => {
    const create = await agent.post('/api/scripts').send({ stage: 'outreach', name: 'Old', type: 'email', content: 'old' });
    const res = await agent.patch(`/api/scripts/${create.body.script.id}`).send({ name: 'New', content: 'updated' });
    expect(res.body.script.name).toBe('New');
    expect(res.body.script.content).toBe('updated');
  });
});

describe('DELETE /api/scripts/:id', () => {
  test('deletes a script', async () => {
    const create = await agent.post('/api/scripts').send({ stage: 'outreach', name: 'Del', type: 'email', content: 'x' });
    const res = await agent.delete(`/api/scripts/${create.body.script.id}`);
    expect(res.status).toBe(200);
  });
});
