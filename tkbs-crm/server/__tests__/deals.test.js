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
  db.prepare('INSERT INTO companies (name, location, industry, type) VALUES (?, ?, ?, ?)').run(
    'Acme Mfg', 'Detroit, MI', 'Manufacturing', 'B2B'
  );
  db.prepare('INSERT INTO contacts (name, email, company_id) VALUES (?, ?, ?)').run(
    'Sarah Chen', 'sarah@acme.com', 1
  );
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

describe('POST /api/deals', () => {
  test('creates a deal', async () => {
    const res = await agent.post('/api/deals').send({
      contact_id: 1,
      company_id: 1,
      source: 'referral',
      source_detail: 'Referral from Dave',
      estimated_value: 2500,
      package_type: 'boost',
    });
    expect(res.status).toBe(201);
    expect(res.body.deal.stage).toBe('lead');
    expect(res.body.deal.source).toBe('referral');
    expect(res.body.deal.owner_id).toBe(1); // auto-assigned to current user
  });

  test('returns 400 without contact_id or company_id', async () => {
    const res = await agent.post('/api/deals').send({ source: 'cold' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/deals', () => {
  test('lists deals', async () => {
    await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.get('/api/deals');
    expect(res.body.deals).toHaveLength(2);
  });

  test('filters by stage', async () => {
    await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.get('/api/deals?stage=lead');
    expect(res.body.deals).toHaveLength(1);
    const res2 = await agent.get('/api/deals?stage=outreach');
    expect(res2.body.deals).toHaveLength(0);
  });
});

describe('GET /api/deals/:id', () => {
  test('returns deal with company and contact', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.get(`/api/deals/${create.body.deal.id}`);
    expect(res.status).toBe(200);
    expect(res.body.deal.id).toBeDefined();
    expect(res.body.company.name).toBe('Acme Mfg');
    expect(res.body.contact.name).toBe('Sarah Chen');
  });

  test('returns 404 for missing deal', async () => {
    const res = await agent.get('/api/deals/999');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/deals/:id', () => {
  test('updates deal fields', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.patch(`/api/deals/${create.body.deal.id}`).send({
      estimated_value: 5000,
      package_type: 'launch',
    });
    expect(res.status).toBe(200);
    expect(res.body.deal.estimated_value).toBe(5000);
    expect(res.body.deal.package_type).toBe('launch');
  });

  test('updates stage and records stage_entered_at', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.patch(`/api/deals/${create.body.deal.id}`).send({ stage: 'outreach' });
    expect(res.body.deal.stage).toBe('outreach');
    expect(res.body.deal.stage_entered_at).not.toBe(create.body.deal.stage_entered_at);
  });

  test('logs stage change as activity', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    await agent.patch(`/api/deals/${create.body.deal.id}`).send({ stage: 'outreach' });
    const activities = await agent.get(`/api/activities?deal_id=${create.body.deal.id}`);
    const stageChange = activities.body.activities.find(a => a.type === 'stage_change');
    expect(stageChange).toBeDefined();
    expect(stageChange.content).toContain('outreach');
  });

  test('sets closed_at when moving to closed_won', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.patch(`/api/deals/${create.body.deal.id}`).send({ stage: 'closed_won' });
    expect(res.body.deal.closed_at).toBeDefined();
  });

  test('requires lost_reason when moving to closed_lost', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.patch(`/api/deals/${create.body.deal.id}`).send({ stage: 'closed_lost' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('lost_reason');
  });

  test('accepts closed_lost with lost_reason', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.patch(`/api/deals/${create.body.deal.id}`).send({
      stage: 'closed_lost',
      lost_reason: 'price',
    });
    expect(res.status).toBe(200);
    expect(res.body.deal.stage).toBe('closed_lost');
    expect(res.body.deal.lost_reason).toBe('price');
  });
});

describe('DELETE /api/deals/:id', () => {
  test('soft-deletes a deal by moving to closed_lost', async () => {
    const create = await agent.post('/api/deals').send({ company_id: 1, contact_id: 1 });
    const res = await agent.delete(`/api/deals/${create.body.deal.id}`);
    expect(res.status).toBe(200);
  });
});
