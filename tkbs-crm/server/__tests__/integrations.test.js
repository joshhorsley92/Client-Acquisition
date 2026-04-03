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
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test Admin', 'admin@test.com', hash, 'admin');

  // Seed default integrations
  ['gmail', 'slack', 'google_calendar', 'twilio', 'webhooks'].forEach(type => {
    db.prepare('INSERT OR IGNORE INTO integration_settings (type, config) VALUES (?, ?)').run(type, '{}');
  });
}

let db, app, agent;

beforeEach(async () => {
  db = setupTestDb();
  seedTestData(db);
  app = createApp(db);
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'testpass123' });
});

afterEach(() => { db.close(); });

describe('GET /api/integrations', () => {
  test('returns all integrations', async () => {
    const res = await agent.get('/api/integrations');
    expect(res.status).toBe(200);
    expect(res.body.integrations).toHaveLength(5);
    const types = res.body.integrations.map(i => i.type);
    expect(types).toContain('gmail');
    expect(types).toContain('slack');
    expect(types).toContain('twilio');
  });

  test('requires auth', async () => {
    const res = await request(app).get('/api/integrations');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/integrations/:type', () => {
  test('returns a single integration', async () => {
    const res = await agent.get('/api/integrations/slack');
    expect(res.status).toBe(200);
    expect(res.body.integration.type).toBe('slack');
    expect(res.body.integration.enabled).toBe(0);
  });

  test('returns 404 for unknown type', async () => {
    const res = await agent.get('/api/integrations/unknown');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/integrations/:type', () => {
  test('updates enabled status', async () => {
    const res = await agent.patch('/api/integrations/slack').send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.integration.enabled).toBe(1);
  });

  test('updates config', async () => {
    const config = { webhookUrl: 'https://hooks.slack.com/test', botToken: 'xoxb-test' };
    const res = await agent.patch('/api/integrations/slack').send({ config });
    expect(res.status).toBe(200);
    const stored = JSON.parse(res.body.integration.config);
    expect(stored.webhookUrl).toBe('https://hooks.slack.com/test');
  });

  test('returns 404 for unknown type', async () => {
    const res = await agent.patch('/api/integrations/unknown').send({ enabled: true });
    expect(res.status).toBe(404);
  });

  test('requires auth', async () => {
    const res = await request(app).patch('/api/integrations/slack').send({ enabled: true });
    expect(res.status).toBe(401);
  });

  test('non-admin cannot update integrations', async () => {
    const memberHash = bcrypt.hashSync('pass123', 10);
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Member', 'member@test.com', memberHash, 'member');

    const memberAgent = request.agent(app);
    await memberAgent.post('/api/auth/login').send({ email: 'member@test.com', password: 'pass123' });

    const res = await memberAgent.patch('/api/integrations/slack').send({ enabled: true });
    expect(res.status).toBe(403);
  });
});
