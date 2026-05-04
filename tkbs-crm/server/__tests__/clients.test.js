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

function seedUser(db) {
  const hash = bcrypt.hashSync('testpass123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Test', 'test@test.com', hash, 'admin');
}

let db, app, agent;

beforeEach(async () => {
  db = setupTestDb();
  seedUser(db);
  app = createApp(db);
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'test@test.com', password: 'testpass123' });
});

afterEach(() => { db.close(); });

describe('POST /api/clients', () => {
  test('creates a client with just a name', async () => {
    const res = await agent.post('/api/clients').send({ name: 'Acme' });
    expect(res.status).toBe(201);
    expect(res.body.client.name).toBe('Acme');
    expect(res.body.client.enrichment_status).toBe('none');
  });

  test('rejects missing name', async () => {
    const res = await agent.post('/api/clients').send({});
    expect(res.status).toBe(400);
  });

  test('accepts all descriptive fields', async () => {
    const res = await agent.post('/api/clients').send({
      name: 'Acme', website: 'https://acme.test', industry: 'Retail',
      location: 'Detroit, MI', type: 'B2C',
      primary_contact_name: 'Sarah', email: 'sarah@acme.test', phone: '555-1234', role: 'Owner',
      notes: 'Met at trade show',
    });
    expect(res.status).toBe(201);
    expect(res.body.client.website).toBe('https://acme.test');
    expect(res.body.client.primary_contact_name).toBe('Sarah');
  });
});

describe('GET /api/clients', () => {
  test('lists clients with engagement rollups', async () => {
    const created = await agent.post('/api/clients').send({ name: 'Acme' });
    db.prepare(
      `INSERT INTO engagements (client_id, status, estimated_value, owner_id)
       VALUES (?, 'won', 5000, 1)`
    ).run(created.body.client.id);
    db.prepare(
      `INSERT INTO engagements (client_id, status, estimated_value, owner_id)
       VALUES (?, 'working', 2000, 1)`
    ).run(created.body.client.id);

    const res = await agent.get('/api/clients');
    expect(res.status).toBe(200);
    expect(res.body.clients).toHaveLength(1);
    const c = res.body.clients[0];
    expect(c.total_engagements).toBe(2);
    expect(c.won_engagements).toBe(1);
    expect(c.open_engagements).toBe(1);
    expect(c.lifetime_revenue).toBe(5000);
  });

  test('filters by status via engagement subquery', async () => {
    const a = await agent.post('/api/clients').send({ name: 'Acme' });
    const b = await agent.post('/api/clients').send({ name: 'Beta' });
    db.prepare(`INSERT INTO engagements (client_id, status, owner_id) VALUES (?, 'won', 1)`).run(a.body.client.id);
    db.prepare(`INSERT INTO engagements (client_id, status, owner_id) VALUES (?, 'working', 1)`).run(b.body.client.id);

    const res = await agent.get('/api/clients?status=won');
    expect(res.body.clients).toHaveLength(1);
    expect(res.body.clients[0].name).toBe('Acme');
  });

  test('search matches across name/email/contact/website', async () => {
    await agent.post('/api/clients').send({ name: 'Acme', email: 'hi@acme.test' });
    await agent.post('/api/clients').send({ name: 'Beta' });

    const res = await agent.get('/api/clients?search=acme');
    expect(res.body.clients).toHaveLength(1);
  });
});

describe('GET /api/clients/:id', () => {
  test('returns client + its engagements', async () => {
    const created = await agent.post('/api/clients').send({ name: 'Acme' });
    db.prepare(
      `INSERT INTO engagements (client_id, status, estimated_value, owner_id)
       VALUES (?, 'working', 2000, 1)`
    ).run(created.body.client.id);

    const res = await agent.get(`/api/clients/${created.body.client.id}`);
    expect(res.body.client.name).toBe('Acme');
    expect(res.body.engagements).toHaveLength(1);
  });

  test('returns 404 for missing client', async () => {
    const res = await agent.get('/api/clients/999');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/clients/:id', () => {
  test('updates scalar fields', async () => {
    const created = await agent.post('/api/clients').send({ name: 'Old' });
    const res = await agent.patch(`/api/clients/${created.body.client.id}`).send({
      name: 'New', industry: 'Retail',
    });
    expect(res.body.client.name).toBe('New');
    expect(res.body.client.industry).toBe('Retail');
  });

  test('persists JSON fields (social_links, enrichment_data)', async () => {
    const created = await agent.post('/api/clients').send({ name: 'Acme' });
    const res = await agent.patch(`/api/clients/${created.body.client.id}`).send({
      social_links: { linkedin: 'https://linkedin.com/company/acme' },
      enrichment_data: { sources: ['website'], scraped_at: '2026-04-18' },
    });
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body.client.social_links);
    expect(parsed.linkedin).toContain('acme');
  });

  test('PATCH brand_profile auto-tags every changed leaf path as "manual"', async () => {
    const created = await agent.post('/api/clients').send({ name: 'Acme' });
    const id = created.body.client.id;

    // Seed a profile with a "call:5" tagged field — simulates a previously
    // applied call extraction.
    await agent.patch(`/api/clients/${id}`).send({
      brand_profile: { business_name: 'Acme', industry: 'Retail' },
      brand_profile_sources: { business_name: 'call:5', industry: 'call:5' },
    });

    // Now the user edits business_name in the BrandProfileEditor. Industry
    // unchanged. After the PATCH, business_name should flip to 'manual'.
    const res = await agent.patch(`/api/clients/${id}`).send({
      brand_profile: { business_name: 'Acme Boutique', industry: 'Retail' },
    });
    expect(res.status).toBe(200);
    const sources = JSON.parse(res.body.client.brand_profile_sources);
    expect(sources.business_name).toBe('manual');
    expect(sources.industry).toBe('call:5');
  });

  test('PATCH brand_profile tags newly-added paths as "manual"', async () => {
    const created = await agent.post('/api/clients').send({ name: 'Acme' });
    const id = created.body.client.id;

    const res = await agent.patch(`/api/clients/${id}`).send({
      brand_profile: { business_name: 'Acme', tagline: 'Built for you.' },
    });
    expect(res.status).toBe(200);
    const sources = JSON.parse(res.body.client.brand_profile_sources);
    expect(sources.business_name).toBe('manual');
    expect(sources.tagline).toBe('manual');
  });

  test('PATCH brand_profile + sources together: caller-supplied sources are trusted verbatim', async () => {
    // This is the contract used by the apply-to-client diff modal — when the
    // caller passes sources explicitly, no auto-tagging happens.
    const created = await agent.post('/api/clients').send({ name: 'Acme' });
    const id = created.body.client.id;

    const res = await agent.patch(`/api/clients/${id}`).send({
      brand_profile: { business_name: 'Acme' },
      brand_profile_sources: { business_name: 'call:9' },
    });
    expect(res.status).toBe(200);
    const sources = JSON.parse(res.body.client.brand_profile_sources);
    expect(sources.business_name).toBe('call:9');
  });
});

describe('DELETE /api/clients/:id', () => {
  test('cascades to engagements and activities', async () => {
    const created = await agent.post('/api/clients').send({ name: 'Acme' });
    db.prepare(
      `INSERT INTO engagements (client_id, status, owner_id) VALUES (?, 'working', 1)`
    ).run(created.body.client.id);

    const res = await agent.delete(`/api/clients/${created.body.client.id}`);
    expect(res.status).toBe(200);

    const remaining = db.prepare('SELECT COUNT(*) AS n FROM engagements').get().n;
    expect(remaining).toBe(0);
  });
});
