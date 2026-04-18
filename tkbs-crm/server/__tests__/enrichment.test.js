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

let db, app, agent;

beforeEach(async () => {
  db = setupTestDb();
  const hash = bcrypt.hashSync('testpass123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Test', 'test@test.com', hash, 'admin');
  db.prepare('INSERT INTO clients (name, owner_id) VALUES (?, ?)').run('Acme', 1);
  app = createApp(db);
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
});

afterEach(() => { db.close(); });

describe('POST /api/enrichment/run', () => {
  test('responds pending and leaves the client row intact (Phase 1 stub)', async () => {
    const res = await agent.post('/api/enrichment/run').send({ client_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.client.id).toBe(1);
  });

  test('rejects missing client_id', async () => {
    const res = await agent.post('/api/enrichment/run').send({});
    expect(res.status).toBe(400);
  });

  test('404 on unknown client', async () => {
    const res = await agent.post('/api/enrichment/run').send({ client_id: 999 });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/enrichment/:clientId', () => {
  test('returns enrichment status and parsed data', async () => {
    db.prepare(
      "UPDATE clients SET enrichment_data = ?, enrichment_status = 'succeeded' WHERE id = 1"
    ).run(JSON.stringify({ sources: ['website'], confidence: 0.8 }));

    const res = await agent.get('/api/enrichment/1');
    expect(res.body.status).toBe('succeeded');
    expect(res.body.enrichment_data.sources).toEqual(['website']);
  });
});
