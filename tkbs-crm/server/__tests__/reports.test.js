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
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Test', 'test@test.com', hash, 'admin');
  db.prepare('INSERT INTO companies (name) VALUES (?)').run('Acme');
  db.prepare('INSERT INTO contacts (name, company_id) VALUES (?, ?)').run('Sarah', 1);

  // Active deals
  db.prepare("INSERT INTO deals (company_id, contact_id, stage, source, estimated_value, owner_id) VALUES (1, 1, 'lead', 'referral', 2000, 1)").run();
  db.prepare("INSERT INTO deals (company_id, contact_id, stage, source, estimated_value, owner_id) VALUES (1, 1, 'outreach', 'cold', 1500, 1)").run();
  // Won deal
  db.prepare("INSERT INTO deals (company_id, contact_id, stage, source, estimated_value, owner_id, closed_at) VALUES (1, 1, 'closed_won', 'referral', 3000, 1, '2026-03-15')").run();
  // Lost deal
  db.prepare("INSERT INTO deals (company_id, contact_id, stage, source, estimated_value, owner_id, lost_reason, closed_at) VALUES (1, 1, 'closed_lost', 'cold', 2500, 1, 'price', '2026-03-20')").run();
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
  test('returns pipeline metrics', async () => {
    const res = await agent.get('/api/reports/summary');
    expect(res.status).toBe(200);
    expect(res.body.summary.activeDeals).toBe(2);
    expect(res.body.summary.pipelineValue).toBe(3500);
    expect(res.body.summary.winRate).toBe(50);
    expect(res.body.summary.totalWon).toBe(1);
    expect(res.body.summary.totalLost).toBe(1);
  });
});

describe('GET /api/reports/sources', () => {
  test('returns deals grouped by source', async () => {
    const res = await agent.get('/api/reports/sources');
    expect(res.body.sources).toHaveLength(2);
  });
});

describe('GET /api/reports/lost-reasons', () => {
  test('returns lost deal reasons', async () => {
    const res = await agent.get('/api/reports/lost-reasons');
    expect(res.body.reasons).toHaveLength(1);
    expect(res.body.reasons[0].lost_reason).toBe('price');
  });
});
