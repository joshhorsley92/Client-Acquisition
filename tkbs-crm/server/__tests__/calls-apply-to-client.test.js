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

function insertCallWithExtraction(db, clientId, extraction) {
  const r = db.prepare(
    `INSERT INTO call_recordings (client_id, transcript, extracted_profile_json, review_status)
     VALUES (?, 'transcript', ?, 'pending')`
  ).run(clientId, JSON.stringify(extraction));
  return r.lastInsertRowid;
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

describe('POST /api/calls/:id/apply-to-client', () => {
  test('404 when call does not exist', async () => {
    const res = await agent.post('/api/calls/999/apply-to-client');
    expect(res.status).toBe(404);
  });

  test('400 when call has no extracted profile', async () => {
    const r = db.prepare(
      `INSERT INTO call_recordings (client_id, transcript) VALUES (1, 'hello')`
    ).run();
    const res = await agent.post(`/api/calls/${r.lastInsertRowid}/apply-to-client`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/extract first/i);
  });

  test('fills empty client.brand_profile from the extraction; tags sources', async () => {
    const callId = insertCallWithExtraction(db, 1, {
      profile: {
        business_name: 'Acme Co',
        customer_avatar: { name: 'Sarah', pain_points: ['slow leads'] },
      },
    });

    const res = await agent.post(`/api/calls/${callId}/apply-to-client`);
    expect(res.status).toBe(200);
    expect(res.body.applied_paths.sort()).toEqual(
      ['business_name', 'customer_avatar.name', 'customer_avatar.pain_points']
    );
    expect(res.body.skipped_paths).toEqual([]);

    const row = db.prepare('SELECT brand_profile, brand_profile_sources FROM clients WHERE id = 1').get();
    const profile = JSON.parse(row.brand_profile);
    const sources = JSON.parse(row.brand_profile_sources);
    expect(profile.business_name).toBe('Acme Co');
    expect(profile.customer_avatar.name).toBe('Sarah');
    expect(sources.business_name).toBe(`call:${callId}`);
  });

  test('preserves manual fields when merging a later call', async () => {
    // Pre-seed the client with a manual edit on business_name.
    db.prepare(
      `UPDATE clients SET brand_profile = ?, brand_profile_sources = ? WHERE id = 1`
    ).run(
      JSON.stringify({ business_name: 'My Chosen Name' }),
      JSON.stringify({ business_name: 'manual' }),
    );

    const callId = insertCallWithExtraction(db, 1, {
      profile: {
        business_name: 'Extracted Name',
        customer_avatar: { name: 'Sarah' },
      },
    });

    const res = await agent.post(`/api/calls/${callId}/apply-to-client`);
    expect(res.status).toBe(200);
    expect(res.body.skipped_paths).toContain('business_name');
    expect(res.body.applied_paths).toContain('customer_avatar.name');

    const row = db.prepare('SELECT brand_profile, brand_profile_sources FROM clients WHERE id = 1').get();
    const profile = JSON.parse(row.brand_profile);
    const sources = JSON.parse(row.brand_profile_sources);
    expect(profile.business_name).toBe('My Chosen Name');
    expect(profile.customer_avatar.name).toBe('Sarah');
    expect(sources.business_name).toBe('manual');
    expect(sources['customer_avatar.name']).toBe(`call:${callId}`);
  });

  test('logs an activity row noting applied / preserved counts', async () => {
    const callId = insertCallWithExtraction(db, 1, {
      profile: { business_name: 'Acme' },
    });
    await agent.post(`/api/calls/${callId}/apply-to-client`);

    const acts = db.prepare(
      "SELECT * FROM activities WHERE client_id = 1 AND type = 'system'"
    ).all();
    expect(acts.length).toBeGreaterThan(0);
    expect(acts[acts.length - 1].content).toMatch(/Applied call/);
  });

  test('honors per-path "take" choice over manual tag', async () => {
    db.prepare('UPDATE clients SET brand_profile = ?, brand_profile_sources = ? WHERE id = 1').run(
      JSON.stringify({ business_name: 'Manual Edit' }),
      JSON.stringify({ business_name: 'manual' }),
    );
    const callId = insertCallWithExtraction(db, 1, {
      profile: { business_name: 'Extracted Name' },
    });
    const res = await agent.post(`/api/calls/${callId}/apply-to-client`)
      .send({ choices: { business_name: 'take' } });
    expect(res.status).toBe(200);
    expect(res.body.applied_paths).toContain('business_name');

    const row = db.prepare('SELECT brand_profile FROM clients WHERE id = 1').get();
    expect(JSON.parse(row.brand_profile).business_name).toBe('Extracted Name');
  });

  test('honors per-path "keep" choice and locks the path as manual', async () => {
    db.prepare('UPDATE clients SET brand_profile = ?, brand_profile_sources = ? WHERE id = 1').run(
      JSON.stringify({ business_name: 'Old' }),
      JSON.stringify({ business_name: 'call:3' }),
    );
    const callId = insertCallWithExtraction(db, 1, {
      profile: { business_name: 'New' },
    });
    const res = await agent.post(`/api/calls/${callId}/apply-to-client`)
      .send({ choices: { business_name: 'keep' } });
    expect(res.status).toBe(200);
    expect(res.body.skipped_paths).toContain('business_name');

    const row = db.prepare('SELECT brand_profile, brand_profile_sources FROM clients WHERE id = 1').get();
    expect(JSON.parse(row.brand_profile).business_name).toBe('Old');
    expect(JSON.parse(row.brand_profile_sources).business_name).toBe('manual');
  });

  test('returns merged_paths for array unions', async () => {
    db.prepare('UPDATE clients SET brand_profile = ?, brand_profile_sources = ? WHERE id = 1').run(
      JSON.stringify({ customer_avatar: { pain_points: ['slow leads', 'no analytics'] } }),
      JSON.stringify({ 'customer_avatar.pain_points': 'call:3' }),
    );
    const callId = insertCallWithExtraction(db, 1, {
      profile: { customer_avatar: { pain_points: ['no analytics', 'no SEO'] } },
    });
    const res = await agent.post(`/api/calls/${callId}/apply-to-client`);
    expect(res.status).toBe(200);
    expect(res.body.merged_paths).toContain('customer_avatar.pain_points');

    const row = db.prepare('SELECT brand_profile FROM clients WHERE id = 1').get();
    const points = JSON.parse(row.brand_profile).customer_avatar.pain_points;
    expect(points.sort()).toEqual(['no SEO', 'no analytics', 'slow leads'].sort());
  });
});

describe('GET /api/calls/:id/apply-to-client/preview', () => {
  test('returns conflicts with current_source annotation', async () => {
    db.prepare('UPDATE clients SET brand_profile = ?, brand_profile_sources = ? WHERE id = 1').run(
      JSON.stringify({ business_name: 'Old', industry: 'Retail' }),
      JSON.stringify({ business_name: 'call:3', industry: 'manual' }),
    );
    const callId = insertCallWithExtraction(db, 1, {
      profile: { business_name: 'New', industry: 'Different' },
    });
    const res = await agent.get(`/api/calls/${callId}/apply-to-client/preview`);
    expect(res.status).toBe(200);
    expect(res.body.conflicts).toHaveLength(2);
    const businessConflict = res.body.conflicts.find((c) => c.path === 'business_name');
    expect(businessConflict).toEqual({
      path: 'business_name', current: 'Old', incoming: 'New', current_source: 'call:3',
    });
    const industryConflict = res.body.conflicts.find((c) => c.path === 'industry');
    expect(industryConflict.current_source).toBe('manual');
  });

  test('returns empty conflicts when nothing differs', async () => {
    db.prepare('UPDATE clients SET brand_profile = ? WHERE id = 1').run(
      JSON.stringify({ business_name: 'Acme' }),
    );
    const callId = insertCallWithExtraction(db, 1, {
      profile: { business_name: 'Acme', industry: 'Retail' },  // industry is new (not a conflict)
    });
    const res = await agent.get(`/api/calls/${callId}/apply-to-client/preview`);
    expect(res.status).toBe(200);
    expect(res.body.conflicts).toEqual([]);
  });
});
