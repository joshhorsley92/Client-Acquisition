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
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Test', 'test@test.com', hash, 'admin');

  db.prepare('INSERT INTO clients (name, owner_id) VALUES (?, ?)').run('Acme', 1);
  db.prepare('INSERT INTO clients (name, owner_id) VALUES (?, ?)').run('Beta Co', 1);

  // Client 1: open engagement + won engagement
  db.prepare(
    `INSERT INTO engagements (client_id, status, source, estimated_value, owner_id)
     VALUES (1, 'working', 'referral', 2000, 1)`
  ).run();
  db.prepare(
    `INSERT INTO engagements (client_id, status, source, estimated_value, closed_value, owner_id, closed_at)
     VALUES (1, 'won', 'referral', 3000, 3000, 1, '2026-03-15')`
  ).run();

  // Client 2: new + lost engagements
  db.prepare(
    `INSERT INTO engagements (client_id, status, source, estimated_value, owner_id)
     VALUES (2, 'new', 'cold', 1500, 1)`
  ).run();
  db.prepare(
    `INSERT INTO engagements (client_id, status, source, estimated_value, owner_id, lost_reason, closed_at)
     VALUES (2, 'lost', 'cold', 2500, 1, 'price', '2026-03-20')`
  ).run();
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

describe('GET /api/reports/summary', () => {
  test('returns clients, pipeline and revenue metrics', async () => {
    const res = await agent.get('/api/reports/summary');
    expect(res.status).toBe(200);
    expect(res.body.summary.clients).toBe(2);
    expect(res.body.summary.openEngagements).toBe(2); // working + new
    expect(res.body.summary.pipelineValue).toBe(3500); // 2000 + 1500
    expect(res.body.summary.lifetimeRevenue).toBe(3000);
    expect(res.body.summary.winRate).toBe(50);
    expect(res.body.summary.totalWon).toBe(1);
    expect(res.body.summary.totalLost).toBe(1);
  });
});

describe('GET /api/reports/sources', () => {
  test('returns engagements grouped by source', async () => {
    const res = await agent.get('/api/reports/sources');
    expect(res.body.sources).toHaveLength(2);
  });
});

describe('GET /api/reports/lost-reasons', () => {
  test('returns lost engagement reasons', async () => {
    const res = await agent.get('/api/reports/lost-reasons');
    expect(res.body.reasons).toHaveLength(1);
    expect(res.body.reasons[0].lost_reason).toBe('price');
  });
});

describe('GET /api/reports/status', () => {
  test('returns engagement counts by status', async () => {
    const res = await agent.get('/api/reports/status');
    const byStatus = Object.fromEntries(res.body.status.map((r) => [r.status, r.count]));
    expect(byStatus.working).toBe(1);
    expect(byStatus.new).toBe(1);
    expect(byStatus.won).toBe(1);
    expect(byStatus.lost).toBe(1);
  });
});

describe('GET /api/reports/client-revenue', () => {
  test('returns per-client lifetime revenue aggregates', async () => {
    const res = await agent.get('/api/reports/client-revenue');
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.clients.map((c) => [c.name, c]));

    expect(byName.Acme.lifetime_revenue).toBe(3000);
    expect(byName.Acme.won_engagements).toBe(1);
    expect(byName.Acme.open_engagements).toBe(1);
    expect(byName.Acme.total_engagements).toBe(2);

    expect(byName['Beta Co'].lifetime_revenue).toBe(0);
    expect(byName['Beta Co'].won_engagements).toBe(0);
    expect(byName['Beta Co'].open_engagements).toBe(1);
  });

  test('ranks clients by lifetime revenue descending', async () => {
    const res = await agent.get('/api/reports/client-revenue');
    expect(res.body.clients[0].name).toBe('Acme');
  });
});
